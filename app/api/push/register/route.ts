import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishable || !secret) return NextResponse.json({error:'Server not configured'}, {status:503});
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const auth = createClient(url,publishable,{auth:{persistSession:false}});
  const {data:{user},error} = await auth.auth.getUser(token);
  if (error || !user) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const body = await req.json().catch(()=>null);
  if (!body || !['web','android'].includes(body.platform) || typeof body.endpoint !== 'string' || body.endpoint.length > 4096) return NextResponse.json({error:'Invalid payload'}, {status:400});
  if (body.platform === 'web') {
    if (!body.subscription || body.subscription.endpoint !== body.endpoint || !body.subscription.keys?.p256dh || !body.subscription.keys?.auth || !body.endpoint.startsWith('https://')) return NextResponse.json({error:'Invalid web subscription'}, {status:400});
  } else if (body.endpoint.length < 32 || body.endpoint.length > 4096) return NextResponse.json({error:'Invalid FCM token'}, {status:400});
  const db = createClient(url,secret,{auth:{persistSession:false}});
  const {error:dbError} = await db.from('push_devices').upsert({user_id:user.id,platform:body.platform,endpoint:body.endpoint,subscription:body.platform==='web'?body.subscription:null,updated_at:new Date().toISOString()},{onConflict:'user_id,endpoint'});
  if (dbError) return NextResponse.json({error:'Could not save device'}, {status:500});
  return NextResponse.json({ok:true});
}
export async function DELETE(req: NextRequest) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL, pub=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!url||!pub||!secret||!token) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const auth=createClient(url,pub,{auth:{persistSession:false}});
  const {data:{user}}=await auth.auth.getUser(token);
  if (!user) return NextResponse.json({error:'Unauthorized'}, {status:401});
  const body=await req.json().catch(()=>null);
  if (typeof body?.endpoint !== 'string') return NextResponse.json({error:'Invalid endpoint'}, {status:400});
  const db=createClient(url,secret,{auth:{persistSession:false}});
  const {error}=await db.from('push_devices').delete().eq('user_id',user.id).eq('endpoint',body.endpoint);
  return NextResponse.json({ok:!error},{status:error?500:200});
}
