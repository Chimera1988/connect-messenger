import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Coturn REST API compatible, temporary TURN credentials. No TURN secret leaks to the bundle. */
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const iceServers: RTCIceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];
  const turnUrls = process.env.CONNECT_TURN_URLS?.split(',').map(v => v.trim()).filter(Boolean) ?? [];
  const secret = process.env.CONNECT_TURN_SHARED_SECRET;
  if (turnUrls.length && secret) {
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const username = `${expires}:${user.id}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    iceServers.push({ urls: turnUrls, username, credential });
  }
  return NextResponse.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}
