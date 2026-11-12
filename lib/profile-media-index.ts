/** Persistent profile media catalog. Per-viewer namespace, metadata only.
 * Never write temporary signed URLs, credentials, audio blobs or video blobs here.
 * Actual authenticated media bytes use existing connect-media-v1 cache.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { prefetchProfileFile, retireCachedProfileFile } from './media-cache';
export type ProfileLibraryKind = 'photos' | 'videos' | 'music';
export type ProfileLibraryRow = { path: string; createdAt: string };
type Catalog = { key: string; viewer: string; owner: string; kind: ProfileLibraryKind; savedAt: number; items: ProfileLibraryRow[] };
const NAME = 'connect-profile-index-v1';
const STORE = 'catalogs';
let opening: Promise<IDBDatabase> | undefined;
const kinds: readonly ProfileLibraryKind[] = ['photos', 'videos', 'music'];
const key = (viewer:string,owner:string,kind:ProfileLibraryKind) => viewer+':'+owner+':'+kind;
function db(): Promise<IDBDatabase> {
  return opening ??= new Promise((resolve,reject) => {
    const request=indexedDB.open(NAME,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'key'});};
    request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=undefined;};resolve(request.result);};
    request.onerror=()=>{opening=undefined;reject(request.error);};
  });
}
function operation<T>(mode: IDBTransactionMode, fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T> {
  return db().then(database=>new Promise<T>((resolve,reject)=>{
    const tx=database.transaction(STORE,mode), request=fn(tx.objectStore(STORE));
    let value:T;
    request.onsuccess=()=>{value=request.result;};
    tx.oncomplete=()=>resolve(value);
    tx.onerror=()=>reject(tx.error||request.error);
    tx.onabort=()=>reject(tx.error||Error('Profile library IndexedDB aborted'));
  }));
}
export async function readProfileLibrary(viewer:string,owner:string,kind:ProfileLibraryKind):Promise<ProfileLibraryRow[]|null> {
  if(!viewer||!owner)return null;
  const row=await operation<Catalog|undefined>('readonly',s=>s.get(key(viewer,owner,kind)));
  if(!row||row.viewer!==viewer||row.owner!==owner||row.kind!==kind||!Array.isArray(row.items))return null;
  const prefix=owner+'/'+kind+'/';
  return row.items.filter(x=>typeof x?.path==='string'&&x.path.startsWith(prefix)&&typeof x.createdAt==='string').slice(0,100);
}
export async function writeProfileLibrary(viewer:string,owner:string,kind:ProfileLibraryKind,items:ProfileLibraryRow[]):Promise<void>{
  if(!viewer||!owner)return;
  const prefix=owner+'/'+kind+'/';
  const safe=items.filter(x=>x.path.startsWith(prefix)).slice(0,100).map(x=>({path:x.path,createdAt:x.createdAt}));
  await operation('readwrite',s=>s.put({key:key(viewer,owner,kind),viewer,owner,kind,savedAt:Date.now(),items:safe} satisfies Catalog));
}
export async function removeProfileLibraryItem(viewer:string,owner:string,kind:ProfileLibraryKind,path:string):Promise<void>{
  const items=await readProfileLibrary(viewer,owner,kind);
  if(items)await writeProfileLibrary(viewer,owner,kind,items.filter(x=>x.path!==path));
}
/** Warm up the three *own* directories while the main screen is idle.
 * Best effort only: Supabase and its access rules remain authoritative.
 */
export async function warmOwnProfileLibraries(client:SupabaseClient,viewer:string):Promise<void>{
  if(!viewer)return;
  await Promise.all(kinds.map(async kind=>{
    try{
      const {data,error}=await client.storage.from('connect-profile-media').list(viewer+'/'+kind,{
        limit:300,sortBy:{column:'created_at',order:'desc'}
      });
      if(error)return;
      await writeProfileLibrary(viewer,viewer,kind,(data||[]).filter(row=>row.id&&row.name&&!/__(?:thumb\.webp|poster\.jpg)$/.test(row.name)).slice(0,100).map(row=>({
        path:viewer+'/'+kind+'/'+row.name,createdAt:row.created_at||''
      })));
    }catch{/* Offline: preserve the last catalog. */}
  }));
}


// CONNECT_PWA_CONTACT_PROFILE_WARM_V3_20261111
/** Warm a conversation partner's gallery, video and music catalogs while a
 * chat is open. Only signed URLs granted by Supabase may be fetched; they are
 * never persisted. This is deliberately modest to avoid saturating mobile data.
 */
const peerWarmups = new Map<string,{at:number;task:Promise<void>}>();
export async function warmPeerProfileLibraries(
  client:SupabaseClient,viewer:string,peer:string,proxyUrl:(url:string)=>string=(url)=>url
):Promise<void> {
  if(!viewer||!peer||viewer===peer)return;
  const namespace=viewer+':'+peer;
  const current=peerWarmups.get(namespace);
  if(current&&Date.now()-current.at<120000)return current.task;
  const task=(async()=>{
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    const allowBytes=!connection?.saveData&&connection?.effectiveType!=='2g'&&document.visibilityState==='visible';
    const budget:Record<ProfileLibraryKind,{count:number;bytes:number}>={
      photos:{count:3,bytes:2*1024**2},
      videos:{count:1,bytes:4*1024**2},
      music:{count:1,bytes:4*1024**2},
    };
    await Promise.all(kinds.map(async kind=>{
      try{
        const {data,error}=await client.storage.from('connect-profile-media').list(peer+'/'+kind,{
          limit:300,sortBy:{column:'created_at',order:'desc'}
        });
        if(error)return; // Permissions and RLS always take precedence over local cache.
        const rows=(data||[]).filter(x=>x.id&&x.name&&!/__(?:thumb\.webp|poster\.jpg)$/.test(x.name)).slice(0,100).map(x=>({
          path:peer+'/'+kind+'/'+x.name, createdAt:x.created_at||'',
          size:Number(x.metadata?.size||0)
        }));
        const before=await readProfileLibrary(viewer,peer,kind).catch(()=>null);
        await writeProfileLibrary(viewer,peer,kind,rows);
        // A full 100-item response may have a second page: do not infer deletes.
        if(before&&rows.length<100){
          const listed=new Set(rows.map(x=>x.path));
          for(const removed of before.filter(x=>!listed.has(x.path)))
            void retireCachedProfileFile(viewer,removed.path).catch(()=>{});
        }
        if(!allowBytes)return;
        const cap=budget[kind];
        const selected=rows.filter(x=>x.size>0&&x.size<=cap.bytes).slice(0,cap.count);
        if(!selected.length)return;
        const result=await client.storage.from('connect-profile-media').createSignedUrls(selected.map(x=>x.path),3600);
        if(result.error)return;
        const signed=new Map((result.data||[]).filter(x=>x.path&&x.signedUrl).map(x=>[x.path,x.signedUrl] as const));
        for(const item of selected){
          const url=signed.get(item.path);
          if(url)void prefetchProfileFile(proxyUrl(url),viewer,kind,cap.bytes).catch(()=>{});
        }
      }catch{/* Network errors never interrupt chat or profile navigation. */}
    }));
  })().catch(()=>{});
  peerWarmups.set(namespace,{at:Date.now(),task});
  try{await task;}finally{
    // Entries expire after two minutes. Limit retained user IDs in long sessions.
    if(peerWarmups.size>24){
      const first=peerWarmups.keys().next().value;
      if(first)peerWarmups.delete(first);
    }
  }
}
