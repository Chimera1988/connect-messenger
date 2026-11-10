import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];
const NO_STORE = { 'Cache-Control': 'private, no-store' };
const TURNIX_ENDPOINT = 'https://turnix.io/api/v1/credentials/ice';

type IceCandidate = { urls: string | string[]; username?: string; credential?: string };

/** Only forward validated ICE server details, never the server-side API token. */
function parseTurnixServers(value: unknown): RTCIceServer[] {
  if (!value || typeof value !== 'object') return [];
  const incoming = (value as { iceServers?: unknown }).iceServers;
  if (!Array.isArray(incoming) || incoming.length > 12) return [];
  const result: RTCIceServer[] = [];
  for (const item of incoming) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<IceCandidate>;
    const candidates = typeof entry.urls === 'string' ? [entry.urls] : entry.urls;
    if (!Array.isArray(candidates) || candidates.length > 12) continue;
    const valid = candidates.filter((url): url is string => typeof url === 'string' &&
      url.length < 2048 && /^(?:stun|stuns|turn|turns):[^\s]+$/i.test(url));
    if (!valid.length) continue;
    const isRelay = valid.some(url => /^turns?:/i.test(url));
    if (isRelay) {
      if (typeof entry.username !== 'string' || !entry.username || entry.username.length > 512 ||
          typeof entry.credential !== 'string' || !entry.credential || entry.credential.length > 512) continue;
      result.push({ urls: valid, username: entry.username, credential: entry.credential });
    } else result.push({ urls: valid });
  }
  // STUN-only responses are not a functional TURN relay configuration.
  return result.some(server => server.username && server.credential) ? result : [];
}

/** Coturn remains an optional fallback for existing users and deployments. */
function legacyTurn(userId: string): RTCIceServer[] {
  const urls = process.env.CONNECT_TURN_URLS?.split(',').map(url => url.trim()).filter(Boolean) ?? [];
  const secret = process.env.CONNECT_TURN_SHARED_SECRET;
  if (!secret || !urls.some(url => /^turns?:[^\s]+$/i.test(url))) return [];
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const username = `${expires}:${userId}`;
  return [{ urls, username, credential: createHmac('sha1', secret).update(username).digest('base64') }];
}

/** Fetch temporary TURN credentials for each authenticated call attempt. */
async function turnixTurn(userId: string, req: NextRequest): Promise<RTCIceServer[]> {
  const apiToken = process.env.TURNIX_API_TOKEN?.trim();
  if (!apiToken) return [];
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };
    // Vercel sets this trusted edge header; do not forward a client-supplied X-Forwarded-For.
    const candidate = req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ?? '';
    if (isIP(candidate)) headers['X-TURN-CLIENT-IP'] = candidate;
    const opaqueUser = 'u_' + createHash('sha256').update(userId).digest('hex').slice(0,24);
    const response = await fetch(TURNIX_ENDPOINT, {
      method: 'POST', headers,
      body: JSON.stringify({ ttl: 3600, initiator_client: opaqueUser }),
      signal: AbortSignal.timeout(8000), cache: 'no-store',
    });
    if (!response.ok) {
      // 401: bad token; 429: free-tier traffic limit. Do not expose vendor response or bearer token.
      console.warn('Connect TURN: provider rejected credentials request', response.status);
      return [];
    }
    const servers = parseTurnixServers(await response.json());
    if (!servers.length) console.warn('Connect TURN: no usable relay credentials received');
    return servers;
  } catch {
    console.warn('Connect TURN: temporary credentials request unavailable');
    return [];
  }
}

/** Shared by the native APK and PWA; neither receives the Turnix API token. */
export async function GET(req: NextRequest) {
  const authToken = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!authToken || !url || !key)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: { user }, error } = await sb.auth.getUser(authToken);
  if (error || !user)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });

  const managed = await turnixTurn(user.id, req);
  const activeRelay = managed.length ? managed : legacyTurn(user.id);
  return NextResponse.json(
    { iceServers: [...BASE_ICE, ...activeRelay], relayConfigured: activeRelay.length > 0 },
    { headers: NO_STORE },
  );
}
