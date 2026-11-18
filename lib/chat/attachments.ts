import type { SupabaseClient } from '@supabase/supabase-js';
import { isNativeMediaRuntime,prewarmChatWave } from '../chat-media-presentation';
import { makePhotoPreview,photoPreviewPath,supportsPhotoPreview } from '../chat-thumbnails';
import { connectOptimizeMedia } from '../connect-media-optimizer';
import { uploadObject,uploadOperation } from '../media/upload';
import { mediaUrl,supabaseKey,supabaseUrl,useSupabaseProxy } from '../supabase-browser';
import { deliverMessage } from './delivery';
import { connectImageFileSize,connectVideoFilePreview } from './media-preview';
import { ALBUM_PREFIX,type AlbumItem } from './model';

/** One preparation/transfer/commit protocol for single files and albums. UI
 * receives a committed/queued result; URL-signing failure cannot undo delivery. */
export async function deliverAttachments(client:SupabaseClient,owner:string,chat:string,files:File[],reply:string|null,progress:(percent:number)=>void,kindOverride?:'audio'){
 const transfer=uploadOperation(),id=crypto.randomUUID(),items:(AlbumItem&{size:number;type:string;kind:'image'|'video'})[]=[];
 const uploaded:{path:string;name:string;kind:'image'|'video'|'audio'|'file';size:number;type:string}[]=[];
 try{
  const {data:{session}}=await client.auth.getSession();if(!session||session.user.id!==owner)throw Error('Сессия завершена');
  for(let i=0;i<files.length;i++){
   const prepared=await connectOptimizeMedia(files[i],{native:isNativeMediaRuntime(),onProgress:f=>progress(Math.round((i+f*.35)/files.length*100))});
   const file=prepared.file;let path=chat+'/'+owner+'/'+crypto.randomUUID();
   const kind=kindOverride||(file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':'file');
   let thumb:Blob|null=null,poster:Blob|null=null;
   if(kind==='image'&&!/^sticker-\d+\.(?:png|webp|gif|jpe?g)$/i.test(file.name)){
    const size=await connectImageFileSize(file);if(size&&size.width<100000&&size.height<100000)path+=`__img_${size.width}x${size.height}`;
    if(supportsPhotoPreview(path))thumb=await makePhotoPreview(file);
   }
   if(kind==='video'){
    const preview=await connectVideoFilePreview(file);if(preview&&preview.size.width<100000&&preview.size.height<100000){
     if(!/^connect-video-note-\d+\.(?:mp4|webm)$/i.test(file.name))path+=`__vid_${preview.size.width}x${preview.size.height}`;
     poster=preview.poster;
    }
   }
   if(kind==='audio'&&!isNativeMediaRuntime()&&file.size<=2*1024**2){const localVoiceUrl=URL.createObjectURL(file);void prewarmChatWave(owner,path,localVoiceUrl,file.size).finally(()=>URL.revokeObjectURL(localVoiceUrl));}
   transfer.signal.throwIfAborted();
   const lease=await client.rpc('connect_upload_lease',{p_id:id,p_chat:chat,p_paths:[path]});if(lease.error)throw lease.error;
   const options={endpoint:useSupabaseProxy?window.location.origin+'/supabase-storage/storage/v1':supabaseUrl.replace('.supabase.co','.storage.supabase.co')+'/storage/v1',token:session.access_token,key:supabaseKey,signal:transfer.signal};
   await uploadObject(file,path,{...options,onProgress:f=>progress(Math.round((i+f)/files.length*100))});
   // Derived images are optional; cancellation still prevents a late message INSERT.
   if(thumb)await uploadObject(thumb,photoPreviewPath(path),options).catch(()=>{});
   if(poster)await uploadObject(poster,path+'__poster.jpg',options).catch(()=>{});
   uploaded.push({path,name:file.name.slice(0,240),kind,size:file.size,type:file.type||'application/octet-stream'});
   if(kind==='image'||kind==='video')items.push({path,name:file.name.slice(0,240),kind,size:file.size,type:file.type});
  }
  transfer.signal.throwIfAborted();
  const first=uploaded[0];if(!first)throw Error('Файл не выбран');
  const result=await deliverMessage(client,{id,conversation_id:chat,sender_id:owner,reply_to:reply,
   ...(files.length>1?{body:ALBUM_PREFIX+JSON.stringify(items.map(({path,name,kind})=>({path,name,kind})))+']]'}:{body:'',attachment_path:first.path,attachment_name:first.name,attachment_type:first.type,attachment_size:first.size,attachment_kind:first.kind})});
  if(!result.data&&!result.pending)throw result.error||Error('Сообщение не создано');
  const urls:Record<string,string>={};
  if(result.data)await Promise.all(uploaded.map(async item=>{try{const signed=await client.storage.from('connect-attachments').createSignedUrl(item.path,3600);if(signed.data?.signedUrl)urls[item.path]=mediaUrl(signed.data.signedUrl);}catch{/* Delivery has already committed. */}}));
  return {...result,urls};
 }catch(error){
  // Compensation is durable SQL work. It never deletes a possibly committed file.
  try{await client.rpc('connect_upload_lease',{p_id:id,p_chat:chat,p_action:'abandon'});}catch{}
  throw error;
 }finally{transfer.close();}
}
