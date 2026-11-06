import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
export const runtime = 'nodejs';
export async function POST(req:NextRequest) {
  const expected=process.env.PUSH_WEBHOOK_SECRET;
  if (!expected || req.headers.get('x-connect-webhook-secret') !== expected) return NextResponse.json({error:'Forbidden'}, {status:403});
  const body=await req.json().catch(()=>null);
  const record=body?.record;
  if (body?.type !== 'INSERT' || body?.table !== 'messages' || !record?.id || !record?.conversation_id || !record?.sender_id) return NextResponse.json({ignored:true});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url||!secret) return NextResponse.json({error:'Not configured'}, {status:503});
  const db=createClient(url,secret,{auth:{persistSession:false}});
  const {data:conv}=await db.from('conversations').select('user_a,user_b').eq('id',record.conversation_id).maybeSingle();
  if (!conv || ![conv.user_a,conv.user_b].includes(record.sender_id)) return NextResponse.json({ignored:true});
  const recipient=conv.user_a===record.sender_id?conv.user_b:conv.user_a;
  const [{data:devices},{data:prefs},{data:sender}] = await Promise.all([
    db.from('push_devices').select('id,platform,endpoint,subscription').eq('user_id',recipient),
    db.from('notification_preferences').select('enabled').eq('user_id',recipient).maybeSingle(),
    db.from('profiles').select('display_name').eq('id',record.sender_id).maybeSingle()
  ]);
  if (prefs?.enabled===false || !devices?.length) return NextResponse.json({ok:true,sent:0});
  const title=sender?.display_name || 'Connect';
  // Avoid exposing private message text in server logs and push payload.
  const payload=JSON.stringify({title,body:'Новое сообщение',conversationId:record.conversation_id,messageId:record.id});
  let sent=0;
  for (const device of devices) {
    try {
      if (device.platform==='web') {
        if (!process.env.VAPID_PUBLIC_KEY||!process.env.VAPID_PRIVATE_KEY||!process.env.VAPID_SUBJECT||!device.subscription) continue;
        webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
        await webpush.sendNotification(device.subscription,payload);
      } else {
        const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
        if (!credentials) continue;
        if (!getApps().length) initializeApp({credential:cert(JSON.parse(credentials))});
        await getMessaging().send({token:device.endpoint,data:{title,body:'Новое сообщение',conversationId:String(record.conversation_id),messageId:String(record.id),createdAt:String(record.created_at||"")}});
      }
      sent++;
    } catch(e:unknown) {
      const status=(e as {statusCode?:number,code?:string})?.statusCode;
      const code=(e as {code?:string})?.code;
      if (status===404||status===410||code==='messaging/registration-token-not-registered') await db.from('push_devices').delete().eq('id',device.id);
      else console.error('Push delivery failed',device.platform, status||code||'unknown');
    }
  }
  return NextResponse.json({ok:true,sent});
}
