/* Public core assets only. User media, auth and keys live in separate IDBs. */
const CORE='connect-core-v5';
const base=['/icon-192.png','/icon-512.png','/apple-touch-icon.png','/connect-splash-bubbles-transparent.png','/connect-scenes/moon.svg','/connect-scenes/aurora.svg','/connect-scenes/lagoon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 try {const cache=await caches.open(CORE);await Promise.all(base.map(async url=>{try{const response=await fetch(url);if(coreResponse(url,response))await cache.put(url,response);}catch{}}));}catch{}
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{try{for(const name of await caches.keys())if(name.startsWith('connect-core-')&&name!==CORE)await caches.delete(name);}catch{}await clients.claim();})()));
function coreResponse(url,response){
 if(!response.ok||response.status===206)return false;
 const type=(response.headers.get('content-type')||'').toLowerCase();
 if(type.includes('text/html')||type.includes('application/json'))return false;
 return !/\.(svg|png|webp|gif|ico)(?:\?|$)/i.test(url)||type.startsWith('image/');
}
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=='GET'||u.origin!==self.location.origin||!/^\/(?:_next\/static\/|icon-|favicon|apple-touch|connect-scenes\/|connect-crypto\/|stickers\/)/.test(u.pathname))return;
 event.respondWith((async()=>{
  let cache;
  try{cache=await caches.open(CORE);const old=await cache.match(event.request);if(old&&coreResponse(event.request.url,old))return old;if(old)await cache.delete(event.request);}catch{}
  const response=await fetch(event.request);
  // A full/disabled CacheStorage must never turn a successful image download
  // into a failed fetch. Public assets also keep their original HTTP URLs.
  if(cache&&coreResponse(event.request.url,response))try{await cache.put(event.request,response.clone());}catch{}
  return response;
 })());
});
// CONNECT_PWA_HOME_ICON_BADGE_V1
// An authoritative foreground snapshot plus only NEW, deduplicated background pushes.
// This database holds counts and non-secret event IDs; no messages, tokens or media.
const BADGE_DB='connect-home-badge-v1';
let badgeWork=Promise.resolve();
function badgeQueue(task){const next=badgeWork.then(task,task);badgeWork=next.catch(()=>{});return next;}
function badgeOpen(){return new Promise((resolve,reject)=>{
 const req=indexedDB.open(BADGE_DB,1);
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('state'))req.result.createObjectStore('state');};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
function badgeEmpty(){return {chats:{},missed:{count:0,lastAt:''},pending:[]};}
function badgeDate(iso){const ms=Date.parse(iso||'');return Number.isFinite(ms)?ms:0;}
function badgeCount(state){
 const base=Object.values(state.chats||{}).reduce((sum,c)=>sum+Math.max(0,Number(c.count)||0),0);
 return Math.min(9999,Math.max(0,base+Math.max(0,Number(state.missed?.count)||0)+(state.pending||[]).length));
}
async function badgeDisplay(count){try{
 const n=self.navigator;
 if(!n?.setAppBadge)return;
 if(count>0)await n.setAppBadge(count);
 else if(n.clearAppBadge)await n.clearAppBadge();else await n.setAppBadge(0);
}catch{/* Badging is not available in all browsers/permission states. */}}
function badgeChange(user,modify,activate=false){return badgeQueue(async()=>{
 const db=await badgeOpen();let next=null, active='';
 try{
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');
   const activeReq=store.get('active');
   activeReq.onsuccess=()=>{active=String(activeReq.result||'');};
   if(activate)store.put(user,'active');
   if(user){const request=store.get('user:'+user);
    request.onsuccess=()=>{next=request.result||badgeEmpty();modify(next);store.put(next,'user:'+user);};
   }
   tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);
  });
 }finally{db.close();}
 if(activate)active=user;
 if(active===user)await badgeDisplay(user&&next?badgeCount(next):0);
});}
function badgeSnapshot(d){
 const user=typeof d.userId==='string'?d.userId:'';
 return badgeChange(user,state=>{
  // A foreground refresh replaces the entire pending-event estimate.
  const chats={};
  if(d.chats&&typeof d.chats==='object')for(const [id,count] of Object.entries(d.chats)){
   if(!/^[0-9a-f-]{36}$/i.test(id))continue;
   const amount=Math.min(9999,Math.max(0,Math.floor(Number(count)||0)));
   const lastAt=typeof d.latest?.[id]==='string'?d.latest[id]:'';
   chats[id]={count:amount,lastAt};
  }
  state.chats=chats;
  state.missed={count:Math.min(9999,Math.max(0,Math.floor(Number(d.missed)||0))),lastAt:typeof d.callsLatest==='string'?d.callsLatest:''};
  state.pending=[];
 },true);
}
function badgeEvent(d,kind){return badgeChange(d.userId,state=>{
 const id=kind==='call'?d.callId:d.messageId;
 const at=kind==='call'?d.endedAt:d.createdAt;
 const chat=d.conversationId;
 if(typeof id!=='string'||!id||!badgeDate(at))return;
 if(kind==='message'&&(typeof chat!=='string'||!chat))return;
 const baseline=kind==='call'?state.missed?.lastAt:state.chats?.[chat]?.lastAt;
 if(badgeDate(at)<=badgeDate(baseline))return;
 const pending=Array.isArray(state.pending)?state.pending:[];
 if(pending.some(item=>item.kind===kind&&item.id===id))return;
 pending.push({kind,id,at,chat:kind==='message'?chat:''});
 // Cap memory; foreground reconciliation restores the exact count.
 state.pending=pending.slice(-300);
});}
function badgeRead(user,chat,readAt){return badgeChange(user,state=>{
 const boundary=badgeDate(readAt);
 if(!boundary||!chat)return;
 const entry=state.chats?.[chat];
 if(entry&&badgeDate(entry.lastAt)<=boundary)entry.count=0;
 state.pending=(state.pending||[]).filter(item=>item.kind!=='message'||item.chat!==chat||badgeDate(item.at)>boundary);
});}
function badgeCallsViewed(user,viewedAt){return badgeChange(user,state=>{
 const boundary=badgeDate(viewedAt);if(!boundary)return;
 if(badgeDate(state.missed?.lastAt)<=boundary)state.missed={count:0,lastAt:viewedAt};
 state.pending=(state.pending||[]).filter(item=>item.kind!=='call'||badgeDate(item.at)>boundary);
});}
function markers(){return new Promise((resolve,reject)=>{const request=indexedDB.open('connect-push-read-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('read');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function watermark(user,chat,value){if(!user||!chat)return '';const db=await markers();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('read',value?'readwrite':'readonly'),store=tx.objectStore('read'),request=store.get(user+':'+chat);let result='';request.onsuccess=()=>{result=request.result||'';if(value&&Date.parse(value)>Date.parse(result||'1970-01-01')){result=value;store.put(value,user+':'+chat);}};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function clearRead(d){await watermark(d.userId,d.conversationId,d.readAt);await badgeRead(d.userId,d.conversationId,d.readAt).catch(()=>{});for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='message'&&alert.data?.conversationId===d.conversationId&&Date.parse(alert.data.createdAt)<=Date.parse(d.readAt))alert.close();}
self.addEventListener('message',event=>{if(event.data?.type==='CONNECT_BADGE_SNAPSHOT')event.waitUntil(badgeSnapshot(event.data).catch(()=>{}));if(event.data?.type==='CONNECT_READ')event.waitUntil(clearRead(event.data));if(event.data?.type==='CONNECT_CALLS_VIEWED')event.waitUntil((async()=>{const d=event.data;await watermark(d.userId,'#calls',d.viewedAt);await badgeCallsViewed(d.userId,d.viewedAt).catch(()=>{});for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='missed-call'&&alert.data?.userId===d.userId)alert.close();})());});
self.addEventListener('push',event=>{let d={};try{d=event.data?.json()||{};}catch{}event.waitUntil((async()=>{
 if(d.kind==='call-ended'){for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='incoming-call'&&alert.data?.callId===d.callId)alert.close();for(const client of await clients.matchAll({type:'window'}))client.postMessage({type:'CONNECT_CALL_ENDED',callId:d.callId});return;}
 if(d.kind==='read'){await clearRead(d);return;}
 if(d.kind==='missed-call'){const viewed=await watermark(d.userId,'#calls');if(d.endedAt&&Date.parse(d.endedAt)<=Date.parse(viewed||'1970-01-01'))return;await self.registration.showNotification('Пропущенный звонок · Connect',{body:d.body||'Неотвеченный аудиозвонок',icon:'/icon-192.png',badge:'/icon-192.png',tag:'connect-missed-'+d.callId,data:{kind:'missed-call',userId:d.userId,callId:d.callId,conversationId:d.conversationId,endedAt:d.endedAt}});await badgeEvent(d,'call').catch(()=>{});return;}
 const isCall=d.kind==='incoming-call';if(!isCall&&d.userId&&d.createdAt){const read=await watermark(d.userId,d.conversationId);if(Date.parse(d.createdAt)<=Date.parse(read))return;}
 await self.registration.showNotification(d.title||'Connect',{body:isCall?'Входящий аудиозвонок':'Новое сообщение',icon:'/icon-192.png',badge:'/icon-192.png',tag:isCall?'connect-call-'+d.callId:'connect-message-'+d.messageId,data:{kind:isCall?'incoming-call':'message',conversationId:d.conversationId||null,callId:d.callId||null,createdAt:d.createdAt||'',userId:d.userId||''},silent:false,...(isCall?{requireInteraction:true}:{})});if(!isCall)await badgeEvent(d,'message').catch(()=>{});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();const details=event.notification.data||{};event.waitUntil((async()=>{for(const client of await clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===self.location.origin){await client.focus();client.postMessage(details.kind==='incoming-call'?{type:'CONNECT_INCOMING_CALL',callId:details.callId}:details.kind==='missed-call'?{type:'CONNECT_OPEN_CALLS'}:{type:'CONNECT_OPEN_CHAT',conversationId:details.conversationId});return;}await clients.openWindow(details.kind==='missed-call'?'/?calls=missed':details.conversationId?'/?conversation='+encodeURIComponent(details.conversationId):'/');})());});
