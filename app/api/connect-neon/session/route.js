import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { parseNeonSession, sessionHash } from '../../../../lib/connect-neon-live-guards.cjs';
import { parseSessionCookie, sessionCookie, clearedSessionCookie } from '../../../../lib/connect-neon-live-cookie.cjs';
import { sessionUser, json } from '../../../../lib/connect-neon-live-session.cjs';
export const runtime='nodejs';
export async function POST(request) {
  try {
    const auth = /^Bearer (\S+)$/.exec(request.headers.get('authorization')||'');
    if (!auth || auth[1].length>4096) return json({error:'Unauthorized'},401);
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url||!key) return json({error:'Authentication unavailable'},503);
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error}=await client.auth.getUser(auth[1]);
    if(error||!user) return json({error:'Unauthorized'},401);
    const db=getPool();
    const found=await db.query('SELECT id FROM connect_backup.profiles WHERE id=$1 AND is_blocked=false',[user.id]);
    if(found.rowCount!==1) return json({error:'Account not active in Neon'},403);
    const count=await db.query(`SELECT count(*)::integer AS n FROM connect_backup.client_sessions
      WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now()`,[user.id]);
    if(count.rows[0].n>=10) return json({error:'Maximum number of sessions reached'},429);
    const raw=randomBytes(32).toString('base64url'),expiresAt=new Date(Date.now()+7*86400000).toISOString();
    await db.query('INSERT INTO connect_backup.client_sessions(token_hash,user_id,expires_at) VALUES ($1,$2,$3)',[sessionHash(raw),user.id,expiresAt]);
    const res=json({ok:true,expiresAt,mode:'neon-main-read-only'});
    res.headers.set('Set-Cookie',sessionCookie(raw));
    return res;
  } catch { return json({error:'Unable to create Neon session'},503); }
}
export async function GET(request) {
  try { const userId=await sessionUser(request); return userId?json({active:true,userId,mode:'neon-main-read-only'}):json({active:false},401); }
  catch {return json({error:'Neon unavailable'},503);}
}
export async function DELETE(request) {
  const origin=request.headers.get('origin');
  if(origin && origin !== new URL(request.url).origin) return json({error:'Origin refused'},403);
  try {
    const token=parseNeonSession(request.headers.get('authorization'))||parseSessionCookie(request.headers.get('cookie'));
    if(token){await getPool().query('DELETE FROM connect_backup.client_sessions WHERE token_hash=$1',[sessionHash(token)]);}
    const res=json({revoked:true});res.headers.set('Set-Cookie',clearedSessionCookie());return res;
  }catch{return json({error:'Could not revoke session'},503);}
}
