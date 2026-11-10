const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),ts=require('typescript');
const pw=require(process.env.CONNECT_PLAYWRIGHT_MODULE||'playwright-core');
const root=path.resolve(__dirname,'..');
const media=ts.transpileModule(fs.readFileSync(root+'/lib/media-cache.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const css=['globals.css','liquid-glass.css'].map(n=>fs.readFileSync(root+'/app/'+n,'utf8')).join('\n');
const png=fs.readFileSync(root+'/public/icon-192.png'),svg=fs.readFileSync(root+'/public/stickers/speed/hello.webp');
const wav=Buffer.alloc(44+32000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
const names=(process.env.CONNECT_WEBKIT_PATH?['chromium','webkit']:['chromium']);
for(const browserName of names)test(browserName+': actual image/audio decoding, cache recovery, expired links and sticker grid', {timeout:60000},async()=>{
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.searchParams.get('token')==='expired'){res.writeHead(403);res.end('expired');return;}
  let body,type;
  if(u.pathname.startsWith('/stickers/')){body=svg;type='image/webp';}
  else if(u.pathname.endsWith('.png')){body=png;type='image/png';}
  else if(u.pathname.endsWith('.wav')){body=wav;type='audio/wav';}
  else{body=Buffer.from('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><div class="connect-app"><div class="sticker-picker"><div class="sticker-picker-tabs"><button>Длинное название набора</button></div><div class="sticker-grid">'+Array.from({length:24},(_,i)=>'<div class="sticker-choice"><button aria-label="Отправить стикер"><img src="/stickers/speed/'+i+'.webp" alt="Стикер"></button><button class="sticker-fav">☆</button></div>').join('')+'</div></div></div><div id="fixtures" style="position:fixed;top:400px;left:0;width:300px"></div><script>var exports={};'+media+';window.cache=exports;window.renewals=0;window.release=cache.installMediaCache("a",async source=>{window.renewals++;return source.replace("token=expired","token=fresh")});</script>');type='text/html';}
  let start=0,end=body.length-1,status=200;const range=/^bytes=(\d+)-(\d*)/.exec(req.headers.range||'');if(range){start=Number(range[1]);end=range[2]?Math.min(end,Number(range[2])):end;status=206;res.setHeader('content-range',`bytes ${start}-${end}/${body.length}`);}
  res.writeHead(status,{'content-type':type,'content-length':end-start+1,'accept-ranges':'bytes'});res.end(body.subarray(start,end+1));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await pw[browserName].launch({executablePath:browserName==='chromium'?(process.env.CONNECT_CHROMIUM_PATH||undefined):process.env.CONNECT_WEBKIT_PATH,headless:true,args:browserName==='chromium'?['--no-sandbox']:[]});
 try{const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth));
 for(const width of [320,390,430])for(const scale of [1,1.6]){
  await page.setViewportSize({width,height:844});await page.evaluate(scale=>document.documentElement.style.fontSize=16*scale+'px',scale);
  const layout=await page.evaluate(()=>{const cells=[...document.querySelectorAll('.sticker-choice')].map(el=>{const r=el.getBoundingClientRect(),i=el.querySelector('img').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,iy:i.y,ib:i.bottom}});const rows=[...new Set(cells.map(c=>c.y))].sort((a,b)=>a-b);return {overlap:cells.some(c=>rows.some(y=>y>c.y+.5&&y<c.bottom-.5)),overflow:cells.some(c=>c.iy<c.y||c.ib>c.bottom+.5),scrollable:document.querySelector('.sticker-grid').scrollHeight>document.querySelector('.sticker-grid').clientHeight};});
  assert.equal(layout.overlap,false,`overlapping rows at ${width}/${scale}`);assert.equal(layout.overflow,false);assert.equal(layout.scrollable,true);
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.style.fontSize='16px');if(process.env.CONNECT_SCREENSHOT_DIR)await page.screenshot({path:process.env.CONNECT_SCREENSHOT_DIR+'/stickers-fixed-'+browserName+'.png'});
 await page.evaluate(()=>{fixtures.innerHTML='<img id="avatar" width="32" height="32" src="/storage/v1/object/sign/connect-avatars/a.png?token=one"><img id="photo" width="32" height="32" src="/storage/v1/object/sign/connect-attachments/a.png?token=one"><audio id="sound" controls preload="auto" src="/storage/v1/object/sign/connect-attachments/a.wav?token=one"></audio>';});
 await page.waitForFunction(async()=>{const s=await cache.cacheStats();return s.system>0&&s.photos>0;});
 await page.evaluate(async()=>{
 const base=location.origin+'/storage/v1/object/sign/';
 const urls=await Promise.all([
  cache.resolveCachedMedia(base+'connect-avatars/a.png?token=one'),
  cache.resolveCachedMedia(base+'connect-attachments/a.png?token=one')
 ]);
 if(urls.some(url=>!url.startsWith('blob:')))throw Error('Expected persistent cached media blob URLs');
 await Promise.all(urls.map((src,index)=>new Promise((resolve,reject)=>{
  const image=new Image();
  image.onload=()=>image.naturalWidth===192?resolve(true):reject(Error('Cached image width mismatch '+index));
  image.onerror=()=>reject(Error('Cached blob failed to decode '+index));
  image.src=src;
 })));
 avatar.src=urls[0];photo.src=urls[1];
});
 await page.waitForFunction(()=>avatar.naturalWidth>0&&photo.naturalWidth>0);
 assert.equal(await page.evaluate(()=>avatar.naturalWidth),192);
 await page.evaluate(()=>sound.play());await page.waitForFunction(async()=>(await cache.cacheStats()).audio>0);await page.evaluate(()=>sound.pause());
 await page.evaluate(async()=>{const el=document.createElement('audio');el.id='cachedSound';el.preload='auto';el.src=await cache.resolveCachedMedia(sound.src);fixtures.append(el);});
 await page.waitForFunction(()=>Number.isFinite(cachedSound.duration));assert.equal(await page.evaluate(()=>cachedSound.duration),1);
 await page.reload({waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const i=document.createElement('img');i.id='restarted';i.src=await cache.resolveCachedMedia(location.origin+'/storage/v1/object/sign/connect-avatars/a.png?token=new');fixtures.append(i);});
 await page.waitForFunction(()=>restarted.naturalWidth===192);assert.ok(await page.evaluate(()=>restarted.src.startsWith('blob:')));
 await page.evaluate(async()=>{const q=indexedDB.open('connect-media-v1',3);const db=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('objects','readwrite'),s=tx.objectStore('objects');for(const [name,type,data]of [['corrupt','image/png',[1,2,3]],['html','text/html',[60,104,49,62]]])s.put({key:'a:connect-attachments/'+name+'.png',user:'a',category:'photos',size:data.length,used:Date.now(),bytes:Uint8Array.from(data).buffer,type});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();for(const name of ['corrupt','html','expired']){const img=document.createElement('img');img.id=name;img.width=32;img.height=32;img.src='/storage/v1/object/sign/connect-attachments/'+name+'.png?token='+(name==='expired'?'expired':'fresh');fixtures.append(img);}const audio=document.createElement('audio');audio.id='expiredAudio';audio.preload='auto';audio.src='/storage/v1/object/sign/connect-attachments/expired.wav?token=expired';fixtures.append(audio);});
 await page.waitForFunction(()=>['corrupt','html','expired'].every(n=>document.getElementById(n).naturalWidth===192)&&Number.isFinite(expiredAudio.duration));
 assert.equal(await page.evaluate(()=>expiredAudio.duration),1);assert.ok(await page.evaluate(()=>renewals>=2));
 await page.evaluate(()=>cache.clearCachedMedia('temporary'));await page.waitForFunction(()=>restarted.naturalWidth===192);
 await page.evaluate(()=>release());await page.waitForFunction(()=>restarted.naturalWidth===192&&!restarted.src.startsWith('blob:'));
 assert.deepEqual(errors,[]);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
test('service worker preserves successful network responses when CacheStorage is full/unavailable',async()=>{
 const code=fs.readFileSync(root+'/public/sw.js','utf8');
 for(const mode of ['quota','unavailable','poisoned']){
  const listeners={};let response,fetches=0;
  const worker={addEventListener:(n,f)=>listeners[n]=f,location:{origin:'https://connect.test'},skipWaiting:async()=>{}};
  const cache={match:async()=>mode==='poisoned'?new Response('<html>error</html>',{headers:{'content-type':'text/html'}}):undefined,delete:async()=>true,put:async()=>{throw new Error('QuotaExceededError')}};
  vm.runInNewContext(code,{self:worker,caches:{open:async()=>{if(mode==='unavailable')throw new Error('SecurityError');return cache}},clients:{claim:async()=>{}},URL,fetch:async()=>{fetches++;return new Response(svg,{headers:{'content-type':'image/webp'}})}});
  listeners.fetch({request:new Request('https://connect.test/stickers/speed/hello.webp'),respondWith:p=>response=p});const result=await response;assert.equal(result.status,200);assert.deepEqual(Buffer.from(await result.arrayBuffer()),svg);assert.equal(fetches,1);
 }
});
