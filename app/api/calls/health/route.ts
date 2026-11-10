import {createClient} from '@supabase/supabase-js';
import {NextRequest,NextResponse} from 'next/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Authenticated configuration facts only. No credentials, endpoints or user data.
 * Optional diagnostics: clients must not depend on this route to start a call. */
export async function GET(req:NextRequest){
  const token=req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!token||!url||!key)return NextResponse.json({error:'Unauthorized'},{status:401});
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await db.auth.getUser(token);
  if(error||!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  let firebaseConfigured=false,firebaseProjectMatches=false;
  try{
    const account=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON||'null');
    firebaseConfigured=Boolean(account?.project_id&&account?.client_email&&account?.private_key);
    firebaseProjectMatches=firebaseConfigured&&account.project_id==='connect-messenger-5c824';
  }catch{/* Invalid config is reported as a boolean, never an exception containing secrets. */}
  const urls=process.env.CONNECT_TURN_URLS?.split(',').map(v=>v.trim()).filter(Boolean)||[];
  const relayConfigured=Boolean(process.env.CONNECT_TURN_SHARED_SECRET?.trim()&&urls.some(v=>/^turns?:[^\s]+$/i.test(v)));
  return NextResponse.json({version:1,firebaseConfigured,firebaseProjectMatches,relayConfigured},
    {headers:{'Cache-Control':'private, no-store'}});
}
