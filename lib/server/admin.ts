import { createClient } from '@supabase/supabase-js';

export function adminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Настройте SUPABASE_SERVICE_ROLE_KEY в Vercel');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
export async function authenticatedUser(request:Request){
  const token=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)throw new Error('Требуется авторизация');
  const client=adminClient();
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)throw new Error('Недействительная сессия');
  const {data:profile}=await client.from('profiles').select('is_blocked').eq('id',data.user.id).maybeSingle();
  if(!profile||profile.is_blocked)throw new Error('Доступ закрыт');
  return {client,user:data.user};
}
export function fail(e:unknown){return Response.json({error:e instanceof Error?e.message:'Ошибка сервера'},{status:400});}
