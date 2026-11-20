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
 if(event.request.method==='GET'&&cmIdentity(u.href)&&u.searchParams.has('__cm')){event.respondWith(cmHandle(event));return;}
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
self.addEventListener('message',event=>{if(String(event.data?.type||'').startsWith('CONNECT_MEDIA_')){event.waitUntil(cmMessage(event));return;}if(event.data?.type==='CONNECT_DIAGNOSTICS_PING'){event.ports?.[0]?.postMessage({type:'CONNECT_DIAGNOSTICS_READY'});return;}if(event.data?.type==='CONNECT_BADGE_SNAPSHOT')event.waitUntil(badgeSnapshot(event.data).catch(()=>{}));if(event.data?.type==='CONNECT_READ')event.waitUntil(clearRead(event.data));if(event.data?.type==='CONNECT_CALLS_VIEWED')event.waitUntil((async()=>{const d=event.data;await watermark(d.userId,'#calls',d.viewedAt);await badgeCallsViewed(d.userId,d.viewedAt).catch(()=>{});for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='missed-call'&&alert.data?.userId===d.userId)alert.close();})());});
self.addEventListener('push',event=>{let d={};try{d=event.data?.json()||{};}catch{}event.waitUntil((async()=>{
 /* CONNECT_PWA_PUSH_DIAGNOSTICS_V1: diagnostic push never changes unread badges/call states. */
 if(d.kind==='connect-push-diagnostic'){
  const id=typeof d.requestId==='string'?d.requestId:'';
  if(!/^[0-9a-f-]{36}$/i.test(id)||typeof d.userId!=='string')return;
  await self.registration.showNotification('Connect · Проверка',{body:'Тестовое уведомление',icon:'/icon-192.png',badge:'/icon-192.png',tag:'connect-push-check-'+id,data:{kind:'connect-push-diagnostic'},silent:false});
  for(const client of await clients.matchAll({type:'window',includeUncontrolled:true})){
   if(new URL(client.url).origin===self.location.origin)client.postMessage({type:'CONNECT_PUSH_DIAGNOSTIC_RECEIVED',requestId:id,userId:d.userId,receivedAt:new Date().toISOString()});
  }
  return;
 }
 if(d.kind==='call-ended'){for(const alert of await self.registration.getNotifications())if(alert.data?.kind==='incoming-call'&&alert.data?.callId===d.callId)alert.close();for(const client of await clients.matchAll({type:'window'}))client.postMessage({type:'CONNECT_CALL_ENDED',callId:d.callId});return;}
 if(d.kind==='read'){await clearRead(d);return;}
 if(d.kind==='missed-call'){const viewed=await watermark(d.userId,'#calls');if(d.endedAt&&Date.parse(d.endedAt)<=Date.parse(viewed||'1970-01-01'))return;await self.registration.showNotification('Пропущенный звонок · Connect',{body:d.body||'Неотвеченный аудиозвонок',icon:'/icon-192.png',badge:'/icon-192.png',tag:'connect-missed-'+d.callId,data:{kind:'missed-call',userId:d.userId,callId:d.callId,conversationId:d.conversationId,endedAt:d.endedAt}});await badgeEvent(d,'call').catch(()=>{});return;}
 const isCall=d.kind==='incoming-call';
 const messageAt=badgeDate(d.createdAt)?d.createdAt:new Date().toISOString();
 if(!isCall&&d.userId&&d.createdAt){const read=await watermark(d.userId,d.conversationId);if(badgeDate(d.createdAt)&&badgeDate(d.createdAt)<=badgeDate(read))return;}
 // On iOS Home Screen, start the badge write in this same background push event,
 // not only after notification display has resolved. waitUntil covers both tasks.
 // The event ID is unchanged, so duplicate web push delivery counts only once.
 const badgeTask=isCall?Promise.resolve():badgeEvent({...d,createdAt:messageAt},'message').catch(()=>{});
 const notificationTask=self.registration.showNotification(d.title||'Connect',{body:isCall?'Входящий аудиозвонок':'Новое сообщение',icon:'/icon-192.png',badge:'/icon-192.png',tag:isCall?'connect-call-'+d.callId:'connect-message-'+d.messageId,data:{kind:isCall?'incoming-call':'message',conversationId:d.conversationId||null,callId:d.callId||null,createdAt:messageAt,userId:d.userId||''},silent:false,...(isCall?{requireInteraction:true}:{})});
 await Promise.all([badgeTask,notificationTask]);
})());});
self.addEventListener('notificationclick',event=>{event.notification.close();const details=event.notification.data||{};
if(details.kind==='connect-push-diagnostic'){event.waitUntil((async()=>{
 for(const client of await clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===self.location.origin){await client.focus();return;}
 await clients.openWindow('/');
})());return;}
event.waitUntil((async()=>{for(const client of await clients.matchAll({type:'window',includeUncontrolled:true}))if(new URL(client.url).origin===self.location.origin){await client.focus();client.postMessage(details.kind==='incoming-call'?{type:'CONNECT_INCOMING_CALL',callId:details.callId}:details.kind==='missed-call'?{type:'CONNECT_OPEN_CALLS'}:{type:'CONNECT_OPEN_CHAT',conversationId:details.conversationId});return;}await clients.openWindow(details.kind==='missed-call'?'/?calls=missed':details.conversationId?'/?conversation='+encodeURIComponent(details.conversationId):'/');})());});

