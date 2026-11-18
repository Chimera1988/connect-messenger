import { NextRequest,NextResponse } from 'next/server';
import webpush from 'web-push';
import { authenticatedUser,fail,requireRateLimit } from '../../../../lib/server/admin';
import { validPushSubscription } from '../../../../lib/server/push-destination';

export const runtime='nodejs';
const noStore={'Cache-Control':'no-store'};
type Payload={action?:unknown;endpoint?:unknown;requestId?:unknown};
function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:noStore});}

/** Diagnostic sends ONLY to the authenticated user's matching WEB subscription. */
export async function POST(req:NextRequest){
  let context;
  try { context=await authenticatedUser(req); } catch(error) { return fail(error); }
  const {client:db,user}=context;
  try { await requireRateLimit(db,user.id,'push-diagnostic',12); } catch(error) { return fail(error); }
  const body=await req.json().catch(()=>null) as Payload|null;
  const action=body?.action,endpoint=body?.endpoint;
  if(!['status','test'].includes(String(action))||typeof endpoint!=='string'||endpoint.length<32||endpoint.length>4096||!endpoint.startsWith('https://'))
    return response({error:'Неверный запрос'},400);
  const [{data:device,error:deviceError},{data:preferences,error:prefError}]=await Promise.all([
    db.rpc('connect_push_targets',{p_user_ids:[user.id]}).eq('platform','web').eq('endpoint',endpoint).maybeSingle(),
    db.from('notification_preferences').select('enabled').eq('user_id',user.id).maybeSingle(),
  ]);
  if(deviceError||prefError)return response({error:'Не удалось проверить регистрацию'},503);
  const subscription=device?.subscription;
  const registered=validPushSubscription(subscription,endpoint),enabled=preferences?.enabled!==false;
  if(action==='status')return response({registered,enabled});
  if(!registered)return response({error:'Устройство не зарегистрировано. Подключи уведомления.'},409);
  if(!enabled)return response({error:'Уведомления отключены. Подключи их снова.'},409);
  const id=body?.requestId;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return response({error:'Неверный идентификатор проверки'},400);
  if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY||!process.env.VAPID_SUBJECT)return response({error:'Push-сервер не настроен'},503);
  try{
    webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    await webpush.sendNotification(subscription,JSON.stringify({kind:'connect-push-diagnostic',requestId:id,userId:user.id}),{TTL:30,urgency:'normal',timeout:8000});
    // This is ONLY provider acceptance; the client awaits a worker receipt.
    return response({accepted:true});
  }catch(e:unknown){
    const status=(e as {statusCode?:number})?.statusCode;
    if(status===404||status===410){await db.from('push_devices').delete().eq('id',device!.id);return response({error:'Push-подписка больше не действует. Подключи уведомления заново.'},410);}
    console.error('Connect web push diagnostic send failed',status||'transport');
    return response({error:'Push-сервер не принял тест. Повтори проверку позже.'},502);
  }
}
