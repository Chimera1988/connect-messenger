const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),ts=require('typescript');
const {chromium}=require('playwright-core');
test('cache stats and eviction never materialize binary store records and remain account scoped',async()=>{
 const source=ts.transpileModule(fs.readFileSync('lib/media-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const server=http.createServer((_q,r)=>r.end('<script>var exports={};'+source+';window.cache=exports;</script>'));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  const result=await page.evaluate(async()=>{
   cache.installMediaCache('a');await cache.cacheStats();
   const request=indexedDB.open('connect-media-v1');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const stores=['objects',...(db.objectStoreNames.contains('metadata')?['metadata']:[])];
   await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');
    for(const user of ['a','b']){const row={key:user+':connect-attachments/photo.png',user,category:'photos',size:600*1024**2,used:1,bytes:new Uint8Array([1,2,3]).buffer,type:'image/png'};tx.objectStore('objects').put(row);if(stores.includes('metadata')){const {bytes,...meta}=row;tx.objectStore('metadata').put(meta);}}
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });
   const original=IDBObjectStore.prototype.getAll;
   IDBObjectStore.prototype.getAll=function(...args){if(this.name==='objects')throw Error('Binary getAll is forbidden');return original.apply(this,args);};
   const before=await cache.cacheStats();await cache.trimCache();const after=await cache.cacheStats();
   const remaining=await new Promise(resolve=>{const r=db.transaction('objects').objectStore('objects').count();r.onsuccess=()=>resolve(r.result);});db.close();return {before,after,remaining};
  });
  assert.equal(result.before.photos,600*1024**2);assert.equal(result.after.photos,0);assert.equal(result.remaining,1);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
