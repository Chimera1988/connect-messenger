/** Locally available chat history (not an alternative message server).
 * Scoped per authenticated user; server remains the source of truth.
 * IndexedDB failures never prevent network chat loading.
 */
type Row = {id:string;conversation_id:string;created_at:string;deleted_at?:string|null};
type Snapshot<T> = { messages:T[]; readAt:string; savedAt:number };
type Stored = {key:string;user:string;chat:string;messages:Row[];readAt:string;savedAt:number;tombstones:string[]};
const DB_NAME='connect-chat-history-v1', TABLE='chats', MAX_PER_CHAT=6000;
let opening:Promise<IDBDatabase>|null=null;
function open():Promise<IDBDatabase>{
  if(!opening) opening=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(TABLE))req.result.createObjectStore(TABLE,{keyPath:'key'});};
    req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
    req.onerror=()=>{opening=null;reject(req.error);};
  });
  return opening;
}
async function request<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await open();return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction(TABLE,mode),req=fn(tx.objectStore(TABLE));let out:T;
    req.onsuccess=()=>{out=req.result;};
    tx.oncomplete=()=>resolve(out);
    tx.onerror=()=>reject(tx.error||new Error('Local history failed'));
    tx.onabort=()=>reject(tx.error||new Error('Local history aborted'));
  });
}
const keyOf=(user:string,chat:string)=>`${user}:${chat}`;
export async function readChatHistory<T extends Row>(user:string,chat:string):Promise<Snapshot<T>|null>{
  if(!user||!chat)return null;
  const row=await request<Stored|undefined>('readonly',s=>s.get(keyOf(user,chat)));
  if(!row || row.user!==user || row.chat!==chat)return null;
  const tombstones=new Set(row.tombstones||[]);
  return {messages:row.messages.filter(m=>m.conversation_id===chat&&!m.deleted_at&&!tombstones.has(m.id)) as T[],readAt:row.readAt||'',savedAt:row.savedAt};
}
// Per-chat serialized writes prevent slow IndexedDB saves from overriding newer results.
const writes=new Map<string,Promise<void>>();
export function writeChatHistory<T extends Row>(user:string,chat:string,messages:T[],readAt='',replace=false):Promise<void>{
  if(!user||!chat)return Promise.resolve();
  const key=keyOf(user,chat);
  const pending=(writes.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
    const previous=replace?undefined:await request<Stored|undefined>('readonly',s=>s.get(key));
    const tombstones=new Set(previous?.tombstones||[]);
    const byId=new Map<string,Row>();
    for(const m of previous?.messages||[])if(!tombstones.has(m.id)&&!m.deleted_at)byId.set(m.id,m);
    for(const m of messages)if(m.conversation_id===chat){
      if(m.deleted_at){tombstones.add(m.id);byId.delete(m.id);}
      else if(!tombstones.has(m.id))byId.set(m.id,m);
    }
    const merged=[...byId.values()].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).slice(-MAX_PER_CHAT);
    const row:Stored={key,user,chat,messages:merged,readAt:readAt>String(previous?.readAt||'')?readAt:String(previous?.readAt||''),savedAt:Date.now(),tombstones:[...tombstones].slice(-8000)};
    await request('readwrite',s=>s.put(row));
  }).finally(()=>{if(writes.get(key)===pending)writes.delete(key);});
  writes.set(key,pending);return pending;
}
export async function dropCachedMessage(user:string,chat:string,id:string):Promise<void>{
  if(!user||!chat||!id)return;
  const key=keyOf(user,chat);await (writes.get(key)||Promise.resolve()).catch(()=>{});
  const row=await request<Stored|undefined>('readonly',s=>s.get(key));
  if(!row)return;
  row.messages=row.messages.filter(m=>m.id!==id);
  row.tombstones=[...new Set([...(row.tombstones||[]),id])].slice(-8000);
  await request('readwrite',s=>s.put(row));
}
export async function dropCachedMessageById(user:string,id:string):Promise<void>{
  if(!user||!id)return;
  const all=await request<Stored[]>('readonly',s=>s.getAll());
  await Promise.all(all.filter(r=>r.user===user&&r.messages.some(m=>m.id===id)).map(r=>dropCachedMessage(user,r.chat,id)));
}
export async function wipeChatHistory(user:string,chat:string):Promise<void>{
  if(!user||!chat)return;
  const key=keyOf(user,chat);await (writes.get(key)||Promise.resolve()).catch(()=>{});
  await request('readwrite',s=>s.delete(key));
}
export async function wipeUserHistory(user:string):Promise<void>{
  if(!user)return;
  const all=await request<Stored[]>('readonly',s=>s.getAll());
  for(const row of all.filter(r=>r.user===user))await wipeChatHistory(user,row.chat);
}
export async function chatHistoryStats(user:string):Promise<{chats:number;messages:number;bytes:number}>{
  if(!user)return {chats:0,messages:0,bytes:0};
  const rows=(await request<Stored[]>('readonly',s=>s.getAll())).filter(r=>r.user===user);
  return {chats:rows.length,messages:rows.reduce((n,r)=>n+r.messages.length,0),bytes:rows.reduce((n,r)=>n+new Blob([JSON.stringify(r)]).size,0)};
}
