import { authenticatedUser,fail } from '../../../../lib/server/admin';
export const runtime='nodejs';
async function check(request:Request){
 const {client,user}=await authenticatedUser(request);
 const adminId=process.env.CONNECT_ADMIN_USER_ID;
 if(!adminId)throw new Error('Настройте CONNECT_ADMIN_USER_ID в Vercel');
 return {client,admin:user.id===adminId};
}
export async function GET(request:Request){try{const {admin}=await check(request);return Response.json({admin})}catch(e){return fail(e)}}
export async function POST(request:Request){
 try{
  const {client,admin}=await check(request);
  if(!admin)return Response.json({error:'Только администратор может приглашать'},{status:403});
  const {email}=await request.json();
  if(typeof email!=='string'||email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Введите корректный email');
  const origin=new URL(request.url).origin;
  const {data,error}=await client.auth.admin.generateLink({type:'invite',email:email.trim().toLowerCase(),options:{redirectTo:origin}});
  if(error||!data.properties?.action_link)throw new Error(error?.message||'Не удалось создать приглашение');
  return Response.json({link:data.properties.action_link});
 }catch(e){return fail(e)}
}
