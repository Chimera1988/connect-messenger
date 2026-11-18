import { cert,getApps,initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NextRequest,NextResponse } from 'next/server';
import { authenticatedUser,fail,requireRateLimit } from '../../../../lib/server/admin';

export const runtime = 'nodejs';

/** Notifies the signed-in user's own Android devices that a chat has been read. */
export async function POST(req: NextRequest) {
  let context;
  try { context=await authenticatedUser(req); } catch(error) { return fail(error); }
  const {client:db,user}=context;
  const credentials=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!credentials)return NextResponse.json({error:'Not configured'},{status:503});
  try { await requireRateLimit(db,user.id,'read-push',240); } catch(error) { return fail(error); }
  const body=await req.json().catch(()=>null);
  const conversationId=body?.conversationId;
  const readAt=body?.readAt;
  if (typeof conversationId!=='string' || !/^[0-9a-f-]{36}$/i.test(conversationId)
    || typeof readAt!=='string' || !Number.isFinite(Date.parse(readAt)))
    return NextResponse.json({error:'Invalid payload'},{status:400});
  const [{data:conversation},{data:state}] = await Promise.all([
    db.from('conversations').select('user_a,user_b').eq('id',conversationId).maybeSingle(),
    db.from('conversation_user_state').select('last_read_at').eq('conversation_id',conversationId)
      .eq('user_id',user.id).maybeSingle(),
  ]);
  if (!conversation || ![conversation.user_a,conversation.user_b].includes(user.id) ||
      !state?.last_read_at || Date.parse(state.last_read_at) < Date.parse(readAt))
    return NextResponse.json({ignored:true});
  const {data:devices}=await db.rpc('connect_push_targets',{p_user_ids:[user.id]}).eq('platform','android');
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
