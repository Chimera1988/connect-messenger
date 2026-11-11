/* Public core assets only. User media, auth and keys live in separate IDBs. */
const CORE='connect-core-v4';
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
function markers(){return new Promise((resolve,reject)=>{const request=indexedDB.open('connect-push-read-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('read');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function watermark(user,chat,value){if(!user||!chat)return '';const db=await markers();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('read',value?'readwrite':'readonly'),store=tx.objectStore('read'),request=store.get(user+':'+chat);let result='';request.onsuccess=()=>{result=request.result||'';if(value&&Date.parse(value)>Date.parse(result||'1970-01-01')){result=value;store.put(value,user+':'+chat);}};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function clearRead(d){await watermark(d.userId,d.conversationId,d.readAt);for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='message'&&alert.data?.conversationId===d.conversationId&&Date.parse(alert.data.createdAt)<=Date.parse(d.readAt))alert.close();}
self.addEventListener('message',event=>{if(event.data?.type==='CONNECT_READ')event.waitUntil(clearRead(event.data));if(event.data?.type==='CONNECT_CALLS_VIEWED')event.waitUntil((async()=>{const d=event.data;await watermark(d.userId,'#calls',d.viewedAt);for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='missed-call'&&alert.data?.userId===d.userId)alert.close();})());});
self.addEventListener('push',event=>{let d={};try{d=event.data?.json()||{};}catch{}event.waitUntil((async()=>{
 if(d.kind==='call-ended'){for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='incoming-call'&&alert.data?.callId===d.callId)alert.close();for(const client of await clients.matchAll({type:'window'}))client.postMessage({type:'CONNECT_CALL_ENDED',callId:d.callId});return;}
 if(d.kind==='read'){await clearRead(d);return;}
 if(d.kind==='missed-call'){const viewed=await watermark(d.userId,'#calls');if(d.endedAt&&Date.parse(d.endedAt)<=Date.parse(viewed||'1970-01-01'))return;await self.registration.showNotification('Пропущенный звонок · Connect',{body:d.body||'Неотвеченный аудиозвонок',icon:'/icon-192.png',badge:'/icon-192.png',tag:'connect-missed-'+d.callId,data:{kind:'missed-call',userId:d.userId,callId:d.callId,conversationId:d.conversationId,endedAt:d.endedAt}});return;}
 const isCall=d.kind==='incoming-call';if(!isCall&&d.userId&&d.createdAt){const read=await watermark(d.userId,d.conversationId);if(Date.parse(d.createdAt)<=Date.parse(read))return;}
 await self.registration.showNotification(d.title||'Connect',{body:isCall?'Входящий аудиозвонок':'Новое сообщение',icon:'/icon-192.png',badge:'/icon-192.png',tag:isCall?'connect-call-'+d.callId:'connect-message-'+d.messageId,data:{kind:isCall?'incoming-call':'message',conversationId:d.conversationId||null,callId:d.callId||null,createdAt:d.createdAt||'',userId:d.userId||''},silent:false,...(isCall?{requireInteraction:true}:{})});
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();const details=event.notification.data||{};event.waitUntil((async()=>{for(const client of await clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===self.location.origin){await client.focus();client.postMessage(details.kind==='incoming-call'?{type:'CONNECT_INCOMING_CALL',callId:details.callId}:details.kind==='missed-call'?{type:'CONNECT_OPEN_CALLS'}:{type:'CONNECT_OPEN_CHAT',conversationId:details.conversationId});return;}await clients.openWindow(details.kind==='missed-call'?'/?calls=missed':details.conversationId?'/?conversation='+encodeURIComponent(details.conversationId):'/');})());});
