import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import webpush from 'web-push';
import { isMissedIncomingCall } from '../../../../../lib/call-missed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(['ended', 'declined', 'missed', 'busy', 'failed']);

/** Dispatch call closure to all devices and a durable missed alert to the callee.
 * Never trust an unverified client state. The database determines outcome.
 * The caller is the only permitted sender of a missed alert (not a callee decline).
 * Device-side notification IDs are stable per call to collapse duplicate requests.
 */
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publicKey || !serviceKey) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(bearer);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const callId = body?.callId;
  if (typeof callId !== 'string' || !uuid.test(callId))
    return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 });

  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: call } = await db.from('connect_calls')
    .select('id,caller_id,callee_id,conversation_id,status,created_at,answered_at,ended_at')
    .eq('id', callId).maybeSingle();
  if (!call || ![call.caller_id, call.callee_id].includes(user.id) || !terminal.has(call.status)
      || Date.now() - Date.parse(call.created_at) > 10 * 60_000) {
    return NextResponse.json({ ignored: true });
  }

  const { data: conversation } = await db.from('conversations').select('user_a,user_b')
    .eq('id', call.conversation_id).maybeSingle();
  if (!conversation || ![conversation.user_a, conversation.user_b].includes(call.caller_id)
      || ![conversation.user_a, conversation.user_b].includes(call.callee_id)
      || call.caller_id === call.callee_id)
    return NextResponse.json({ ignored: true });

  const missed = user.id === call.caller_id && isMissedIncomingCall(call, call.callee_id);
  const [{ data: devices, error: deviceError }, { data: prefs }, { data: caller }] = await Promise.all([
    db.from('push_devices').select('id,user_id,platform,endpoint,subscription')
      .in('user_id', [call.caller_id, call.callee_id]),
    db.from('notification_preferences').select('enabled').eq('user_id', call.callee_id).maybeSingle(),
    missed ? db.from('profiles').select('display_name').eq('id', call.caller_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (deviceError) return NextResponse.json({ error: 'Device lookup failed' }, { status: 503 });

  const firebase = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const vapid = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT;
  if (firebase && !getApps().length) initializeApp({ credential: cert(JSON.parse(firebase)) });
  if (vapid) webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const title = 'Пропущенный аудиозвонок · Connect';
  const callerName = typeof caller?.display_name === 'string' && caller.display_name.trim()
    ? caller.display_name.trim().slice(0, 120) : 'Собеседник';
  const alert = {
    kind: 'missed-call', callId: String(call.id), conversationId: String(call.conversation_id),
    userId: String(call.callee_id), endedAt: String(call.ended_at || call.created_at),
    title, body: `Неотвеченный звонок · ${callerName}`,
  };
  let endedSent = 0;
  let missedSent = 0;
  // Independent deliveries: slow Web Push must not prevent Android call dismissal.
  const targets = (devices || []).sort((a, b) => Number(b.platform === 'android') - Number(a.platform === 'android'));
  let cursor = 0;
  const deliver = async (device: typeof targets[number]) => {
    const wantsMissed = missed && prefs?.enabled !== false && device.user_id === call.callee_id;
    if (device.platform === 'android' && device.endpoint && firebase) {
      try {
        await getMessaging().send({ token: device.endpoint,
          data: { kind: 'call-ended', callId: String(call.id) },
          android: { priority: 'high', ttl: 90_000 } });
        endedSent++;
      } catch (e: unknown) {
        const code = (e as {code?: string})?.code;
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          await db.from('push_devices').delete().eq('id', device.id); return;
        }
        console.warn('Connect call-end push:', code || 'unknown');
      }
      if (wantsMissed) {
        try {
          await getMessaging().send({ token: device.endpoint, data: alert,
            android: { priority: 'high', ttl: 86_400_000 } });
          missedSent++;
        } catch (e: unknown) { console.warn('Connect missed Android push:', (e as {code?: string})?.code || 'unknown'); }
      }
    } else if (device.platform === 'web' && device.subscription && vapid) {
      try {
        await webpush.sendNotification(device.subscription, JSON.stringify({kind: 'call-ended', callId: call.id}),
          { TTL: 90, urgency: 'high', timeout: 6000 });
        endedSent++;
      } catch (e: unknown) {
        const status = (e as {statusCode?: number})?.statusCode;
        if (status === 404 || status === 410) {
          await db.from('push_devices').delete().eq('id', device.id); return;
        }
        console.warn('Connect call-end Web Push:', status || 'unknown');
      }
      if (wantsMissed) {
        try {
          await webpush.sendNotification(device.subscription, JSON.stringify(alert),
            { TTL: 86400, urgency: 'high', timeout: 6000 });
          missedSent++;
        } catch (e: unknown) { console.warn('Connect missed Web Push:', (e as {statusCode?: number})?.statusCode || 'unknown'); }
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(4, targets.length)}, async () => {
    while (cursor < targets.length) await deliver(targets[cursor++]);
  }));
  return NextResponse.json({ ok: true, endedSent, missedSent },
    { headers: { 'Cache-Control': 'no-store' } });
}
