import { cert,getApps,initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest,NextResponse } from 'next/server';
import webpush from 'web-push';
import { authenticatedUser,fail,requireRateLimit } from '../../../../lib/server/admin';
import { validPushSubscription } from '../../../../lib/server/push-destination';
import { canReach } from '../../../../lib/server/visibility';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let context;
  try { context=await authenticatedUser(req); } catch(error) { return fail(error); }
  const {client:db,user}=context;
  try { await requireRateLimit(db,user.id,'call-push',60); } catch(error) { return fail(error); }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.callId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.callId))
    return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 });

  const { data: call } = await db.from('connect_calls')
    .select('id,caller_id,callee_id,conversation_id,status,created_at')
    .eq('id', body.callId).maybeSingle();
  if (!call || call.caller_id !== user.id || call.status !== 'ringing'
    || Date.now() - Date.parse(call.created_at) > 85000
    || Date.parse(call.created_at) > Date.now() + 10000)
    return NextResponse.json({ ignored: true });

  const { data: conversation } = await db.from('conversations')
    .select('user_a,user_b').eq('id', call.conversation_id).maybeSingle();
  if (!conversation || ![conversation.user_a, conversation.user_b].includes(call.caller_id)
    || ![conversation.user_a, conversation.user_b].includes(call.callee_id)
    || call.caller_id === call.callee_id)
    return NextResponse.json({ ignored: true });

  if(!await canReach(db,call.caller_id,call.callee_id)) return NextResponse.json({ignored:true});
  const [{ data: settings }, { data: devices }, { data: sender }] = await Promise.all([
    db.from('notification_preferences').select('enabled').eq('user_id', call.callee_id).maybeSingle(),
    db.rpc('connect_push_targets',{p_user_ids:[call.callee_id]}),
    db.from('profiles').select('display_name').eq('id', call.caller_id).maybeSingle(),
  ]);
  if (settings?.enabled === false || !devices?.length) return NextResponse.json({ ok: true, sent: 0 });
  const androidReady=Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const webReady=Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
  if(!devices.some(d=>d.platform==='android'?androidReady&&d.endpoint:d.platform==='web'&&webReady&&d.subscription)){
    console.warn('ConnectCall',{callId:call.id,stage:'push',code:'TRANSPORT_NOT_CONFIGURED'});
    return NextResponse.json({error:'Call push transport is not configured',sent:0},{status:503,headers:{'Cache-Control':'no-store'}});
  }

  // A call may be observed by several active clients. Send the push only once.
  const { error: reservationError } = await db.from('connect_call_push_log').insert({ call_id: call.id });
  if (reservationError?.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
  if (reservationError) return NextResponse.json({ error: 'Could not reserve notification' }, { status: 503 });

  const title = 'Входящий аудиозвонок · Connect';
  const message = sender?.display_name ? `Звонит ${sender.display_name}` : 'Входящий аудиозвонок';
  const payload = {
    kind: 'incoming-call', title, body: message,userId:String(call.callee_id),
    callerName: String(sender?.display_name || 'Собеседник'),
    callId: String(call.id), conversationId: String(call.conversation_id),
  };
  const vapidReady = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
  let sent = 0;
  // A stalled browser subscription must not delay Android's high-priority FCM.
  // Devices are independent; receiver-side callId ownership handles redelivery.
  const targets=[...devices].sort((a,b)=>Number(b.platform==='android')-Number(a.platform==='android'));let cursor=0;
  const deliver=async(device:(typeof targets)[number])=>{
    for(let attempt=0;attempt<2;attempt++) {
      try {
        if (device.platform === 'web') {
          if(!validPushSubscription(device.subscription,device.endpoint))return;
          if (!vapidReady || !device.subscription) return;
          webpush.setVapidDetails(process.env.VAPID_SUBJECT!,process.env.VAPID_PUBLIC_KEY!,process.env.VAPID_PRIVATE_KEY!);
          await webpush.sendNotification(device.subscription, JSON.stringify(payload), { TTL:45, urgency:'high', timeout:6000 });
        } else if (device.platform === 'android') {
          const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
          if (!credentials || !device.endpoint) return;
          if (!getApps().length) initializeApp({credential:cert(JSON.parse(credentials))});
          await getMessaging().send({token:device.endpoint,data:payload,android:{priority:'high',ttl:45000}});
        } else return;
        sent++;return;
      } catch(e:unknown) {
        const status=(e as {statusCode?:number})?.statusCode;
        const code=(e as {code?:string})?.code;
        if(status===404||status===410||code==='messaging/registration-token-not-registered') {
          await db.from('push_devices').delete().eq('id',device.id);return;
        }
        console.warn('ConnectCall',{callId:call.id,stage:'push',code:status?'HTTP_'+status:typeof code==='string'?code.replace(/[^a-zA-Z0-9_/-]/g,'').slice(0,80):'TRANSPORT_ERROR'});
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(4,targets.length)},async()=>{while(cursor<targets.length){const device=targets[cursor++];await deliver(device);}}));
  if (sent === 0) await db.from('connect_call_push_log').delete().eq('call_id', call.id);
  console.info('ConnectCall',{callId:call.id,stage:'push',sent,targets:devices.length});
  return NextResponse.json({ ok: true, sent }, { headers: { 'Cache-Control': 'no-store' } });
}
