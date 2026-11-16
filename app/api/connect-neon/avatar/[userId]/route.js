import {S3Client,GetObjectCommand} from '@aws-sdk/client-s3';
import {getSignedUrl} from '@aws-sdk/s3-request-presigner';
import {getPool} from '../../../../../lib/connect-neon-live-db.cjs';
import {isUuid} from '../../../../../lib/connect-neon-live-guards.cjs';
import {isValidAvatarMetadata,getAvatarAccessQuery,isSafeAvatarPresign} from '../../../../../lib/connect-neon-live-avatars.cjs';
import {sessionUser,json} from '../../../../../lib/connect-neon-live-session.cjs';

export const runtime='nodejs';
let s3;
const EXPECTED_ENDPOINT='https://br-hidden-math-b9gifypl.storage.c-7.eu-central-1.aws.neon.tech';
function getS3(){
 const endpoint=process.env.CONNECT_NEON_S3_ENDPOINT;
 const region=process.env.CONNECT_NEON_S3_REGION;
 const accessKeyId=process.env.CONNECT_NEON_S3_ACCESS_KEY_ID;
 const secretAccessKey=process.env.CONNECT_NEON_S3_SECRET_ACCESS_KEY;
 if(endpoint!==EXPECTED_ENDPOINT||region!=='eu-central-1'||!accessKeyId||!secretAccessKey)
   throw Error('Neon main storage is not configured');
 if(!s3)s3=new S3Client({region,endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
 return s3;
}
export async function GET(request,{params}){
 try{
   const actor=await sessionUser(request);
   if(!actor)return json({error:'Unauthorized'},401);
   const {userId}=await params;
   if(!isUuid(userId))return json({error:'Invalid user'},400);
   const {rows}=await getPool().query(getAvatarAccessQuery(),[actor,userId]);
   if(rows.length!==1)return json({error:'Avatar unavailable'},404);
   const metadata=rows[0];
   if(!isValidAvatarMetadata(metadata,userId))return json({error:'Invalid stored avatar'},503);
   const url=await getSignedUrl(getS3(),new GetObjectCommand({Bucket:'connect-avatars',Key:metadata.object_key}),{expiresIn:120});
   if(!isSafeAvatarPresign(url,EXPECTED_ENDPOINT,metadata.object_key))throw Error('Bad signed URL');
   return new Response(null,{status:302,headers:{Location:url,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
 }catch{
   return json({error:'Neon avatar unavailable'},503);
 }
}