// CONNECT_MEDIA_RESPONSE_CACHE_V1: one response, account-scoped durable bytes.
// CacheStorage above remains public-core-only; private media uses its existing IDB.
const cmScopes=new Map(),cmFlights=new Map();let cmOpening;
const cmKinds=['system','photos','videos','audio','other'],cmVersionIndex=7,cmRetiredIndex=8;
function cmIdentity(url){
 try{const u=new URL(url,self.location.origin);if(u.origin!==self.location.origin)return null;const m=u.pathname.match(/\/storage\/v1\/object\/(?:sign|public|authenticated)\/(.+)$/);if(!m)return null;const id=decodeURIComponent(m[1]);if(!/^(connect-attachments|connect-avatars|connect-stickers|connect-profile-media)\//.test(id)||id.length>4096||id.split('/').some(p=>!p||p==='.'||p==='..')||/[\x00-\x1f\\?#]/.test(id))return null;return id;}catch{return null;}
}
function cmCategory(id,type=''){if(id.startsWith('connect-avatars/'))return 'system';if(type.startsWith('image/'))return 'photos';if(type.startsWith('video/')||/\.(mp4|webm|mov)$/i.test(id))return 'videos';if(type.startsWith('audio/')||/\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(id))return 'audio';if(/\.(png|webp|gif|jpe?g|svg)$/i.test(id)||id.startsWith('connect-stickers/'))return 'photos';return 'other';}
function cmStrong(tag){return /^"[^\r\n]{0,510}"$/.test(tag);}
function cmDB(){return cmOpening??=new Promise((resolve,reject)=>{const q=indexedDB.open('connect-media-v1',4);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('objects'))d.createObjectStore('objects',{keyPath:'key'});for(const n of ['links','retired'])if(!d.objectStoreNames.contains(n))d.createObjectStore(n);if(!d.objectStoreNames.contains('media-ranges')){const s=d.createObjectStore('media-ranges',{keyPath:'key'});s.createIndex('file','file');s.createIndex('kind','kind');s.createIndex('fileStart',['file','start']);}};q.onsuccess=()=>{q.result.onversionchange=()=>{q.result.close();cmOpening=undefined;};resolve(q.result);};q.onerror=()=>{cmOpening=undefined;reject(q.error);};});}
function cmReq(q){return new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
async function cmRead(stores,fn){const db=await cmDB();const tx=db.transaction(stores);return fn(tx);}
function cmEpochKeys(user,file){return ['@cm-owner:'+user,'@cm-file:'+file,...cmKinds.map(k=>'@cm-kind:'+user+':'+k),'@cm-version:'+file,file];}
async function cmSnapshot(scope,id){const file=scope.user+':'+id;return cmRead(['retired','objects','media-ranges'],async tx=>{const keys=cmEpochKeys(scope.user,file);const pending=keys.map(k=>cmReq(tx.objectStore('retired').get(k)));const rowRequest=cmReq(tx.objectStore('objects').get(file)),metaRequest=cmReq(tx.objectStore('media-ranges').get(file));const [values,row,meta]=await Promise.all([Promise.all(pending),rowRequest,metaRequest]);return{scope,id,file,keys,values,row,meta};});}
function cmScopeCurrent(state){return cmScopes.get(state.scope.client)===state.scope;}
function cmLeaseOK(state,values,type){const category=cmCategory(state.id,type);return cmScopeCurrent(state)&&!values[cmRetiredIndex]&&values[0]===state.values[0]&&values[1]===state.values[1]&&values[2+cmKinds.indexOf(category)]===state.values[2+cmKinds.indexOf(category)]&&values[cmVersionIndex]===state.values[cmVersionIndex];}
function cmMerged(ranges){const out=[];for(const p of [...ranges].sort((a,b)=>a[0]-b[0])){const last=out[out.length-1];if(last&&p[0]<=last[1]+1)last[1]=Math.max(last[1],p[1]);else out.push([...p]);}return out;}
function cmGaps(start,end,ranges){let cursor=start;const result=[];for(const [a,b]of cmMerged(ranges)){if(b<cursor)continue;if(a>end)break;if(a>cursor)result.push([cursor,Math.min(end,a-1)]);cursor=Math.max(cursor,b+1);}if(cursor<=end)result.push([cursor,end]);return result;}
function cmDeleteParts(store,file){const q=store.index('file').openKeyCursor(IDBKeyRange.only(file));q.onsuccess=()=>{const c=q.result;if(c){store.delete(c.primaryKey);c.continue();}};}
async function cmReset(state){const db=await cmDB();await new Promise((resolve,reject)=>{const tx=db.transaction(['objects','media-ranges','retired'],'readwrite');const r=tx.objectStore('retired');const q=r.get('@cm-file:'+state.file);q.onsuccess=()=>{r.put(Number(q.result||0)+1,'@cm-file:'+state.file);tx.objectStore('objects').delete(state.file);cmDeleteParts(tx.objectStore('media-ranges'),state.file);};tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error);});return cmSnapshot(state.scope,state.id);}
async function cmCommit(state,info,bytes,start,finish=false){
 if(!cmScopeCurrent(state))return false;const db=await cmDB();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['objects','media-ranges','retired'],'readwrite'),r=tx.objectStore('retired'),parts=tx.objectStore('media-ranges');let values=[],meta,left=state.keys.length+1,written=false,complete=false;
  const ready=()=>{if(--left)return;if(!cmLeaseOK(state,values,info.type))return;if(meta&&(meta.tag!==info.tag||meta.transfer!==info.transfer&&!cmStrong(info.tag)))return;
   meta=meta||{key:state.file,file:state.file,kind:'meta',user:state.scope.user,id:state.id,type:info.type,tag:info.tag,total:info.total,transfer:info.transfer,ranges:[],used:Date.now(),version:state.values[cmVersionIndex]||'',category:cmCategory(state.id,info.type)};
   if(bytes?.byteLength){for(const [a,b]of cmGaps(start,start+bytes.byteLength-1,meta.ranges)){const slice=bytes.slice(a-start,b-start+1);parts.put({key:state.file+'@part:'+a+':'+b,file:state.file,kind:'part',start:a,end:b,bytes:slice.buffer});meta.ranges.push([a,b]);}meta.ranges=cmMerged(meta.ranges);}
   if(finish&&info.total<0)meta.total=info.received;
   meta.used=Date.now();const coherent=cmStrong(info.tag)||info.start===0&&info.received===meta.total&&(finish||info.expected>=0);
   meta.complete=coherent&&meta.total>0&&meta.ranges.length===1&&meta.ranges[0][0]===0&&meta.ranges[0][1]===meta.total-1;
   meta.stored=meta.ranges.reduce((n,p)=>n+p[1]-p[0]+1,0);parts.put(meta);written=true;complete=meta.complete;
   if(complete)tx.objectStore('objects').put({key:state.file,user:state.scope.user,category:meta.category,size:meta.total,used:Date.now(),type:meta.type,stream:true,version:meta.version,etag:meta.tag});
  };
  state.keys.forEach((key,i)=>{const q=r.get(key);q.onsuccess=()=>{values[i]=q.result;ready();};});const q=parts.get(state.file);q.onsuccess=()=>{meta=q.result;ready();};tx.oncomplete=()=>{if(complete)void cmNotify(state.scope.user,state.id);resolve(written);};tx.onerror=tx.onabort=()=>reject(tx.error||Error('Media cache transaction failed'));
 });
}
async function cmNotify(user,id){for(const [clientId,scope]of cmScopes)if(scope.user===user){const client=await clients.get(clientId);client?.postMessage({type:'CONNECT_MEDIA_FILLED',protocol:1,user,id});}}
async function cmPart(file,offset){return cmRead(['media-ranges'],tx=>new Promise((resolve,reject)=>{const q=tx.objectStore('media-ranges').index('fileStart').openCursor(IDBKeyRange.bound([file,0],[file,offset]),'prev');q.onsuccess=()=>{const p=q.result?.value;resolve(p&&p.end>=offset?p:null);};q.onerror=()=>reject(q.error);}));}
async function cmSummaries(user){const db=await cmDB();return new Promise((resolve,reject)=>{const tx=db.transaction(['objects','media-ranges']),rows=new Map();const q=tx.objectStore('objects').openCursor();q.onsuccess=()=>{const c=q.result;if(c){const v=c.value;if(v.user===user)rows.set(v.key,{key:v.key,category:v.category,size:v.size,used:v.used,id:v.key.slice(user.length+1)});c.continue();}};const m=tx.objectStore('media-ranges').index('kind').getAll('meta');m.onsuccess=()=>{for(const v of m.result)if(v.user===user)rows.set(v.key,{key:v.key,category:v.category,size:v.stored||0,used:v.used,id:v.id});};tx.oncomplete=()=>resolve([...rows.values()]);tx.onerror=()=>reject(tx.error);});}
async function cmTrim(scope,keep){const rows=(await cmSummaries(scope.user)).sort((a,b)=>a.used-b.used);let temporary=rows.filter(v=>v.category!=='system').reduce((n,v)=>n+v.size,0),system=rows.filter(v=>v.category==='system').reduce((n,v)=>n+v.size,0);for(const row of rows){if(row.key===keep)continue;const protectedRow=row.category==='system';if(protectedRow?system<=64*1024**2:temporary<=scope.limit)continue;if(!cmScopeCurrent({scope}))return;await cmReset(await cmSnapshot(scope,row.id));if(protectedRow)system-=row.size;else temporary-=row.size;}}
function cmBounds(header,total){if(!header||header.includes(','))return[0,total-1];const m=/^bytes=(\d*)-(\d*)$/.exec(header);if(!m||!m[1]&&!m[2])return null;const a=m[1]?Number(m[1]):Math.max(0,total-Number(m[2])),b=m[1]&&m[2]?Math.min(total-1,Number(m[2])):total-1;return Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&a>=0&&a<total&&b>=a?[a,b]:null;}
function cmError(status,total){const h={'Cache-Control':'no-store'};if(total!==undefined)h['Content-Range']='bytes */'+total;return new Response(null,{status,headers:h});}
function cmHeaders(meta,range){const span=cmBounds(range,meta.total);if(!span)return null;const partial=range&&!range.includes(',');const headers={'Content-Type':meta.type||'application/octet-stream','Content-Length':String(span[1]-span[0]+1),'Accept-Ranges':'bytes','Cache-Control':'private, no-store'};if(meta.tag)headers.ETag=meta.tag;if(partial)headers['Content-Range']=`bytes ${span[0]}-${span[1]}/${meta.total}`;return{headers,status:partial?206:200,span};}
function cmLocal(state,meta,range){const spec=cmHeaders(meta,range);if(!spec)return cmError(416,meta.total);let pos=spec.span[0],closed=false;const body=new ReadableStream({async pull(controller){try{if(closed)return;if(!cmScopeCurrent(state))throw Error('Media account changed');if(pos>spec.span[1]){closed=true;controller.close();return;}const part=await cmPart(state.file,pos);if(!part)throw Error('Cached range is missing');const count=Math.min(spec.span[1]-pos+1,part.end-pos+1);controller.enqueue(new Uint8Array(part.bytes,pos-part.start,count));pos+=count;}catch(error){closed=true;controller.error(error);}},cancel(){closed=true;}});return new Response(body,spec);}
function cmLegacy(state,row,range){const blob=row.blob||(row.bytes instanceof ArrayBuffer?new Blob([row.bytes],{type:row.type||''}):null);if(!blob?.size)return null;const meta={type:row.type||blob.type,total:blob.size,tag:row.etag||''};const spec=cmHeaders(meta,range);if(!spec)return cmError(416,blob.size);return new Response(blob.slice(spec.span[0],spec.span[1]+1,meta.type),spec);}
function cmClean(request,range,tag){const url=new URL(request.url);url.searchParams.delete('__cm');url.searchParams.delete('__cm_local');const headers=new Headers(request.headers);if(range===null)headers.delete('range');else if(range!==undefined)headers.set('range',range);if(tag)headers.set('if-range',tag);return new Request(url.href,{method:'GET',headers,credentials:request.credentials,redirect:'follow',cache:'no-store',mode:'same-origin'});}
async function cmNetwork(event,request,state,range,tag,onFinish){
 let ended=false;const finish=()=>{if(!ended){ended=true;onFinish?.();}};let response;
 try{response=await fetch(cmClean(request,range,tag));}catch(error){finish();throw error;}
 if(!response.ok||response.type==='opaque'||!response.body){finish();return response;}
 const type=(response.headers.get('content-type')||'application/octet-stream').split(';')[0];const cr=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range')||'');const encoded=response.headers.get('content-encoding');const length=!encoded||encoded==='identity'?Number(response.headers.get('content-length')||-1):-1;
 const start=response.status===206&&cr?Number(cr[1]):0,expected=response.status===206&&cr?Number(cr[2])-start+1:length,total=response.status===206&&cr?Number(cr[3]):length;
 if(![200,206].includes(response.status)||type==='text/html'||type.includes('application/json')||response.status===206&&(!cr||expected<=0||total<=0||start+expected>total)||total>state.scope.limit){finish();return response;}
 const etag=response.headers.get('etag')||'';const info={type,tag:etag,start,total,expected,received:0,transfer:state.scope.nonce+':'+Date.now()+':'+Math.random()};
 if(state.meta&&(state.meta.tag!==etag||state.meta.total!==total||!cmStrong(etag))){state=await cmReset(state);}
 const reader=response.body.getReader();let pending=[],pendingBytes=0,pendingStart=start,closed=false,writable=true;let settle;event.waitUntil(new Promise(resolve=>settle=resolve));
 async function flush(done){if(!writable)return;const bytes=new Uint8Array(pendingBytes);let off=0;for(const part of pending){bytes.set(part,off);off+=part.length;}try{writable=await cmCommit(state,info,bytes,pendingStart,done);}catch{writable=false;}pending=[];pendingBytes=0;pendingStart=start+info.received;}
 const stop=()=>{finish();settle();};
 const stream=new ReadableStream({async pull(controller){if(closed)return;try{if(!cmScopeCurrent(state))throw Error('Media account changed');const {value,done}=await reader.read();if(done){if(expected>=0&&info.received!==expected)throw Error('Truncated media response');await flush(true);closed=true;controller.close();stop();void cmTrim(state.scope,state.file).catch(()=>{});return;}if(expected>=0&&info.received+value.length>expected)throw Error('Oversized media range');if(start+info.received+value.length>Math.min(state.scope.limit,2*1024**3)){writable=false;pending=[];pendingBytes=0;}
 if(writable){pending.push(value.slice());pendingBytes+=value.length;}info.received+=value.length;if(pendingBytes>=256*1024)await flush(false);controller.enqueue(value);
 }catch(error){closed=true;await reader.cancel().catch(()=>{});controller.error(error);stop();}},async cancel(reason){if(closed)return;closed=true;await flush(false);await reader.cancel(reason).catch(()=>{});stop();}});
 const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('transfer-encoding');if(encoded&&encoded!=='identity')headers.delete('content-length');headers.set('cache-control','private, no-store');return new Response(stream,{status:response.status,statusText:response.statusText,headers});
}
async function cmGetScope(event){let scope=cmScopes.get(event.clientId);if(scope)return scope;const client=await clients.get(event.clientId);if(!client)return null;const data=await new Promise(resolve=>{const c=new MessageChannel();const timer=setTimeout(()=>{c.port1.close();resolve(null);},2500);c.port1.onmessage=e=>{clearTimeout(timer);c.port1.close();resolve(e.data);};client.postMessage({type:'CONNECT_MEDIA_SCOPE_REQUEST',protocol:1},[c.port2]);});if(data&&typeof data.user==='string'&&data.user.length<=128&&/^[A-Za-z0-9_-]{32,128}$/.test(data.nonce)){scope={client:event.clientId,user:data.user,nonce:data.nonce,limit:Math.max(0,Math.min(2*1024**3,Number(data.limit)||500*1024**2))};cmScopes.set(event.clientId,scope);return scope;}return null;}
async function cmHandle(event){
 const request=event.request,url=new URL(request.url),id=cmIdentity(url.href);let scope=await cmGetScope(event);if(!scope)return cmError(403);if(url.searchParams.get('__cm')!==scope.nonce)return cmError(403);
 let state;try{state=await cmSnapshot(scope,id);}catch{return fetch(cmClean(request,undefined,null));}if(state.values[cmRetiredIndex])return cmError(410);let range=request.headers.get('range');if(request.headers.has('if-range')&&request.headers.get('if-range')!==state.meta?.tag)range=null;
 const local=()=>{if(state.row&&!state.row.stream)return cmLegacy(state,state.row,range);if(state.meta&&state.meta.total>0){const span=cmBounds(range,state.meta.total);if(!span)return cmError(416,state.meta.total);if(state.meta.complete||cmStrong(state.meta.tag)&&!cmGaps(...span,state.meta.ranges).length)return cmLocal(state,state.meta,range);}return null;};
 let ready=local();if(ready)return ready;if(url.searchParams.has('__cm_local'))return cmError(504);
 let release;const image=!['audio','videos'].includes(cmCategory(id));if(image){const pending=cmFlights.get(state.file);if(pending){await pending;if(!cmScopeCurrent(state))return cmError(403);state=await cmSnapshot(scope,id);if(state.values[cmRetiredIndex])return cmError(410);ready=local();if(ready)return ready;}
 let done;const task=new Promise(resolve=>done=resolve);cmFlights.set(state.file,task);release=()=>{if(cmFlights.get(state.file)===task)cmFlights.delete(state.file);done();};}
 try{
  const meta=state.meta;if(meta&&meta.total>0&&cmStrong(meta.tag)){
   const span=cmBounds(range,meta.total);if(!span){release?.();return cmError(416,meta.total);}const gaps=cmGaps(...span,meta.ranges),[first,end]=gaps[0];const initial=await cmNetwork(event,request,state,`bytes=${first}-${end}`,meta.tag);
   if(initial.status!==206||initial.headers.get('etag')!==meta.tag){release?.();return initial;}
   if(initial.headers.get('content-range')!==`bytes ${first}-${end}/${meta.total}`){await initial.body?.cancel();release?.();return cmError(502);}
   let pos=span[0],reader=null,segmentEnd=-1,used=false,closed=false;let settle;event.waitUntil(new Promise(resolve=>settle=resolve));const finish=()=>{release?.();settle();};
   const stream=new ReadableStream({async pull(controller){try{if(closed)return;if(!cmScopeCurrent(state))throw Error('Media account changed');if(pos>span[1]){await reader?.cancel();closed=true;controller.close();finish();return;}
    if(!reader||pos>segmentEnd){await reader?.cancel();reader=null;const snapshot=await cmSnapshot(scope,id);if(snapshot.values[cmRetiredIndex]||snapshot.values[1]!==state.values[1]||snapshot.values[0]!==state.values[0])throw Error('Media was cleared');const m=snapshot.meta;if(!m||m.tag!==meta.tag)throw Error('Media version changed');const available=m.ranges.find(r=>pos>=r[0]&&pos<=r[1]);if(available){segmentEnd=Math.min(span[1],available[1]);reader=cmLocal(state,m,`bytes=${pos}-${segmentEnd}`).body.getReader();}
    else{segmentEnd=Math.min(span[1],...m.ranges.filter(r=>r[0]>pos).map(r=>r[0]-1));const part=!used&&pos===first?(used=true,initial):await cmNetwork(event,request,state,`bytes=${pos}-${segmentEnd}`,meta.tag);if(part.status!==206||part.headers.get('etag')!==meta.tag){await part.body?.cancel();await cmReset(state);throw Error('Media changed during playback');}reader=part.body.getReader();}}
    const {value,done}=await reader.read();if(done)throw Error('Truncated cached/network range');pos+=value.length;if(pos>segmentEnd+1)throw Error('Invalid cached/network range');controller.enqueue(value);
   }catch(error){closed=true;await reader?.cancel().catch(()=>{});if(!used)await initial.body?.cancel();controller.error(error);finish();}},async cancel(reason){closed=true;await reader?.cancel(reason).catch(()=>{});if(!used)await initial.body?.cancel(reason);finish();}});
   return new Response(stream,cmHeaders(meta,range));
  }
  return await cmNetwork(event,request,state,range,null,release);
 }catch(error){release?.();throw error;}
}
async function cmMessage(event){const d=event.data||{},client=event.source;if(!client?.id||new URL(client.url).origin!==self.location.origin)return;const reply=value=>event.ports?.[0]?.postMessage(value);
 if(d.type==='CONNECT_MEDIA_BIND'&&d.protocol===1&&typeof d.user==='string'&&d.user.length>0&&d.user.length<=128&&/^[A-Za-z0-9_-]{32,128}$/.test(d.nonce)){const prior=cmScopes.get(client.id);if(prior?.user===d.user&&prior.nonce===d.nonce){prior.limit=Math.max(0,Math.min(2*1024**3,Number(d.limit)||500*1024**2));}else cmScopes.set(client.id,{client:client.id,user:d.user,nonce:d.nonce,limit:Math.max(0,Math.min(2*1024**3,Number(d.limit)||500*1024**2))});await cmDB();reply({protocol:1,supported:true});}
 if(d.type==='CONNECT_MEDIA_UNBIND'&&cmScopes.get(client.id)?.nonce===d.nonce){cmScopes.delete(client.id);reply({protocol:1,supported:true});}
}
