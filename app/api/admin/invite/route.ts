import { randomBytes, createHash } from 'node:crypto';
import { authenticatedUser, fail } from '../../../../lib/server/admin';
export const runtime = 'nodejs';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
async function adminOnly(request: Request) {
 const { client, user } = await authenticatedUser(request);
 if (!process.env.CONNECT_ADMIN_USER_ID || user.id !== process.env.CONNECT_ADMIN_USER_ID) throw new Error('Доступно только администратору');
 return { client, user };
}
export async function GET(request: Request) {
 try {
  const { client } = await adminOnly(request);
  const { data, error } = await client.from('connect_invitation_codes').select('id,email,invite_type,created_at,expires_at,redeemed_at,revoked_at').order('created_at',{ascending:false}).limit(30);
  if(error) throw error;
  return Response.json({ admin:true, invitations:data });
 } catch(e) {return fail(e)}
}
export async function POST(request: Request) {
 try {
  const { client,user } = await adminOnly(request);
  const body = await request.json();
  const email = typeof body.email==='string' ? body.email.trim().toLowerCase() : '';
  if(email.length>254 || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Введите корректный email');
  const invite_type = body.invite_type === 'hidden' ? 'hidden' : body.invite_type === undefined || body.invite_type === 'normal' ? 'normal' : null;
  if(!invite_type)throw new Error('Неизвестный тип приглашения');
  const code = randomBytes(12).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-');
  const {error} = await client.from('connect_invitation_codes').insert({code_hash:hash(code.replace(/-/g,'')),email,created_by:user.id,invite_type});
  if(error)throw error;
  return Response.json({code,link:code,expires_in_hours:24});
 }catch(e){return fail(e)}
}
export async function DELETE(request: Request) {
 try {
  const {client}=await adminOnly(request);
  const {id}=await request.json();
  if(typeof id!=='string'|| !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Неверный ID');
  const {error}=await client.from('connect_invitation_codes').update({revoked_at:new Date().toISOString()}).eq('id',id).is('redeemed_at',null).is('revoked_at',null);
  if(error)throw error;
  return Response.json({ok:true});
 }catch(e){return fail(e)}
}
