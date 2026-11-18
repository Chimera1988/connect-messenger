import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../generated/database';
import { pendingStore } from '../storage/pending-store';
type Message=Database['public']['Tables']['messages']['Row'];
type Payload=Database['public']['Tables']['messages']['Insert'] & {id:string};
type Failure={message:string;code?:string};
const locks=new Map<string,Promise<Delivery>>();
const pending=pendingStore<Payload>('connect-message-outbox-v1',row=>row.id,(value,owner):value is Payload=>{
 if(!value||typeof value!=='object')return false;const row=value as Partial<Payload>;
 return row.sender_id===owner&&typeof row.id==='string'&&typeof row.conversation_id==='string';
});
const read=(owner:string)=>pending.list(owner);
function forget(row:Payload){pending.remove(row.sender_id,row);}
async function release(client:SupabaseClient,row:Payload,action:'finish'|'abandon'){if(row.attachment_path||row.body?.startsWith('[[connect-album:'))try{await client.rpc('connect_upload_lease',{p_id:row.id,p_chat:row.conversation_id,p_action:action});}catch{}}
export type Delivery={data:Message|null;error:Failure|null;pending:boolean};
/** Persist intent first; INSERT retries always carry the same database UUID. */
export function deliverMessage(client:SupabaseClient,payload:Payload):Promise<Delivery>{
 const existing=locks.get(payload.id);if(existing)return existing;
 pending.put(payload.sender_id,payload);
 const operation=(async():Promise<Delivery>=>{
  let failure:Failure|null=null;
  const identity=await client.auth.getSession().catch(()=>null);if(identity?.data.session?.user.id!==payload.sender_id)return {data:null,error:{message:'Сессия отправителя завершена'},pending:true};
  try{const result=await client.from('messages').insert(payload).select('*').single();if(result.data&&!result.error){forget(payload);await release(client,payload,'finish');return {data:result.data,error:null,pending:false};}failure=result.error;}catch(e){failure={message:e instanceof Error?e.message:'Нет соединения'};}
  // Recover an acknowledged DB commit whose HTTP response was lost.
  try{const found=await client.from('messages').select('*').eq('id',payload.id).eq('sender_id',payload.sender_id).maybeSingle();if(found.data&&!found.error){forget(payload);await release(client,payload,'finish');return {data:found.data,error:null,pending:false};}}catch{}
  const identityNow=await client.auth.getSession().catch(()=>null);if(identityNow?.data.session?.user.id!==payload.sender_id)return {data:null,error:failure,pending:true};
  const permanent=!!failure?.code&&/^(?:22|23|42|PGRST)/.test(failure.code);
  if(permanent){forget(payload);await release(client,payload,'abandon');}
  return {data:null,error:failure||{message:'Отправка ожидает соединения'},pending:!permanent};
 })().finally(()=>locks.delete(payload.id));locks.set(payload.id,operation);return operation;
}
export async function retryMessageOutbox(client:SupabaseClient,user:string,onDelivered:(message:Message)=>void){
 const session=await client.auth.getSession();if(session.data.session?.user.id!==user)return;
 for(const payload of read(user)){const current=await client.auth.getSession();if(current.data.session?.user.id!==user)break;const result=await deliverMessage(client,payload);if(result.data)onDelivered(result.data);if(result.pending)break;}
}
