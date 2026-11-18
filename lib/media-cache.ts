/** Separate database: clearing media never touches auth, keys, history or outbox. */
export type CacheCategory = 'system' | 'photos' | 'videos' | 'audio' | 'other';
type Entry = {
    key: string;
    user: string;
    category: CacheCategory;
    size: number;
    used: number;
    blob?: Blob;
    bytes?: ArrayBuffer;
    type?: string;
};
const NAME = 'connect-media-v1', STORE = 'objects', META='metadata';
type Metadata=Omit<Entry,'blob'|'bytes'>;
function metadataOf(row:Entry):Metadata {return {key:row.key,user:row.user,category:row.category,size:row.size,used:row.used,type:row.type||row.blob?.type};}
function writeEntry(tx:IDBTransaction,row:Entry){tx.objectStore(STORE).put(row);tx.objectStore(META).put(metadataOf(row));}
let opening: Promise<IDBDatabase> | undefined;
let owner = '';
/** IDB entries and signed URLs are scoped to the current viewer. */
export function mediaCacheOwner(){return owner;}
const objectUrls = new Map<string, string>(), pending = new Map<string, Promise<void>>();
const originals = new Map<string, string>();
type MediaElement = HTMLImageElement | HTMLMediaElement;
type Binding = { source: string; current: string; retried: boolean };
const bindings = new Map<MediaElement, Binding>();
function restoreUrl(url: string) {
    for (const [element, binding] of bindings) {
        if (element.getAttribute('src') === url) {
            binding.current = binding.source;
            element.src = binding.source;
        }
    }
    URL.revokeObjectURL(url);
    originals.delete(url);
}
/** Keep displayed/playing resources intact; bound only URLs without a live DOM consumer. */
function releaseIdleObjectUrls(){
 if(objectUrls.size<=128)return;
 const used=new Set([...bindings].filter(([el])=>el.isConnected).map(([el])=>el.getAttribute('src')));
 for(const [key,url]of objectUrls){if(objectUrls.size<=128)break;if(!used.has(url)){URL.revokeObjectURL(url);originals.delete(url);objectUrls.delete(key);}}
}
function contentType(key: string, type = '') {
    type = type.split(';')[0].toLowerCase();
    if (type && type !== 'application/octet-stream') return type;
    const extension = key.split('.').pop()?.toLowerCase();
    return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', webm: 'video/webm' } as Record<string, string>)[extension || ''] || type;
}
function usableType(type: string) { return !/^(?:text\/html|application\/(?:json|xhtml\+xml))$/.test(type); }
const LIMITS = { '500': 500 * 1024 ** 2, '1000': 1024 ** 3, '2000': 2 * 1024 ** 3, auto: 500 * 1024 ** 2 };
export function mediaIdentity(url: string): string | null {
    try {
        const u = new URL(url, location.href);
        if (u.origin !== location.origin && !['tpwkmoxxzjfdsqsomhhr.supabase.co', 'tpwkmoxxzjfdsqsomhhr.storage.supabase.co', 'appassets.androidplatform.net'].includes(u.hostname))
            return null;
        if (u.hostname === 'appassets.androidplatform.net' && u.pathname.startsWith('/assets/connect-web/'))
            return 'core/' + u.pathname.slice('/assets/connect-web/'.length);
        const m = u.pathname.match(/\/(?:storage\/v1\/object\/(?:sign|public|authenticated)|connect-web)\/(.+)$/);
        if (m)
            return decodeURIComponent(m[1]);
        if (u.origin === location.origin && /^\/(?:icon-|apple-touch|favicon|stickers\/|connect-crypto\/)/.test(u.pathname))
            return 'core' + u.pathname;
    }
    catch { }
    return null;
}
export function mediaCategory(key: string, type = ''): CacheCategory {
    if (key.startsWith('core') || key.startsWith('connect-avatars/'))
        return 'system';
    if (type.startsWith('video/') || /\.(mp4|webm|mov)(?:$|__)/i.test(key))
        return 'videos';
    if (type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|opus|wav|flac)$/i.test(key))
        return 'audio';
    if (type.startsWith('image/') || /\.(png|webp|gif|jpe?g)$/i.test(key) || key.startsWith('connect-stickers/'))
        return 'photos';
    return 'other';
}
function db():Promise<IDBDatabase> {
 return opening??=new Promise((resolve,reject)=>{
  const request=indexedDB.open(NAME,4);
  request.onupgradeneeded=()=>{
   const database=request.result,tx=request.transaction!;
   if(!database.objectStoreNames.contains(STORE))database.createObjectStore(STORE,{keyPath:'key'});
   for(const name of ['links','retired'])if(!database.objectStoreNames.contains(name))database.createObjectStore(name);
   if(!database.objectStoreNames.contains(META)){
    const metadata=database.createObjectStore(META,{keyPath:'key'});metadata.createIndex('user','user');
    // One legacy record at a time, never all binary values in one array.
    const cursor=tx.objectStore(STORE).openCursor();
    cursor.onsuccess=()=>{const item=cursor.result;if(item){metadata.put(metadataOf(item.value));item.continue();}};
   }
  };
  request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=undefined;};resolve(request.result);};
  request.onerror=()=>{opening=undefined;reject(request.error);};
 });
}
async function run<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
 const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction(STORE,mode),request=operation(tx.objectStore(STORE));let value:T;
  request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>resolve(value);
  tx.onerror=tx.onabort=()=>reject(tx.error||request.error||Error('Cache transaction aborted'));
 });
}
async function entries(user=owner):Promise<Metadata[]> {
 if(!user)return [];
 const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction(META,'readonly'),request=tx.objectStore(META).index('user').getAll(user);let rows:Metadata[]=[];
  request.onsuccess=()=>{rows=request.result;};tx.oncomplete=()=>resolve(rows);tx.onerror=tx.onabort=()=>reject(tx.error||request.error);
 });
}
async function removeEntry(key:string):Promise<void> {
 const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction([STORE,META],'readwrite');tx.objectStore(STORE).delete(key);tx.objectStore(META).delete(key);
  tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}
