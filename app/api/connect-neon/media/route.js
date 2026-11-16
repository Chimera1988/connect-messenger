import {S3Client,HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {createClient} from '@supabase/supabase-js';
import {getPool} from '../../../../lib/connect-neon-live-db.cjs';
import {sessionUser,json} from '../../../../lib/connect-neon-live-session.cjs';
import {safeStoragePath,validStorageEndpoint,validRedirectUrl} from '../../../../lib/connect-neon-media-guards.cjs';
export const runtime='nodejs';
let s3;
function getReader(){
 if(!validStorageEndpoint(process.env.CONNECT_NEON_S3_ENDPOINT)||process.env.CONNECT_NEON_S3_REGION!=='eu-central-1')throw Error('Unsafe Neon storage endpoint');
 const accessKeyId=process.env.CONNECT_NEON_S3_ACCESS_KEY_ID,secretAccessKey=process.env.CONNECT_NEON_S3_SECRET_ACCESS_KEY;
 if(!accessKeyId||!secretAccessKey)throw Error('Neon storage reader missing');
 return s3??=new S3Client({region:'eu-central-1',endpoint:process.env.CONNECT_NEON_S3_ENDPOINT,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
}
const memberQuery=`SELECT 1 FROM connect_backup.messages m
 JOIN connect_backup.conversations c ON c.id=m.conversation_id
 LEFT JOIN connect_backup.message_tombstones t ON t.message_id=m.id
 WHERE m.attachment_path IS NOT NULL AND (m.attachment_path=$1 OR starts_with($1,m.attachment_path||'__'))
 AND (c.user_a=$2 OR c.user_b=$2) AND m.deleted_at IS NULL AND t.message_id IS NULL
 AND NOT (m.deleted_for_sender=true AND m.sender_id=$2)
 AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE
    (h.user_id=c.user_a AND h.admin_id<>$2::uuid) OR (h.user_id=c.user_b AND h.admin_id<>$2::uuid))
 LIMIT 1`;
export async function GET(request){
 try{
  const userId=await sessionUser(request);if(!userId)return json({error:'Unauthorized'},401);
  const q=new URL(request.url).searchParams;
  const bucket='connect-attachments',path=q.get('path');
  if(!safeStoragePath(bucket,path))return json({error:'Invalid media path'},400);
  const grant=await getPool().query(memberQuery,[path,userId]);
  if(grant.rowCount!==1)return json({error:'Media unavailable'},404);
  try{
   const store=getReader();
   await store.send(new HeadObjectCommand({Bucket:bucket,Key:path}));
   const signed=await getSignedUrl(store,new GetObjectCommand({Bucket:bucket,Key:path}),{expiresIn:120});
   if(!validRedirectUrl(signed,bucket,path))throw Error('Unsafe presigned location');
   return new Response(null,{status:302,headers:{Location:signed,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }catch{
   // Legacy source remains available during one-minute uploads and slow migrations.
   const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
   if(!url||!key)return json({error:'Media unavailable'},503);
   const legacy=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await legacy.storage.from(bucket).createSignedUrl(path,120);
   if(error||!data?.signedUrl)return json({error:'Media unavailable'},404);
   const signed=new URL(data.signedUrl);
   if(!signed.hostname.endsWith('.supabase.co')||signed.protocol!=='https:')throw Error('Invalid fallback host');
   return new Response(null,{status:302,headers:{Location:signed.toString(),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }
 }catch{return json({error:'Private media unavailable'},503);}
}
