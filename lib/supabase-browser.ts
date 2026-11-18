import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
// On the alternate DuckDNS domain, send Supabase HTTP traffic through Vercel.
// Keep the original Supabase URL for Realtime WebSockets and the primary domain.
export const useSupabaseProxy = typeof window !== 'undefined' && window.location.hostname === 'connect-chat.duckdns.org';
export const supabaseFetch: typeof fetch = (input, init) => {
  const original = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const proxied = useSupabaseProxy && original.startsWith(supabaseUrl + '/')
    ? window.location.origin + '/supabase/' + original.slice(supabaseUrl.length + 1)
    : original;
  // Preserve headers, method and body when the SDK passes a Request object.
  return fetch(input instanceof Request ? new Request(proxied, input) : proxied, init);
};
// Signed media URLs are used directly by <img>, <audio>, <video> and fetch().
// The SDK custom fetch cannot intercept those browser requests, so route them
// through the same-origin Vercel proxy on the DuckDNS domain as well.
export function mediaUrl(url: string): string {
  if (!useSupabaseProxy || !url) return url;
  try {
    const parsed = new URL(url);
    const base = new URL(supabaseUrl);
    const storageHost = base.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
    if (parsed.hostname === base.hostname) {
      return window.location.origin + '/supabase' + parsed.pathname + parsed.search + parsed.hash;
    }
    if (parsed.hostname === storageHost) {
      return window.location.origin + '/supabase-storage' + parsed.pathname + parsed.search + parsed.hash;
    }
  } catch { /* Preserve unexpected URLs without breaking rendering. */ }
  return url;
}


let client:SupabaseClient<Database>|null|undefined;
export function browserSupabase():SupabaseClient<Database>|null {
 if(client===undefined)client=supabaseUrl&&supabaseKey?createClient<Database>(supabaseUrl,supabaseKey,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true},global:{fetch:supabaseFetch}}):null;
 return client;
}