async function putEntry(row:Entry):Promise<void> {
 const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction([STORE,META],'readwrite');writeEntry(tx,row);
  tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}
async function touchEntry(key:string,used:number):Promise<void> {
 const database=await db();return new Promise((resolve,reject)=>{
  const tx=database.transaction(META,'readwrite'),store=tx.objectStore(META),request=store.get(key);
  request.onsuccess=()=>{if(request.result)store.put({...request.result,used});};
  tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error);
 });
}
export function cacheLimit() { try {
    return (localStorage.getItem('connect-cache-limit') || 'auto') as keyof typeof LIMITS;
}
catch {
    return 'auto';
} }
export function setCacheLimit(value: string) { if (!(value in LIMITS))
    throw Error('Недопустимый лимит кеша'); localStorage.setItem('connect-cache-limit', value); void trimCache(); }
export async function cacheStats() { const result: Record<CacheCategory, number> = { system: 0, photos: 0, videos: 0, audio: 0, other: 0 }; for (const row of await entries())
    if (row.user === owner)
        result[row.category] += row.size; return result; }
export async function clearCachedMedia(category: CacheCategory | 'temporary', identity?: string) {
    const viewer=owner;
    const rows=identity?[{key:viewer+':'+identity,user:viewer,category}]:await entries(viewer);
    for (const row of rows) {
        if (row.user !== viewer || !identity && row.category === 'system') continue;
        if (!identity && category !== 'temporary' && row.category !== category) continue;
        await removeEntry(row.key);
        const url=objectUrls.get(row.key);
        if(url){restoreUrl(url);objectUrls.delete(row.key);}
    }
    window.dispatchEvent(new Event('connect:cache-changed'));
}
let trimPending:Promise<void>|null=null;
export function trimCache():Promise<void> {return trimPending??=trimCacheNow().finally(()=>{trimPending=null;});}
async function trimCacheNow() {
    const viewer=owner;
    const rows = (await entries(viewer)).filter(x => x.user === viewer).sort((a, b) => a.used - b.used);
    let temporary = rows.filter(x => x.category !== 'system').reduce((n, x) => n + x.size, 0), avatars = rows.filter(x => x.category === 'system' && !x.key.includes(':core')).reduce((n, x) => n + x.size, 0);
    const limit = LIMITS[cacheLimit()] || LIMITS.auto;
    for (const row of rows) {
        const avatar = row.category === 'system' && !row.key.includes(':core'), expired = Boolean((window as Window & {ConnectAndroid?:unknown;ConnectNative?:unknown}).ConnectAndroid||(window as Window & {ConnectAndroid?:unknown;ConnectNative?:unknown}).ConnectNative) && Date.now() - row.used > 30 * 86400000;
        if (row.category === 'system' ? !avatar || avatars <= 64 * 1024 ** 2 : temporary <= limit && !expired)
            continue;
        await removeEntry(row.key);
        const local = objectUrls.get(row.key);
        if (local) { restoreUrl(local); objectUrls.delete(row.key); }
        if (avatar)
            avatars -= row.size;
        else
            temporary -= row.size;
    }
}
export async function resolveCachedMedia(url: string, user = owner): Promise<string> { const id = mediaIdentity(url); if (!id || !user || id.startsWith('core'))
    return url; const key = user + ':' + id; if(user!==owner)return url; try {
    const row = await run<Entry | undefined>('readonly', s => s.get(key));
    if (!row || user!==owner)
        return url;
    const type = contentType(id, row.type || row.blob?.type);
    const blob = row.blob || (row.bytes instanceof ArrayBuffer ? new Blob([row.bytes], { type }) : undefined);
    if (!blob?.size || !usableType(type)) {
        await removeEntry(key);
        return url;
    }
    if (Date.now() - row.used > 60000) {
        row.used = Date.now();
        void touchEntry(key,row.used).catch(()=>{});
    }
    let local = objectUrls.get(key);
    if (!local) {
        local = URL.createObjectURL(blob.type === type ? blob : blob.slice(0, blob.size, type));
        releaseIdleObjectUrls();
        objectUrls.set(key, local);
    }
    originals.set(local, url);
    return local;
}
catch {
    return url;
} }
// Bound cache fills independently of the number of mounted messages. Visible
// interface/avatars precede small previews; originals enter only on playback.
let cacheWorkers=0;
const cacheJobs:{priority:number;run:()=>Promise<void>;resolve:()=>void}[]=[];
function cacheJob(priority:number,run:()=>Promise<void>){return new Promise<void>(resolve=>{cacheJobs.push({priority,run,resolve});cacheJobs.sort((a,b)=>a.priority-b.priority);pumpCacheJobs();});}
function pumpCacheJobs(){while(cacheWorkers<3&&cacheJobs.length){const job=cacheJobs.shift()!;cacheWorkers++;void job.run().catch(()=>{}).finally(()=>{cacheWorkers--;job.resolve();pumpCacheJobs();});}}
async function remember(url: string, user: string, maxBytes = 256 * 1024 ** 2, needLength = false) { const id = mediaIdentity(url); if (!id || !user || id.startsWith('core'))
    return; const key = user + ':' + id; if (pending.has(key))
    return pending.get(key); const operation = cacheJob(mediaCategory(id)==='system'?0:/__(thumb\.webp|poster\.jpg)$/.test(id)?1:2,async () => { if (owner!==user || await run('readonly', s => s.get(key)))
    return; const response = await fetch(url, { cache: 'force-cache' }); if (!response.ok || response.status === 206)
    return; const length = Number(response.headers.get('content-length') || 0); if (length > maxBytes || (needLength && !length))
    return; const blob = await response.blob(); if (!blob.size || blob.size > maxBytes)
    return; const type = contentType(id, blob.type); if (!usableType(type)) return;
    // ArrayBuffer avoids WebKit's IndexedDB Blob-file staging failures. Old Blob
    // records remain readable; cache errors always leave the network URL usable.
    const bytes = await blob.arrayBuffer();
    const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction([STORE,META,'retired'],'readwrite');const check=tx.objectStore('retired').get(key);check.onsuccess=()=>{if(!check.result&&owner===user)writeEntry(tx,{key,user,category:mediaCategory(id,type),size:blob.size,used:Date.now(),bytes,type} satisfies Entry);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error || Error('Cache write aborted'));}); await trimCache(); }).catch(() => { }).finally(() => pending.delete(key)); pending.set(key, operation); return operation; }
