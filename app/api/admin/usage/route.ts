import {authenticatedUser} from '../../../../lib/server/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body:unknown,status=200):Response {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store, private', 'X-Content-Type-Options':'nosniff'}});
}

function sessionIdFromVerifiedToken(token:string, userId:string):string|null {
  try {
    const pieces=token.split('.');
    if(pieces.length!==3 || pieces[1].length>8192)return null;
    const claims=JSON.parse(Buffer.from(pieces[1],'base64url').toString('utf8'));
    const id=claims?.session_id;
    return claims?.sub===userId && typeof id==='string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
  } catch{return null;}
}

export async function GET(request:Request):Promise<Response> {
  const adminId=process.env.CONNECT_ADMIN_USER_ID;
  if(!adminId)return json({error:'Администратор не настроен'},503);
  try {
    // Auth validates signature and user first; parsed session_id is only an index
    // into auth.sessions, which the SQL function checks before reading statistics.
    const {client,user}=await authenticatedUser(request);
    if(user.id!==adminId)return json({error:'Доступ запрещён'},403);
    const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    const sessionId=token?sessionIdFromVerifiedToken(token,user.id):null;
    if(!sessionId)return json({error:'Войдите в Connect повторно'},401);
    const {data,error}=await client.rpc('connect_admin_usage_snapshot', {p_user_id:user.id,p_session_id:sessionId});
    if(error){
      // Never expose SQL error details or any server-side credentials.
      if(error.code==='28000')return json({error:'Сессия завершена. Войдите повторно.'},401);
      console.error('Connect admin usage: aggregate unavailable',error.code||'SQL_ERROR');
      return json({error:'Данные хранилища пока недоступны'},503);
    }
    if(!data || !Array.isArray(data.buckets))return json({error:'Неполный ответ статистики'},503);
    return json({
      checkedAt:new Date().toISOString(),
      databaseBytes:Number(data.databaseBytes)||0,
      storageBytes:Number(data.storageBytes)||0,
      storageFiles:Number(data.storageFiles)||0,
      monthStoredBytes:Number(data.monthStoredBytes)||0,
      buckets:data.buckets.map((b:{id:unknown;bytes:unknown;files:unknown;monthBytes:unknown})=>({
        id:String(b.id),bytes:Number(b.bytes)||0,files:Number(b.files)||0,monthBytes:Number(b.monthBytes)||0,
      })),
      traffic:{egressBytes:null,cachedEgressBytes:null,source:'supabase-usage-dashboard'},
    });
  }catch{
    return json({error:'Не удалось подтвердить сессию'},401);
  }
}
