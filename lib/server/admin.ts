import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database';

export class HttpError extends Error {
  constructor(readonly status:number, message:string) { super(message); }
}

// Claims are only used after getUser has validated this exact token.
export function verifiedSessionId(token:string,userId:string):string|null {
  try {
    const parts=token.split('.');
    if(parts.length!==3)return null;
    const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return claims.sub===userId && typeof claims.session_id==='string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(claims.session_id)
      ? claims.session_id : null;
  } catch { return null; }
}

export function adminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new HttpError(503,'Сервер авторизации не настроен');
  return createClient<Database>(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
export async function authenticatedUser(request:Request){
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token||token.length>8192)throw new HttpError(401,'Требуется авторизация');
  const client=adminClient();
  const {data,error}=await client.auth.getUser(token);
  if(error)throw new HttpError(typeof error.status!=='number'||error.status===0||error.status===429||error.status>=500?503:401,'Не удалось подтвердить сессию');
  if(!data.user)throw new HttpError(401,'Недействительная сессия');
  const sessionId=verifiedSessionId(token,data.user.id);
  if(!sessionId)throw new HttpError(401,'Недействительная сессия');
  const {data:profile,error:profileError}=await client.from('profiles').select('is_blocked').eq('id',data.user.id).maybeSingle();
  if(profileError)throw new HttpError(503,'Проверка доступа недоступна');
  if(!profile||profile.is_blocked)throw new HttpError(403,'Доступ закрыт');
  const {data:active,error:sessionError}=await client.rpc('connect_auth_session_active',{p_user_id:data.user.id,p_session_id:sessionId});
  if(sessionError)throw new HttpError(503,'Проверка сессии недоступна');
  if(active!==true)throw new HttpError(401,'Сессия завершена');
  return {client,user:data.user,sessionId};
}
export function fail(e:unknown){return Response.json({error:e instanceof Error?e.message:'Ошибка сервера'},
  {status:e instanceof HttpError?e.status:400,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});}

export async function requireRateLimit(client:SupabaseClient<Database>,userId:string,action:string,limit:number,seconds=60):Promise<void> {
  const {data,error}=await client.rpc('connect_consume_rate_limit',{p_user_id:userId,p_action:action,p_limit:limit,p_seconds:seconds});
  if(error)throw new HttpError(503,'Проверка лимита недоступна');
  if(data!==true)throw new HttpError(429,'Слишком много запросов. Повторите позже.');
}