export function installMediaCache(user: string, refreshUrl?: (source: string) => Promise<string | undefined>) {
    owner = user;
    let alive = true;
    const visible = new IntersectionObserver(items => { for (const item of items)
        if (item.isIntersecting) {
            const el = item.target as HTMLImageElement;
            if (el.complete && el.naturalWidth)
                void remember(originals.get(el.src) || el.currentSrc || el.src, user);
            visible.unobserve(el);
        } }, { rootMargin: '0px' });
    const scan = () => {
        for (const el of bindings.keys()) if (!el.isConnected) bindings.delete(el);
        document.querySelectorAll<MediaElement>('img[src],audio[src],video[src]').forEach(el => {
            const current = el.getAttribute('src') || '', source = originals.get(current) || current;
            if (!mediaIdentity(source) || bindings.get(el)?.current === current) return;
            const binding: Binding = { source, current, retried: false };
            bindings.set(el, binding);
            // Never change the source under an already playing audio/video.
            if (!(el instanceof HTMLMediaElement) || el.paused && !el.currentTime) {
                void resolveCachedMedia(source, user).then(local => {
                    if (alive && bindings.get(el) === binding && local !== current && el.getAttribute('src') === current) {
                        binding.current = local;
                        el.src = local;
                    }
                    // CONNECT_PWA_MEDIA_CACHE_NATIVE_IMAGE_ERRORS_FIX3_20261115
                    // A new blob: src may be complete with zero naturalWidth while
                    // decode is pending. Wait for the browser's native error event;
                    // synthesizing one here evicts a valid persistent cache entry.
                });
            }
            if (el instanceof HTMLImageElement) visible.observe(el);
        });
    };
    const failed = (event: Event) => {
        const el = event.target;
        if (!(el instanceof HTMLImageElement || el instanceof HTMLMediaElement)) return;
        const binding = bindings.get(el);
        if (!binding || binding.retried) return;
        const failedSrc = el.getAttribute('src') || '';
        if (failedSrc !== binding.current) return;
        binding.retried = true;
        void (async () => {
            // CONNECT_MEDIA_STALE_IMAGE_ERROR_GUARD_20261117
            // An old request can dispatch `error` after a healthy cached blob
            // becomes current. Only evict when the CURRENT image fails decode.
            if (el instanceof HTMLImageElement && originals.has(failedSrc)) {
                try {
                    await el.decode();
                    if (alive && bindings.get(el) === binding && el.getAttribute('src') === failedSrc) {
                        binding.retried = false;
                        return;
                    }
                } catch { /* Decode really failed; follow existing repair path. */ }
            }
            if (!alive || bindings.get(el) !== binding || el.getAttribute('src') !== failedSrc) {
                binding.retried = false;
                return;
            }
            const id = mediaIdentity(binding.source);
            if (!id) return;
            if (originals.has(el.src)) await clearCachedMedia('temporary', id).catch(() => {});
            const refreshed = await refreshUrl?.(binding.source).catch(() => undefined);
            if (!alive || bindings.get(el) !== binding || !el.isConnected) return;
            const source = refreshed || binding.source;
            // No retries for a failed, unchanged public URL. Storage links may
            // have expired; obtain a new signed URL using the current session.
            if (source !== el.src) {
                binding.source = source;
                binding.current = source;
                el.src = source;
                if (el instanceof HTMLMediaElement) el.load();
            }
        })();
    };
    // CONNECT_PWA_MEDIA_EGRESS_FIX_20261115
    // Audio/video can use HTTP Range requests while playing. A parallel fetch()
    // on every play event doubles network egress, particularly for videos.
    // Keep image caching and bounded, explicit audio/thumbnail prefetch only.
    const loaded = (event: Event) => {
        const el = event.target;
        if (el instanceof HTMLImageElement && el.getBoundingClientRect().bottom >= 0 && el.getBoundingClientRect().top <= innerHeight)
            void remember(originals.get(el.src) || el.currentSrc || el.src, user);
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.addEventListener('load', loaded, true);
    document.addEventListener('error', failed, true);
    scan();
    void trimCache().catch(() => { });
    void navigator.storage?.persist?.().catch(() => { });
    return () => { alive = false; observer.disconnect(); visible.disconnect(); document.removeEventListener('load', loaded, true); document.removeEventListener('error', failed, true); if (owner === user)
        owner = ''; for (const url of objectUrls.values())
        restoreUrl(url); objectUrls.clear(); bindings.clear(); };
}

/** Local content index contains only message IDs and stable storage identities. */
export async function linkMessageMedia(user:string,message:string,paths:string[]){
 if(!paths.length)return;const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction(['links','retired'],'readwrite');const identities=[...new Set(paths.flatMap(path=>[path,path+'__thumb.webp',path+'__poster.jpg']))].map(path=>'connect-attachments/'+path);const guard=tx.objectStore('retired').get(user+':message:'+message);guard.onsuccess=()=>{if(guard.result)return;tx.objectStore('links').put(identities,user+':'+message);for(const identity of identities)tx.objectStore('retired').delete(user+':'+identity);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function purgeDeletedMedia(user:string,message:string){
 if(owner!==user)return;const d=await db();const paths=await new Promise<string[]>((resolve,reject)=>{
  const tx=d.transaction(['links','retired'],'readwrite'),store=tx.objectStore('links'),keys=store.getAllKeys(),values=store.getAll();tx.objectStore('retired').put(true,user+':message:'+message);let deleted:string[]=[];
  values.onsuccess=()=>{const index=keys.result.findIndex(key=>key===user+':'+message);const current:string[]=index<0?[]:values.result[index];deleted=current.filter(path=>!values.result.some((other,i)=>i!==index&&String(keys.result[i]).startsWith(user+':')&&other.includes(path)));store.delete(user+':'+message);for(const path of deleted)tx.objectStore('retired').put(true,user+':'+path);};
  tx.oncomplete=()=>resolve(deleted);tx.onerror=()=>reject(tx.error);
 });for(const path of paths)await clearCachedMedia('temporary',path);
}

/** Background warmup of visible, lightweight chat previews; best effort. */
export async function prefetchCachedMedia(url:string,user:string,smallOriginal=false):Promise<void>{
  const id=mediaIdentity(url);if(!url||!user||!id)return;
  const lightweight=mediaCategory(id)==='system'||/__(thumb\.webp|poster\.jpg)$/.test(id);
  const smallPhoto=smallOriginal&&mediaCategory(id)==='photos';
  if(!lightweight&&!smallPhoto)return;
  try{await remember(url,user,smallPhoto?6*1024**2:256*1024**2,smallPhoto);}catch{/* Network fallback remains usable. */}
}


/** Look up private profile media bytes using stable storage identity.
 * The catalog never needs an expired signed URL to show locally cached files.
 */
export async function resolveCachedProfileFile(viewer:string,path:string):Promise<string|null>{
  if(!viewer||!/^[-a-zA-Z0-9_]+\/(?:photos|videos|music)\/[^?#]+$/.test(path))return null;
  const id='connect-profile-media/'+path, key=viewer+':'+id;
  try{
    const row=await run<Entry|undefined>('readonly',store=>store.get(key));
    if(!row||row.user!==viewer)return null;
    const type=contentType(id,row.type||row.blob?.type);
    const blob=row.blob||(row.bytes instanceof ArrayBuffer?new Blob([row.bytes],{type}):undefined);
    if(!blob?.size||!usableType(type))return null;
    let url=objectUrls.get(key);
    if(!url){url=URL.createObjectURL(blob.type===type?blob:blob.slice(0,blob.size,type));objectUrls.set(key,url);}
    return url;
  }catch{return null;}
}

/** Stop inflight fills from restoring an item deleted remotely. */
export async function retireCachedProfileFile(viewer:string,path:string):Promise<void>{
  if(!viewer||owner!==viewer||!/^[-a-zA-Z0-9_]+\/(?:photos|videos|music)\/[^?#]+$/.test(path))return;
  const key=viewer+':connect-profile-media/'+path;
  try{
    const database=await db();
    await new Promise<void>((resolve,reject)=>{
      const tx=database.transaction([STORE,META,'retired'],'readwrite');
      tx.objectStore('retired').put(true,key);
      tx.objectStore(STORE).delete(key);tx.objectStore(META).delete(key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    const local=objectUrls.get(key);
    if(local){restoreUrl(local);objectUrls.delete(key);}
  }catch{/* A failed local purge must not affect remote deletion. */}
}

/** On successful owner upload, keep a small original without a second download. */
export async function cacheUploadedProfileFile(viewer:string,path:string,file:File):Promise<void>{
  if(!viewer||owner!==viewer||!/^[-a-zA-Z0-9_]+\/(?:photos|videos|music)\/[^?#]+$/.test(path))return;
  const id='connect-profile-media/'+path;
  const category=mediaCategory(id,file.type);
  const max=category==='photos'?8*1024**2:category==='audio'?24*1024**2:20*1024**2;
  if(!file.size||file.size>max)return;
  try{
    const bytes=await file.arrayBuffer();
    if(owner!==viewer)return;
    await putEntry({key:viewer+':'+id,user:viewer,category,size:file.size,used:Date.now(),bytes,type:file.type||contentType(id)} satisfies Entry);
    void trimCache().catch(()=>{});
  }catch{/* Storage quota failure is not an upload failure. */}
}

/** Load only small photos, audio and short videos in background; full-size media
 * not cached yet can always stream over the existing signed URL.
 */
// CONNECT_PWA_CONTACT_PROFILE_WARM_V3_20261111
export async function prefetchProfileFile(url:string,viewer:string,kind:'photos'|'videos'|'music',limitBytes?:number):Promise<void>{
  const id=mediaIdentity(url);
  if(!id?.startsWith('connect-profile-media/')||!viewer)return;
  const category=mediaCategory(id);
  if((kind==='photos'&&category!=='photos')||(kind==='music'&&category!=='audio')||(kind==='videos'&&category!=='videos'))return;
  // Video posters are fetched separately; originals stream only on playback.
  if(kind==='videos')return;
  const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
  if(connection?.saveData||connection?.effectiveType==='2g')return;
  const defaultMax=kind==='photos'?8*1024**2:kind==='music'?24*1024**2:16*1024**2;
  const max=typeof limitBytes==='number'&&Number.isFinite(limitBytes)?Math.max(0,Math.min(defaultMax,limitBytes)):defaultMax;
  if(!max)return;
  try{await remember(url,viewer,max,true);}catch{/* Network streaming remains available. */}
}


/** Save a generated video-note first frame to the existing account-scoped media cache.
 * Only a JPEG image is written. This never persists an extra video decoder.
 */
export async function storeGeneratedChatPoster(viewer:string,path:string,image:Blob):Promise<string|null>{
  if(!viewer||owner!==viewer||!path||image.type!=='image/jpeg'||!image.size||image.size>512*1024)return null;
  const identity='connect-attachments/'+path+'__poster.jpg',key=viewer+':'+identity;
  try{
    const bytes=await image.arrayBuffer();
    const database=await db();
    await new Promise<void>((resolve,reject)=>{
      const tx=database.transaction([STORE,META,'retired'],'readwrite');
      const guard=tx.objectStore('retired').get(key);
      guard.onsuccess=()=>{if(!guard.result&&owner===viewer)writeEntry(tx,{key,user:viewer,category:'photos',size:image.size,used:Date.now(),bytes,type:'image/jpeg'} satisfies Entry);};
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
    });
    return await resolveCachedMedia('/storage/v1/object/sign/'+identity,viewer);
  }catch{return null;}
}

/** CONNECT_PWA_CHAT_STICKER_CACHE_V1_20261115
 * Cache WebP by its stable authenticated Storage path, not signed URL tokens.
 */
export async function prefetchStickerWebp(url:string,user:string):Promise<void>{
  const id=mediaIdentity(url);
  if(!url||!user||!id?.startsWith('connect-stickers/'))return;
  await remember(url,user,2*1024*1024,false);
}

/** CONNECT_PWA_CHAT_AUDIO_LAZY_CACHE_V1_20261115
 * Warm a couple of small voice messages without blocking chat rendering.
 * Persist by stable storage path, not by expiring signed URL.
 */
export async function prefetchChatAudio(url:string,user:string,declaredSize:number):Promise<void>{
  const id=mediaIdentity(url);
  if(!url||!user||!id?.startsWith('connect-attachments/')||!declaredSize||declaredSize>1024*1024)return;
  await remember(url,user,1024*1024,false);
}
