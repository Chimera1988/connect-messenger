import { createHash } from 'node:crypto';
import { adminClient,fail } from '../../../../lib/server/admin';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const {code,password}=await request.json();
  if(typeof code!=='string'||typeof password!=='string'||password.length<8||password.length>128)throw new Error('Проверьте код и пароль (от 8 до 128 символов)');
  const normalized=code.replace(/-/g,'').trim().toUpperCase();
  if(!/^[0-9A-F]{24}$/.test(normalized))throw new Error('Неверный код');
  const client=adminClient();
  const codeHash=createHash('sha256').update(normalized).digest('hex');
  const {data:invite,error}=await client.from('connect_invitation_codes').select('id,email').eq('code_hash',codeHash).is('redeemed_at',null).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
  if(error)throw error;
  if(!invite)return Response.json({error:'Код недействителен, использован или истёк'},{status:400});
  // Atomically claim the code before creating the account. Concurrent attempts cannot both succeed.
  const {data:claimed,error:claimError}=await client.from('connect_invitation_codes').update({redeemed_at:new Date().toISOString()}).eq('id',invite.id).is('redeemed_at',null).is('revoked_at',null).gt('expires_at',new Date().toISOString()).select('id').maybeSingle();
  if(claimError)throw claimError;
  if(!claimed)return Response.json({error:'Этот код уже использован'},{status:409});
  const {data:created,error:createError}=await client.auth.admin.createUser({email:invite.email,password,email_confirm:true});
  if(createError||!created.user){
   // A claimed code remains spent if account creation fails; admin can issue a fresh code.
   throw new Error(createError?.message||'Не удалось создать пользователя');
  }
  await client.from('connect_invitation_codes').update({redeemed_by:created.user.id}).eq('id',invite.id);
  return Response.json({ok:true,email:invite.email});
 }catch(e){return fail(e)}
}
