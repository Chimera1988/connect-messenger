/** Separate database: clearing media never touches auth, keys, history or outbox. */
export type CacheCategory = 'system' | 'photos' | 'videos' | 'audio' | 'other';
type Entry = {
    key: string;
    user: string;
    category: CacheCategory;
    size: number;
    used: number;
    blob: Blob;
};
const NAME = 'connect-media-v1', STORE = 'objects';
let opening: Promise<IDBDatabase> | undefined;
let owner = '';
const objectUrls = new Map<string, string>(), pending = new Map<string, Promise<void>>();
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
function db() { return opening ??= new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open(NAME, 3); r.onupgradeneeded = () => { if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE, { keyPath: 'key' });
        if(!r.result.objectStoreNames.contains('links'))r.result.createObjectStore('links');
        if(!r.result.objectStoreNames.contains('retired'))r.result.createObjectStore('retired'); }; r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); opening = undefined; }; resolve(r.result); }; r.onerror = () => { opening = undefined; reject(r.error); }; }); }
async function run<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const d = await db(); return new Promise((resolve, reject) => { const t = d.transaction(STORE, mode), r = operation(t.objectStore(STORE)); let value: T; r.onsuccess = () => { value = r.result; }; t.oncomplete = () => resolve(value); t.onerror = () => reject(t.error || r.error); t.onabort = () => reject(t.error || Error('Cache transaction aborted')); }); }
async function entries() { return run<Entry[]>('readonly', s => s.getAll()); }
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
    const rows = await entries();
    for (const row of rows) {
        if (row.user !== owner || !identity && row.category === 'system')
            continue;
        if (identity ? row.key !== owner + ':' + identity : category !== 'temporary' && row.category !== category)
            continue;
        await run('readwrite', s => s.delete(row.key));
        const url = objectUrls.get(row.key);
        if (url) {
            URL.revokeObjectURL(url);
            objectUrls.delete(row.key);
        }
    }
    window.dispatchEvent(new Event('connect:cache-changed'));
}
export async function trimCache() {
    const rows = (await entries()).filter(x => x.user === owner).sort((a, b) => a.used - b.used);
    let temporary = rows.filter(x => x.category !== 'system').reduce((n, x) => n + x.size, 0), avatars = rows.filter(x => x.category === 'system' && !x.key.includes(':core')).reduce((n, x) => n + x.size, 0);
    const limit = LIMITS[cacheLimit()] || LIMITS.auto;
    for (const row of rows) {
        const avatar = row.category === 'system' && !row.key.includes(':core'), expired = Date.now() - row.used > 30 * 86400000;
        if (row.category === 'system' ? !avatar || avatars <= 64 * 1024 ** 2 : temporary <= limit && !expired)
            continue;
        await run('readwrite', s => s.delete(row.key));
        if (avatar)
            avatars -= row.size;
        else
            temporary -= row.size;
    }
}
export async function resolveCachedMedia(url: string, user = owner): Promise<string> { const id = mediaIdentity(url); if (!id || !user)
    return url; const key = user + ':' + id; try {
    const row = await run<Entry | undefined>('readonly', s => s.get(key));
    if (!row)
        return url;
    row.used = Date.now();
    void run('readwrite', s => s.put(row)).catch(() => { });
    let local = objectUrls.get(key);
    if (!local) {
        local = URL.createObjectURL(row.blob);
        objectUrls.set(key, local);
    }
    return local;
}
catch {
    return url;
} }
async function remember(url: string, user: string) { const id = mediaIdentity(url); if (!id || !user)
    return; const key = user + ':' + id; if (pending.has(key))
    return pending.get(key); const operation = (async () => { if (await run('readonly', s => s.get(key)))
    return; const response = await fetch(url, { cache: 'force-cache' }); if (!response.ok || response.status === 206)
    return; const length = Number(response.headers.get('content-length') || 0); if (length > 256 * 1024 ** 2)
    return; const blob = await response.blob(); if (!blob.size || blob.size > 256 * 1024 ** 2)
    return; const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction([STORE,'retired'],'readwrite');const check=tx.objectStore('retired').get(key);check.onsuccess=()=>{if(!check.result)tx.objectStore(STORE).put({key,user,category:mediaCategory(id,blob.type),size:blob.size,used:Date.now(),blob} satisfies Entry);};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); await trimCache(); })().catch(() => { }).finally(() => pending.delete(key)); pending.set(key, operation); return operation; }
export function installMediaCache(user: string) {
    owner = user;
    let alive = true;
    const seen = new WeakMap<Element, string>();
    const visible = new IntersectionObserver(items => { for (const item of items)
        if (item.isIntersecting) {
            const el = item.target as HTMLImageElement;
            if (el.complete)
                void remember(el.currentSrc || el.src, user);
            visible.unobserve(el);
        } }, { rootMargin: '0px' });
    const scan = () => { document.querySelectorAll<HTMLImageElement | HTMLMediaElement>('img[src],audio[src],video[src]').forEach(el => { const url = el.getAttribute('src') || ''; if (!mediaIdentity(url) || seen.get(el) === url)
        return; seen.set(el, url); void resolveCachedMedia(url, user).then(local => { if (alive && local !== url && el.getAttribute('src') === url) {
        seen.set(el, local);
        el.src = local;
    } }); if (el instanceof HTMLImageElement)
        visible.observe(el); }); };
    const loaded = (event: Event) => { const el = event.target; if (el instanceof HTMLImageElement && el.getBoundingClientRect().bottom >= 0 && el.getBoundingClientRect().top <= innerHeight)
        void remember(el.currentSrc || el.src, user); if (el instanceof HTMLMediaElement && event.type === 'play')
        void remember(el.currentSrc || el.src, user); };
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    document.addEventListener('load', loaded, true);
    document.addEventListener('play', loaded, true);
    scan();
    void trimCache().catch(() => { });
    void navigator.storage?.persist?.().catch(() => { });
    return () => { alive = false; observer.disconnect(); visible.disconnect(); document.removeEventListener('load', loaded, true); document.removeEventListener('play', loaded, true); if (owner === user)
        owner = ''; for (const url of objectUrls.values())
        URL.revokeObjectURL(url); objectUrls.clear(); };
}

/** Local content index contains only message IDs and stable storage identities. */
export async function linkMessageMedia(user:string,message:string,paths:string[]){
 if(!paths.length)return;const d=await db();await new Promise<void>((resolve,reject)=>{const tx=d.transaction(['links','retired'],'readwrite');const identities=paths.map(path=>'connect-attachments/'+path);tx.objectStore('links').put(identities,user+':'+message);for(const identity of identities)tx.objectStore('retired').delete(user+':'+identity);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
}
export async function purgeDeletedMedia(user:string,message:string){
 if(owner!==user)return;const d=await db();const paths=await new Promise<string[]>((resolve,reject)=>{
  const tx=d.transaction(['links','retired'],'readwrite'),store=tx.objectStore('links'),keys=store.getAllKeys(),values=store.getAll();let deleted:string[]=[];
  values.onsuccess=()=>{const index=keys.result.findIndex(key=>key===user+':'+message);const current:string[]=index<0?[]:values.result[index];deleted=current.filter(path=>!values.result.some((other,i)=>i!==index&&String(keys.result[i]).startsWith(user+':')&&other.includes(path)));store.delete(user+':'+message);for(const path of deleted)tx.objectStore('retired').put(true,user+':'+path);};
  tx.oncomplete=()=>resolve(deleted);tx.onerror=()=>reject(tx.error);
 });for(const path of paths)await clearCachedMedia('temporary',path);
}
