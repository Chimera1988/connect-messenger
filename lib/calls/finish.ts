import type { SupabaseClient } from '@supabase/supabase-js';
import { pendingStore } from '../storage/pending-store';
export type FinishIntent={callId:string;reason:'hangup'|'failed'|'decline'|'busy'|'missed';answerHash?:string|null;at?:number};
const running=new Map<string,Promise<void>>();
const pending=pendingStore<FinishIntent>('connect-pending-call-finish-v1',row=>row.callId+':'+(row.answerHash||row.reason),(value):value is FinishIntent=>{
 if(!value||typeof value!=='object')return false;const row=value as Partial<FinishIntent>;
 return typeof row.callId==='string'&&!!row.reason&&['hangup','failed','decline','busy','missed'].includes(row.reason)&&Date.now()-(row.at||0)<86400000;
});
const read=(owner:string)=>pending.list(owner);
export async function answerFingerprint(sdp?:string):Promise<string|null>{if(!sdp)return null;const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(sdp));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function queueCallFinish(client:SupabaseClient,user:string,intent:FinishIntent,onFinished?:(id:string)=>void):Promise<void>{
 pending.put(user,{...intent,at:Date.now()});return flushCallFinishes(client,user,onFinished);
}
export function flushCallFinishes(client:SupabaseClient,user:string,onFinished?:(id:string)=>void):Promise<void>{
 const existing=running.get(user);if(existing)return existing;
 const operation=(async()=>{
  for(const row of read(user)){
   const owned=row.reason==='hangup'||row.reason==='failed';
   try{const result=await client.rpc(owned?'connect_finish_owned_audio_call':'connect_finish_audio_call',{
    p_call_id:row.callId,p_reason:row.reason,...(owned?{p_answer_sha256:row.answerHash||null}:{})
   });
   if(result.error||!result.data)continue;
   const call=Array.isArray(result.data)?result.data[0]:result.data;
   // Another device owns the answer: this device must never finish that call.
   if(call.status==='active'&&owned) {pending.remove(user,row);continue;}
   if(!['ringing','active'].includes(call.status)){pending.remove(user,row);onFinished?.(row.callId);}
   else if(!owned)pending.remove(user,row);
   }catch{/* A committed-but-lost response is safe to retry: SQL finish is idempotent. */}
  }
 })().finally(()=>{running.delete(user);});running.set(user,operation);return operation;
}
