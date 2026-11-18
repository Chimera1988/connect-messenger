import { NextRequest,NextResponse } from 'next/server';
import { authenticatedUser,fail } from '../../../../lib/server/admin';
import { validPushSubscription } from '../../../../lib/server/push-destination';
export const runtime = 'nodejs';
const noStore={'Cache-Control':'no-store, private'};
export async function POST(req: NextRequest) {
  try {
    const {client:db,user,sessionId}=await authenticatedUser(req);
    const body=await req.json().catch(()=>null);
    if(!body||!['web','android'].includes(body.platform)||typeof body.endpoint!=='string'||body.endpoint.length>4096)
      return NextResponse.json({error:'Invalid payload'},{status:400,headers:noStore});
    if(body.platform==='web'?!validPushSubscription(body.subscription,body.endpoint):body.endpoint.length<32)
      return NextResponse.json({error:'Invalid subscription'},{status:400,headers:noStore});
    const {data,error}=await db.rpc('connect_register_push_device',{
      p_user_id:user.id,p_session_id:sessionId,p_platform:body.platform,p_endpoint:body.endpoint,
      p_subscription:body.platform==='web'?body.subscription:null,
    });
    if(error)return NextResponse.json({error:'Could not save device'},{status:503,headers:noStore});
    if(data!==true)return NextResponse.json({error:'Too many registration requests'},{status:429,headers:noStore});
    return NextResponse.json({ok:true},{headers:noStore});
  } catch(error) { return fail(error); }
}
export async function DELETE(req:NextRequest) {
  try {
    const {client:db,user}=await authenticatedUser(req);
    const body=await req.json().catch(()=>null);
    if(typeof body?.endpoint!=='string'||body.endpoint.length>4096)return NextResponse.json({error:'Invalid endpoint'},{status:400});
    const {error}=await db.from('push_devices').delete().eq('user_id',user.id).eq('endpoint',body.endpoint);
    return NextResponse.json({ok:!error},{status:error?503:200,headers:noStore});
  } catch(error) { return fail(error); }
}
