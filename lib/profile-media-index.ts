/** Persistent profile media catalog. Per-viewer namespace, metadata only.
 * Never write temporary signed URLs, credentials, audio blobs or video blobs here.
 * Actual authenticated media bytes use existing connect-media-v1 cache.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
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
        limit:100,sortBy:{column:'created_at',order:'desc'}
      });
      if(error)return;
      await writeProfileLibrary(viewer,viewer,kind,(data||[]).filter(row=>row.id&&row.name).map(row=>({
        path:viewer+'/'+kind+'/'+row.name,createdAt:row.created_at||''
      })));
    }catch{/* Offline: preserve the last catalog. */}
  }));
}
