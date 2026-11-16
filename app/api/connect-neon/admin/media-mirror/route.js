import {createClient} from '@supabase/supabase-js';
import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {createHash} from 'node:crypto';
import {getPool} from '../../../../../lib/connect-neon-live-db.cjs';
import {validMirrorToken,validMirrorItem,safeStoragePath,validStorageEndpoint} from '../../../../../lib/connect-neon-media-guards.cjs';
export const runtime='nodejs';
export const maxDuration=60;
let storage;
const response=(json,status=200)=>Response.json(json,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
function sourceClient(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error('Source storage not configured');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function neonStorage(){
 const endpoint=process.env.CONNECT_NEON_S3_ENDPOINT;
 if(!validStorageEndpoint(endpoint)||process.env.CONNECT_NEON_S3_REGION!=='eu-central-1')throw Error('Destination storage configuration is invalid');
 const accessKeyId=process.env.CONNECT_NEON_MIRROR_ACCESS_KEY_ID;
 const secretAccessKey=process.env.CONNECT_NEON_MIRROR_SECRET_ACCESS_KEY;
 if(!accessKeyId||!secretAccessKey)throw Error('Storage write credentials are missing');
 return storage??=new S3Client({region:'eu-central-1',endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
}
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
async function copyOne(source,s3,item){
 if(!validMirrorItem(item))throw Error('Unsafe object metadata');
 const {bucket_id:b,path,source_etag,source_size,mime_type}=item;
 const {data,error}=await source.storage.from(b).download(path);
 if(error||!data)throw Error('Source object unavailable');
 const bytes=Buffer.from(await data.arrayBuffer());
 if(bytes.length!==Number(source_size)||!bytes.length)throw Error('Source object changed while downloading');
 await s3.send(new PutObjectCommand({Bucket:b,Key:path,ContentType:mime_type,Body:bytes,ContentLength:bytes.length}));
 const response=await s3.send(new GetObjectCommand({Bucket:b,Key:path}));
 const received=response.Body?Buffer.from(await response.Body.transformToByteArray()):Buffer.alloc(0);
 const digest=sha(bytes);
 if(received.length!==bytes.length||sha(received)!==digest)throw Error('Destination checksum verification failed');
 const confirmed=await source.rpc('connect_neon_media_mirror_confirm',
  {p_bucket:b,p_path:path,p_etag:source_etag,p_size:bytes.length,p_sha256:digest});
 if(confirmed.error||confirmed.data!==true)throw Error('Source version changed after transfer');
 return true;
}
async function reconcileAvatars(source){
 const {data,error}=await source.rpc('connect_neon_media_mirror_current_avatars');
 if(error||!Array.isArray(data))throw Error('Avatar metadata unavailable');
 let updated=0;
 for(const a of data){
  if(typeof a.user_id!=='string'||!safeStoragePath('connect-avatars',a.path)||!Number.isInteger(a.byte_size)||!a.sha256)continue;
  const {rows}=await getPool().query('SELECT connect_backup.register_mirrored_avatar($1,$2,$3,$4,$5) AS registered',
    [a.user_id,a.path,a.mime_type,a.byte_size,a.sha256]);
  if(rows[0]?.registered)updated++;
 }
 return updated;
}
async function deleteStale(source,s3){
 const {data,error}=await source.rpc('connect_neon_media_mirror_stale',{p_limit:3});
 if(error||!Array.isArray(data))throw Error('Stale object list unavailable');
 let deleted=0,failures=0;
 for(const obj of data){
  if(!safeStoragePath(obj.bucket_id,obj.path))continue;
  try{
   await s3.send(new DeleteObjectCommand({Bucket:obj.bucket_id,Key:obj.path}));
   const {data:confirmed,error:ackError}=await source.rpc('connect_neon_media_mirror_confirm_deleted',
     {p_bucket:obj.bucket_id,p_path:obj.path,p_etag:obj.source_etag});
   if(ackError||confirmed!==true)throw Error('Deletion marker still current');
   deleted++;
  }catch{failures++;}
 }
 return {deleted,failures};
}
export async function POST(request){
 const provided=request.headers.get('x-connect-neon-mirror-token');
 if(!validMirrorToken(provided,process.env.CONNECT_NEON_MIRROR_HTTP_TOKEN))return response({error:'Unauthorized'},401);
 try{
  const source=sourceClient(),s3=neonStorage();
  let requested={};try{requested=await request.json();}catch{}
  const limit=Number.isInteger(requested?.limit)?Math.min(8,Math.max(1,requested.limit)):7;
  const {data:jobs,error}=await source.rpc('connect_neon_media_mirror_candidates',{p_limit:limit});
  if(error||!Array.isArray(jobs))throw Error('Mirror queue not available');
  let copied=0,failures=0;
  for(const item of jobs){
   try{await copyOne(source,s3,item);copied++;}
   catch{
    failures++;
    if(validMirrorItem(item))await source.rpc('connect_neon_media_mirror_failed',
       {p_bucket:item.bucket_id,p_path:item.path,p_etag:item.source_etag});
   }
  }
  const avatars=await reconcileAvatars(source);
  const stale=await deleteStale(source,s3);
  const {data:stats,error:statsError}=await source.rpc('connect_neon_media_mirror_stats');
  return response({ok:!statsError,copied,failures,avatars_reconciled:avatars,stale_removed:stale.deleted,
     stale_errors:stale.failures,stats:statsError?null:stats});
 }catch{
  return response({error:'Media mirroring unavailable'},503);
 }
}
