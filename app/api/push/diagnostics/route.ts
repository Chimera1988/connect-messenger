import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import webpush from 'web-push';

export const runtime='nodejs';
const noStore={'Cache-Control':'no-store'};
type Payload={action?:unknown;endpoint?:unknown;requestId?:unknown};
function response(body:Record<string,unknown>,status=200){return NextResponse.json(body,{status,headers:noStore});}

/** Diagnostic sends ONLY to the authenticated user's matching WEB subscription. */
export async function POST(req:NextRequest){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!pub||!secret)return response({error:'Сервер регистрации не настроен'},503);
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return response({error:'Требуется вход в Connect'},401);
  const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(token);
  if(authError||!user)return response({error:'Недействительная сессия'},401);
  const body=await req.json().catch(()=>null) as Payload|null;
  const action=body?.action,endpoint=body?.endpoint;
  if(!['status','test'].includes(String(action))||typeof endpoint!=='string'||endpoint.length<32||endpoint.length>4096||!endpoint.startsWith('https://'))
    return response({error:'Неверный запрос'},400);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:device,error:deviceError},{data:preferences,error:prefError}]=await Promise.all([
    db.from('push_devices').select('id,subscription').eq('user_id',user.id).eq('platform','web').eq('endpoint',endpoint).maybeSingle(),
    db.from('notification_preferences').select('enabled').eq('user_id',user.id).maybeSingle(),
  ]);
  if(deviceError||prefError)return response({error:'Не удалось проверить регистрацию'},503);
  const registered=Boolean(device?.subscription),enabled=preferences?.enabled!==false;
  if(action==='status')return response({registered,enabled});
  if(!registered)return response({error:'Устройство не зарегистрировано. Подключи уведомления.'},409);
  if(!enabled)return response({error:'Уведомления отключены. Подключи их снова.'},409);
  const id=body?.requestId;
  if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return response({error:'Неверный идентификатор проверки'},400);
  if(!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY||!process.env.VAPID_SUBJECT)return response({error:'Push-сервер не настроен'},503);
  try{
    webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    await webpush.sendNotification(device!.subscription,JSON.stringify({kind:'connect-push-diagnostic',requestId:id,userId:user.id}),{TTL:30,urgency:'normal',timeout:8000});
    // This is ONLY provider acceptance; the client awaits a worker receipt.
    return response({accepted:true});
  }catch(e:unknown){
    const status=(e as {statusCode?:number})?.statusCode;
    if(status===404||status===410){await db.from('push_devices').delete().eq('id',device!.id);return response({error:'Push-подписка больше не действует. Подключи уведомления заново.'},410);}
    console.error('Connect web push diagnostic send failed',status||'transport');
    return response({error:'Push-сервер не принял тест. Повтори проверку позже.'},502);
  }
}
