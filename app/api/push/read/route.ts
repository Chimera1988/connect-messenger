import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export const runtime = 'nodejs';

/** Notifies the signed-in user's own Android devices that a chat has been read. */
export async function POST(req: NextRequest) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!url || !publicKey || !serviceKey || !credentials)
    return NextResponse.json({error:'Not configured'},{status:503});
  const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({error:'Unauthorized'},{status:401});
  const auth=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user}}=await auth.auth.getUser(token);
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401});
  const body=await req.json().catch(()=>null);
  const conversationId=body?.conversationId;
  const readAt=body?.readAt;
  if (typeof conversationId!=='string' || !/^[0-9a-f-]{36}$/i.test(conversationId)
    || typeof readAt!=='string' || !Number.isFinite(Date.parse(readAt)))
    return NextResponse.json({error:'Invalid payload'},{status:400});
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:conversation},{data:state}] = await Promise.all([
    db.from('conversations').select('user_a,user_b').eq('id',conversationId).maybeSingle(),
    db.from('conversation_user_state').select('last_read_at').eq('conversation_id',conversationId)
      .eq('user_id',user.id).maybeSingle(),
  ]);
  if (!conversation || ![conversation.user_a,conversation.user_b].includes(user.id) ||
      !state?.last_read_at || Date.parse(state.last_read_at) < Date.parse(readAt))
    return NextResponse.json({ignored:true});
  const {data:devices}=await db.from('push_devices').select('id,endpoint').eq('user_id',user.id).eq('platform','android');
  if (!devices?.length)return NextResponse.json({ok:true,sent:0});
  if (!getApps().length) initializeApp({credential:cert(JSON.parse(credentials))});
  let sent=0;
  for (const device of devices) {
    if (!device.endpoint) continue;
    try {
      await getMessaging().send({token:device.endpoint,
        data:{kind:'read',conversationId,readAt:state.last_read_at},
        android:{priority:'normal',ttl:300000}});
      sent++;
    } catch(e:unknown) {
      const code=(e as {code?:string})?.code;
      if (code==='messaging/registration-token-not-registered')
        await db.from('push_devices').delete().eq('id',device.id);
      else console.warn('Read sync push failed:',code||'unknown');
    }
  }
  return NextResponse.json({ok:true,sent});
}
