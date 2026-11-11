import {chatTimeKey,compareChatMessages} from './chat-order';
type Row={id:string;conversation_id:string;created_at:string;sender_id?:string;deleted_at?:string|null;edited_at?:string|null};
type Snapshot<T>={messages:T[];readAt:string;savedAt:number;hasMore?:boolean;hasNewer?:boolean};
type Stored={key:string;user:string;chat:string;messages:Row[];readAt:string;savedAt:number;tombstones?:string[]};
const NAME='connect-chat-history-v1',CHATS='chats',OWNERS='owners',RETIRED='retired',MAX_PER_CHAT=6000;
let opening:Promise<IDBDatabase>|null=null;
const queues=new Map<string,Promise<unknown>>(),epochs=new Map<string,number>();
function open(){return opening??=new Promise<IDBDatabase>((resolve,reject)=>{
 const req=indexedDB.open(NAME,2);req.onupgradeneeded=()=>{for(const [name,keyPath]of[[CHATS,'key'],[OWNERS,'user'],[RETIRED,'key']])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath});};
 req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};req.onerror=()=>{opening=null;reject(req.error);};
});}
function get<T>(req:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function transaction<T>(mode:IDBTransactionMode,operation:(tx:IDBTransaction)=>Promise<T>):Promise<T>{
 const db=await open();return new Promise<T>((resolve,reject)=>{
  const tx=db.transaction([CHATS,OWNERS,RETIRED],mode);let value:T,error:unknown;
  tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error||error);tx.onabort=()=>reject(error||tx.error||Error('History transaction aborted'));
  void operation(tx).then(result=>{value=result;}).catch(reason=>{error=reason;try{tx.abort();}catch{reject(reason);}});
 });
}
function serial<T>(user:string,operation:()=>Promise<T>):Promise<T>{
 const pending=(queues.get(user)||Promise.resolve()).catch(()=>{}).then(operation).finally(()=>{if(queues.get(user)===pending)queues.delete(user);});queues.set(user,pending);return pending;
}
const keyOf=(user:string,chat:string)=>user+':'+chat;
async function epoch(tx:IDBTransaction,user:string){return (await get<{user:string;epoch:number}|undefined>(tx.objectStore(OWNERS).get(user)))?.epoch||0;}
async function retired(tx:IDBTransaction,user:string){return new Set((await get<{id:string}[]>(tx.objectStore(RETIRED).getAll(IDBKeyRange.bound(user+':',user+':\uffff')))).map(row=>row.id));}
function clean(row:Stored|undefined,chat:string,dead:Set<string>):Row[]{
 for(const id of row?.tombstones||[])dead.add(id);
 return(row?.messages||[]).filter(m=>m.conversation_id===chat&&!m.deleted_at&&!dead.has(m.id)&&!!chatTimeKey(m.created_at)).sort(compareChatMessages);
}
async function read<T extends Row>(user:string,chat:string,direction?:'before'|'after',time?:string,id?:string):Promise<Snapshot<T>|null>{
 if(!user||!chat)return null;
 return serial(user,()=>transaction('readonly',async tx=>{
  epochs.set(user,await epoch(tx,user));const row=await get<Stored|undefined>(tx.objectStore(CHATS).get(keyOf(user,chat)));if(!row)return null;
  const all=clean(row,chat,await retired(tx,user));let start=Math.max(0,all.length-200),end=all.length;
  if(direction&&time&&id){const boundary={id,created_at:time};const indexes=all.map((m,i)=>({m,i})).filter(({m})=>direction==='before'?compareChatMessages(m,boundary)<0:compareChatMessages(m,boundary)>0);
   if(!indexes.length)return{messages:[],readAt:row.readAt,savedAt:row.savedAt,hasMore:direction==='before'?false:all.length>0,hasNewer:direction==='after'?false:all.length>0};
   if(direction==='before'){end=indexes[indexes.length-1].i+1;start=Math.max(indexes[0].i,end-120);}else{start=indexes[0].i;end=Math.min(all.length,start+120);}
  }else if(row.readAt&&all[all.length-1]?.sender_id!==user){const point=all.findIndex(m=>m.sender_id!==user&&chatTimeKey(m.created_at)>chatTimeKey(row.readAt));if(point>=0){start=Math.max(0,point-30);end=Math.min(all.length,start+200);}}
  return{messages:all.slice(start,end)as T[],readAt:row.readAt||'',savedAt:row.savedAt,hasMore:start>0,hasNewer:end<all.length};
 }));
}
/** Short-lived in-memory hot windows; IndexedDB and the server remain authoritative. */
const hotWindows = new Map<string,{expires:number;promise:Promise<Snapshot<Row>|null>}>();
function invalidateHot(user:string,chat?:string){
 const prefix=user+':';for(const key of hotWindows.keys())if(key.startsWith(prefix)&&(!chat||key===keyOf(user,chat)))hotWindows.delete(key);
}
export async function prewarmChatHistory(user:string,chat:string):Promise<void>{
 if(!user||!chat)return;
 const key=keyOf(user,chat),item=hotWindows.get(key);
 if(item&&item.expires>Date.now()){await item.promise;return;}
 const promise=read<Row>(user,chat).catch(()=>null);
 hotWindows.set(key,{expires:Date.now()+20000,promise});
 if(hotWindows.size>12)hotWindows.delete(hotWindows.keys().next().value!);
 await promise;
}
export function readChatHistory<T extends Row>(user:string,chat:string):Promise<Snapshot<T>|null>{
 const key=keyOf(user,chat),hot=hotWindows.get(key);
 if(hot&&hot.expires>Date.now()){hotWindows.delete(key);return hot.promise as Promise<Snapshot<T>|null>;}
 hotWindows.delete(key);return read<T>(user,chat);
}
export function readOlderChatHistory<T extends Row>(user:string,chat:string,time:string,id:string){return read<T>(user,chat,'before',time,id);}
export function readNewerChatHistory<T extends Row>(user:string,chat:string,time:string,id:string){return read<T>(user,chat,'after',time,id);}
export function writeChatHistory<T extends Row>(user:string,chat:string,messages:T[],readAt='',replace=false):Promise<void>{
 if(!user||!chat)return Promise.resolve();
 invalidateHot(user,chat);
 const lease=epochs.has(user)?Promise.resolve(epochs.get(user)!):transaction('readonly',tx=>epoch(tx,user)).then(value=>{if(!epochs.has(user))epochs.set(user,value);return value;});
 const frozen=JSON.parse(JSON.stringify(messages))as T[];
 return serial(user,async()=>{const expected=await lease;await transaction('readwrite',async tx=>{
  if(await epoch(tx,user)!==expected)return;
  const chats=tx.objectStore(CHATS),barriers=tx.objectStore(RETIRED),key=keyOf(user,chat),previous=await get<Stored|undefined>(chats.get(key)),dead=await retired(tx,user);
  for(const id of previous?.tombstones||[]){dead.add(id);barriers.put({key:user+':'+id,user,id});}
  const byId=new Map<string,Row>();for(const m of replace?[]:clean(previous,chat,dead))byId.set(m.id,m);
  for(const m of frozen)if(m.conversation_id===chat){
   if(m.deleted_at){dead.add(m.id);byId.delete(m.id);barriers.put({key:user+':'+m.id,user,id:m.id});}
   else if(!dead.has(m.id)){const old=byId.get(m.id);if(!old||chatTimeKey(m.edited_at||m.created_at)>=chatTimeKey(old.edited_at||old.created_at))byId.set(m.id,m);}
  }
  const latestRead=chatTimeKey(readAt)>chatTimeKey(previous?.readAt||'')?readAt:previous?.readAt||'';
  chats.put({key,user,chat,messages:[...byId.values()].sort(compareChatMessages).slice(-MAX_PER_CHAT),readAt:latestRead,savedAt:Date.now()}satisfies Stored);
 });});
}
export async function dropCachedMessageById(user:string,id:string){
 if(!user||!id)return;
 invalidateHot(user);
 await serial(user,()=>transaction('readwrite',async tx=>{
  tx.objectStore(RETIRED).put({key:user+':'+id,user,id});
  const chats=tx.objectStore(CHATS),rows=await get<Stored[]>(chats.getAll());
  for(const row of rows)if(row.user===user&&row.messages.some(m=>m.id===id)){row.messages=row.messages.filter(m=>m.id!==id);chats.put(row);}
 }));
}
export async function dropCachedMessage(user:string,_chat:string,id:string){await dropCachedMessageById(user,id);}
async function wipe(user:string,chat?:string){
 if(!user)return;
 invalidateHot(user,chat);
 await serial(user,()=>transaction('readwrite',async tx=>{
  tx.objectStore(OWNERS).put({user,epoch:await epoch(tx,user)+1});
  const chats=tx.objectStore(CHATS),rows=await get<Stored[]>(chats.getAll());
  for(const row of rows)if(row.user===user&&(!chat||row.chat===chat)){
   for(const id of row.tombstones||[])tx.objectStore(RETIRED).put({key:user+':'+id,user,id});
   chats.delete(row.key);
  }
 }));
}
export function wipeChatHistory(user:string,chat:string){return wipe(user,chat);}
export function wipeUserHistory(user:string){return wipe(user);}
export async function chatHistoryStats(user:string):Promise<{chats:number;messages:number;bytes:number}>{
 if(!user)return{chats:0,messages:0,bytes:0};
 return serial(user,()=>transaction('readonly',async tx=>{const rows=(await get<Stored[]>(tx.objectStore(CHATS).getAll())).filter(r=>r.user===user);return{chats:rows.length,messages:rows.reduce((n,r)=>n+r.messages.length,0),bytes:rows.reduce((n,r)=>n+new Blob([JSON.stringify(r)]).size,0)};}));
}
