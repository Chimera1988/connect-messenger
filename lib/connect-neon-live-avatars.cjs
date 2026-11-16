'use strict';
const {isUuid}=require('./connect-neon-live-guards.cjs');
const EXT_TYPES=Object.freeze({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'});
const PATH=/^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/avatar-([A-Za-z0-9_-]{1,90})\.(jpg|jpeg|png|webp)$/i;
function isValidAvatarMetadata(row,owner){
 if(!isUuid(owner)||!row||typeof row!=='object')return false;
 if(typeof row.object_key!=='string'||row.object_key.length>256)return false;
 const m=PATH.exec(row.object_key);
 return !!m && m[1].toLowerCase()===owner.toLowerCase() &&
   row.content_type===EXT_TYPES[m[3].toLowerCase()] &&
   Number.isSafeInteger(row.byte_size) && row.byte_size>0 && row.byte_size<=2097152 &&
   typeof row.sha256==='string' && /^[a-f0-9]{64}$/.test(row.sha256);
}
function getAvatarAccessQuery(){return `
 SELECT a.object_key,a.content_type,a.byte_size,a.sha256
 FROM connect_backup.avatars a
 JOIN connect_backup.profiles p ON p.id=a.user_id AND p.avatar_path=a.object_key
 WHERE a.user_id=$2::uuid AND (
   a.user_id=$1::uuid OR (
     EXISTS (
       SELECT 1 FROM connect_backup.conversations c
       WHERE (c.user_a=$1::uuid AND c.user_b=$2::uuid)
          OR (c.user_b=$1::uuid AND c.user_a=$2::uuid)
     )
     AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE h.user_id=$1::uuid AND h.admin_id<>$2::uuid)
     AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE h.user_id=$2::uuid AND h.admin_id<>$1::uuid)
   )
 ) LIMIT 1`;
}
function isSafeAvatarPresign(raw,origin,key){
 try{
   const p=new URL(raw),o=new URL(origin);
   return p.protocol==='https:' && o.protocol==='https:' && p.origin===o.origin &&
     p.pathname==='/connect-avatars/'+key && p.searchParams.has('X-Amz-Signature') && !p.username && !p.password;
 }catch{return false;}
}
function avatarImageUrl(userId){return isUuid(userId)?'/api/connect-neon/avatar/'+userId:null;}
module.exports={isValidAvatarMetadata,getAvatarAccessQuery,isSafeAvatarPresign,avatarImageUrl};
