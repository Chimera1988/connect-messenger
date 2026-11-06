import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(['ended', 'declined', 'missed', 'busy', 'failed']);

/** Dismisses native Android lock-screen call UI after the database call was terminated.
 * Callers and callees are authenticated; the server never trusts client-provided status.
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
    .select('id,caller_id,callee_id,conversation_id,status,created_at')
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

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccount) return NextResponse.json({ error: 'Firebase is not configured' }, { status: 503 });
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(serviceAccount)) });

  const { data: devices, error: deviceError } = await db.from('push_devices')
    .select('id,endpoint').in('user_id', [call.caller_id, call.callee_id])
    .eq('platform', 'android');
  if (deviceError) return NextResponse.json({ error: 'Device lookup failed' }, { status: 503 });

  let sent = 0;
  for (const device of devices || []) {
    if (!device.endpoint) continue;
    try {
      await getMessaging().send({
        token: device.endpoint,
        data: { kind: 'call-ended', callId: String(call.id) },
        android: { priority: 'high', ttl: 90_000 },
      });
      sent++;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')
        await db.from('push_devices').delete().eq('id', device.id);
      else console.warn('Call end push failed:', code || 'unknown');
    }
  }
  return NextResponse.json({ ok: true, sent }, { headers: { 'Cache-Control': 'no-store' } });
}
