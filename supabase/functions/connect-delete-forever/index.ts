import {collectObject} from '../_shared/gc.ts';
import {liveIdentity} from '../_shared/auth.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.57.0';

const CORS = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respond=(x:Record<string,unknown>,status=200)=>new Response(JSON.stringify(x),{
  status,headers:{...CORS,'Content-Type':'application/json'}
});
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
  if(req.method!=='POST')return respond({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!secret)return respond({error:'Backend not configured'},503);
  const bearer=/^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization')||'')?.[1];
  if(!bearer)return respond({error:'Unauthorized'},401);
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  let user;try{user=await liveIdentity(db,bearer);}catch{return respond({error:'Authorization unavailable'},503);}
  const userId=user?.id;if(!userId)return respond({error:'Unauthorized'},401);
  let payload:{message_id?:unknown;cleanup_pending?:unknown};
  try{payload=await req.json();}catch{return respond({error:'Invalid JSON'},400);}
  if(!payload||typeof payload!=='object')return respond({error:'Invalid body'},400);
  const drain=payload.cleanup_pending===true,messageId=payload.message_id;
  if(!drain&&(typeof messageId!=='string'||!UUID.test(messageId)))return respond({error:'Invalid message ID'},400);
  const worker=crypto.randomUUID();
  try{
    let removedNow=false;
    if(!drain&&typeof messageId==='string'){
      const {data:row,error:readError}=await db.from('messages').select('id,sender_id').eq('id',messageId).maybeSingle();
      if(readError)throw readError;
      if(row){
        if(row.sender_id!==userId)return respond({error:'Forbidden'},403);
        const {data:deleted,error:deleteError}=await db.from('messages').delete().eq('id',messageId).eq('sender_id',userId).select('id');
        if(deleteError)throw deleteError;
        removedNow=Array.isArray(deleted)&&deleted.length===1;
      }
    }
    const {data:jobs,error:queueError}=await db.rpc('connect_gc_candidates',{p_kind:'media',p_sender:userId,p_message:drain?null:messageId,p_limit:100});
    if(queueError)throw queueError;
    if(!drain&&!removedNow&&!(jobs?.length))return respond({deleted:false,error:'Message not found'},404);

    const referenced=async(path:string):Promise<boolean>=>{
      const direct=await db.from('messages').select('id').eq('attachment_path',path).is('deleted_at',null).limit(1);
      if(direct.error)throw direct.error;
      if(direct.data?.length)return true;
      const escaped=path.replace(/[\\%_]/g,(c:string)=>'\\'+c);
      const embedded=await db.from('messages').select('id').ilike('body','%'+escaped+'%').is('deleted_at',null).limit(1);
      if(embedded.error)throw embedded.error;
      if(embedded.data?.length)return true;
      const avatar=await db.from('profiles').select('id').eq('avatar_path',path).limit(1);
      if(avatar.error)throw avatar.error;
      if(avatar.data?.length)return true;
      const sticker=await db.from('connect_stickers').select('id').eq('storage_path',path).limit(1);
      if(sticker.error)throw sticker.error;
      return Boolean(sticker.data?.length);
    };
    let deletedFiles=0,pendingFiles=0;
    for(const job of jobs||[]){
      const path=job.path;
      if(typeof path!=='string'||path.length>900||!path.startsWith(job.conversation_id+'/'+userId+'/')){
        pendingFiles++;continue;
      }
      try{
        if(await referenced(path)){pendingFiles++;continue;}
        const paths=[path];
        for(const sibling of [path+'__thumb.webp',path+'__poster.jpg']){
          if(!(await referenced(sibling)))paths.push(sibling);
        }
        if(!await collectObject(db,'connect-attachments',path,worker)){pendingFiles++;continue;}
        deletedFiles++;
      }catch(e){
        console.error('Connect media GC pending:',e instanceof Error?e.name:'error');
        pendingFiles++;
      }
    }
    return respond({deleted:!drain||removedNow,deleted_files:deletedFiles,pending_files:pendingFiles});
  }catch(e){
    console.error('Connect hard-delete unavailable:',e instanceof Error?e.name:'error');
    return respond({error:'Server deletion unavailable; retry'},503);
  }
});

