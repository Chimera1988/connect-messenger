'use strict';
const {timingSafeEqual}=require('node:crypto');
const BUCKETS=new Set(['connect-avatars','connect-attachments','connect-profile-media','connect-stickers']);
const EXPECTED='https://br-hidden-math-b9gifypl.storage.c-7.eu-central-1.aws.neon.tech';
const HEX=/^[0-9a-f]{64}$/;
function allowedBucket(bucket){return typeof bucket==='string'&&BUCKETS.has(bucket);}
function safeStoragePath(bucket,path){
 if(!allowedBucket(bucket)||typeof path!=='string'||path.length<5||path.length>900||path.startsWith('/')||path.endsWith('/'))return false;
 if(!path.includes('/')||path.includes('\\')||path.includes('//')||/[\x00-\x1f\x7f]/.test(path)||/%(?:2f|5c|00)/i.test(path))return false;
 if(path.split('/').some(segment=>segment==='.'||segment==='..'||!segment))return false;
 return true;
}
function validMime(m){return typeof m==='string'&&m.length<129&&/^[a-z0-9][a-z0-9+.-]*\/[a-z0-9][a-z0-9+.-]*$/i.test(m);}
function validMirrorItem(item){
 return item&&allowedBucket(item.bucket_id)&&safeStoragePath(item.bucket_id,item.path)&&
  typeof item.source_etag==='string'&&item.source_etag.length>0&&item.source_etag.length<=256&&
  Number.isSafeInteger(Number(item.source_size))&&Number(item.source_size)>0&&Number(item.source_size)<=104857600&&validMime(item.mime_type);
}
function validMirrorToken(provided,expected){
 if(typeof provided!=='string'||typeof expected!=='string'||!HEX.test(provided)||!HEX.test(expected))return false;
 return timingSafeEqual(Buffer.from(provided,'hex'),Buffer.from(expected,'hex'));
}
function validStorageEndpoint(endpoint){return endpoint===EXPECTED;}
function validRedirectUrl(raw,bucket,path){
 if(!allowedBucket(bucket)||!safeStoragePath(bucket,path))return false;
 try{
  const u=new URL(raw);
  return u.protocol==='https:'&&u.origin===EXPECTED&&decodeURIComponent(u.pathname)==='/'+bucket+'/'+path&&
   u.searchParams.has('X-Amz-Signature')&&!u.username&&!u.password;
 }catch{return false;}
}
module.exports={allowedBucket,safeStoragePath,validMime,validMirrorItem,validMirrorToken,validStorageEndpoint,validRedirectUrl,EXPECTED};
