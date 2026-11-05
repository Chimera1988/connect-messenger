const DB_NAME='connect-personalization';
const STORE='wallpapers';
function db():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE);};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function read():Promise<string|null>{const database=await db();return new Promise((resolve,reject)=>{const tx=database.transaction(STORE,'readonly');const req=tx.objectStore(STORE).get('chat');req.onsuccess=()=>resolve(typeof req.result==='string'?req.result:null);req.onerror=()=>reject(req.error);tx.oncomplete=()=>database.close();});}
export async function loadWallpaper():Promise<string|null>{try{return await read();}catch{return null;}}
export async function saveWallpaper(file:File):Promise<string>{
 const image=await createImageBitmap(file);
 const scale=Math.min(1,1440/Math.max(image.width,image.height));
 const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
 const data=canvas.toDataURL('image/jpeg',0.78);
 const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).put(data,'chat');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});database.close();return data;
}
export async function clearWallpaper():Promise<void>{try{const database=await db();await new Promise<void>((resolve,reject)=>{const tx=database.transaction(STORE,'readwrite');tx.objectStore(STORE).delete('chat');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});database.close();}catch{}}
