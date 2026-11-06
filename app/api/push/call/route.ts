import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublic = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!supabaseUrl || !publicKey || !serviceKey || !vapidPublic || !vapidPrivate || !vapidSubject)
    return NextResponse.json({ error: 'Push not configured' }, { status: 503 });

  const bearer = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const auth = createClient(supabaseUrl, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser(bearer);
  if (!user || authError) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.callId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.callId))
    return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 });

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: call } = await db.from('connect_calls')
    .select('id,caller_id,callee_id,conversation_id,status,created_at')
    .eq('id', body.callId).maybeSingle();
  if (!call || call.caller_id !== user.id || call.status !== 'ringing'
    || Date.now() - Date.parse(call.created_at) > 85000
    || Date.parse(call.created_at) > Date.now() + 10000)
    return NextResponse.json({ ignored: true });
  // Check against the actual conversation. A user must not be able to ping an arbitrary account.
  const { data: conversation } = await db.from('conversations')
    .select('user_a,user_b').eq('id', call.conversation_id).maybeSingle();
  if (!conversation || ![conversation.user_a, conversation.user_b].includes(call.caller_id)
    || ![conversation.user_a, conversation.user_b].includes(call.callee_id)
    || call.caller_id === call.callee_id)
    return NextResponse.json({ ignored: true });

  const [{ data: settings }, { data: devices }, { data: sender }] = await Promise.all([
    db.from('notification_preferences').select('enabled').eq('user_id', call.callee_id).maybeSingle(),
    db.from('push_devices').select('id,subscription').eq('user_id', call.callee_id).eq('platform', 'web'),
    db.from('profiles').select('display_name').eq('id', call.caller_id).maybeSingle(),
  ]);
  if (settings?.enabled === false || !devices?.length) return NextResponse.json({ ok: true, sent: 0 });
  // Idempotent server-side reservation: avoid duplicate notifications when several
  // caller devices observe the same Realtime INSERT.
  const { error: reserveError } = await db.from('connect_call_push_log').insert({ call_id: call.id });
  if (reserveError?.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
  if (reserveError) return NextResponse.json({ error: 'Could not reserve call notification' }, { status: 503 });
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const payload = JSON.stringify({
    kind: 'incoming-call', title: 'Входящий звонок · Connect',
    body: sender?.display_name ? `Звонит ${sender.display_name}` : 'Входящий аудиозвонок',
    callId: call.id, conversationId: call.conversation_id,
  });
  let sent = 0;
  for (const device of devices) {
    if (!device.subscription) continue;
    try {
      await webpush.sendNotification(device.subscription, payload, { TTL: 45, urgency: 'high' });
      sent++;
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) await db.from('push_devices').delete().eq('id', device.id);
      else console.warn('Call web push failed:', status || 'unknown');
    }
  }
  if (sent === 0) await db.from('connect_call_push_log').delete().eq('call_id', call.id);
  return NextResponse.json({ ok: true, sent }, { headers: { 'Cache-Control': 'no-store' } });
}
