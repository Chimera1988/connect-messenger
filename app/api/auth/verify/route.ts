import { adminClient } from '../../../../lib/server/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const noStore={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'};
const json=(body:object,status=200)=>Response.json(body,{status,headers:noStore});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Decode only *after* Supabase Auth has validated the signature of this exact JWT.
function sessionIdFromAuthenticatedToken(token:string,userId:string):string|null {
  try{
    const parts=token.split('.');
    if(parts.length!==3)return null;
    const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return payload?.sub===userId && typeof payload.session_id==='string' && uuid.test(payload.session_id)
      ? payload.session_id : null;
  }catch{return null;}
}

export async function GET(request:Request):Promise<Response>{
  const auth=/^Bearer ([^\s]+)$/.exec(request.headers.get('authorization')||'');
  if(!auth||auth[1].length>8192)return json({ok:false,error:'Требуется авторизация'},401);
  try{
    const client=adminClient();
    const {data:{user},error:identityError}=await client.auth.getUser(auth[1]);
    if(identityError){
      // Failure to reach Auth is not proof that the session was revoked.
      return json({ok:false,error:'Ошибка проверки авторизации'},
        typeof identityError.status !== 'number' || identityError.status===0 || identityError.status>=500 ? 503 : 401);
    }
    if(!user)return json({ok:false,error:'Сессия недействительна'},401);
    const id=sessionIdFromAuthenticatedToken(auth[1],user.id);
    if(!id)return json({ok:false,error:'Сессия недействительна'},401);
    const {data:profile,error:profileError}=await client.from('profiles').select('is_blocked').eq('id',user.id).maybeSingle();
    if(profileError)return json({ok:false,error:'Ошибка проверки доступа'},503);
    if(!profile||profile.is_blocked)return json({ok:false,error:'Доступ закрыт'},403);
    const {data:valid,error}=await client.rpc('connect_auth_session_active',{
      p_user_id:user.id,p_session_id:id,
    });
    if(error){
      console.error('Connect auth session verification failed:',error.code||'RPC_ERROR');
      return json({ok:false,error:'Ошибка проверки сессии'},503);
    }
    if(valid!==true)return json({ok:false,error:'Сессия завершена'},401);
    return json({ok:true,userId:user.id,isAdmin:user.id===process.env.CONNECT_ADMIN_USER_ID});
  }catch{
    return json({ok:false,error:'Сервер авторизации недоступен'},503);
  }
}
