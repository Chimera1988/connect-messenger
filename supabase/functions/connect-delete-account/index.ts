import {liveIdentity} from '../_shared/auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function reply(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return reply({ error: 'Unauthorized' }, 401);

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return reply({ error: 'Invalid JSON' }, 400); }
  if (!payload || typeof payload !== 'object' ||
      (payload as Record<string, unknown>).confirm !== 'DELETE_MY_ACCOUNT') {
    return reply({ error: 'Explicit account deletion confirmation required' }, 422);
  }
  // The caller cannot specify the target user id.
  if ('user_id' in payload || 'account_id' in payload || 'id' in payload) {
    return reply({ error: 'Target user selection is prohibited' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return reply({ error: 'Server is not configured' }, 503);

  const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  let user;try{user=await liveIdentity(admin,token);}catch{return reply({error:'Authorization unavailable'},503);}
  if(!user)return reply({error:'Unauthorized'},401);
  if(user.id===Deno.env.get('CONNECT_ADMIN_USER_ID'))return reply({error:'Administrator deletion disabled'},403);
  const password=(payload as Record<string,unknown>).password;
  if(typeof password!=='string'||!password||!user.email)return reply({error:'Current password required'},422);
  const budget=await admin.rpc('connect_consume_rate_limit',{p_user_id:user.id,p_action:'account-delete',p_limit:3,p_seconds:3600});
  if(budget.error)return reply({error:'Authorization unavailable'},503);if(!budget.data)return reply({error:'Too many attempts'},429);
  const verifier=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const verification=await verifier.auth.signInWithPassword({email:user.email,password});
  if(verification.error||verification.data.user?.id!==user.id)return reply({error:'Wrong password'},403);
  await verifier.auth.signOut({scope:'local'});
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, false);
  if (deleteError) {
    console.error('Connect account deletion unsuccessful:', deleteError.code ?? 'auth_error');
    return reply({ error: 'Account deletion failed; no deletion acknowledged' }, 503);
  }
  return reply({ deleted: true, database_cleanup: 'completed', storage_cleanup: 'queued_for_daily_gc' });
});

