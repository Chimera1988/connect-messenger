import { authenticatedUser,fail } from '../../../../lib/server/admin';
export const runtime='nodejs';
export async function POST(request:Request){
 try{
  const {client,user}=await authenticatedUser(request);
  const {password}=await request.json();
  if(typeof password!=='string'||!password||!user.email)throw new Error('Введите текущий пароль');
  if(user.id===process.env.CONNECT_ADMIN_USER_ID)throw new Error('Удаление аккаунта администратора отключено во избежание потери управления');
  const {error:passwordError}=await client.auth.signInWithPassword({email:user.email,password});
  if(passwordError)throw new Error('Неверный пароль');
  // The SQL migration removes the profile→auth cascade, so message history survives.
  // Tombstone the profile before removing the Auth user; no other person's messages are deleted.
  const {error:profileError}=await client.from('profiles').update({display_name:'Удалённый пользователь',bio:'',avatar_path:null,is_blocked:true,last_seen_at:null,online_until:null}).eq('id',user.id);
  if(profileError)throw profileError;
  const {error:deleteError}=await client.auth.admin.deleteUser(user.id);
  if(deleteError)throw deleteError;
  return Response.json({ok:true});
 }catch(e){return fail(e)}
}
