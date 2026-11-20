  // CONNECT_PWA_MEDIA_EGRESS_TEST_20261115
  const test=require('node:test');
  const assert=require('node:assert/strict');
  const fs=require('node:fs');
  const http=require('node:http');
  const path=require('node:path');
  const ts=require('typescript');
  const {chromium}=require(process.env.CONNECT_PLAYWRIGHT_MODULE||'playwright-core');

  const source=fs.readFileSync(path.join(__dirname,'../lib/media-cache.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;

  test('streaming audio and video never trigger parallel original downloads; explicit small audio warmup is deduplicated',{timeout:45000},async()=>{
    const hits=[];
    const media=Buffer.alloc(128,0);
    const server=http.createServer((req,res)=>{
      if(req.url.startsWith('/sw.js')){res.writeHead(200,{'content-type':'application/javascript','service-worker-allowed':'/'});res.end(fs.readFileSync(path.join(__dirname,'../public/sw.js')));return;}
      if(req.url.startsWith('/storage/v1/object/sign/')){
        hits.push({url:req.url,range:req.headers.range||''});
        const type=req.url.includes('.m4a')?'audio/mp4':'video/mp4';
        res.writeHead(200,{'content-type':type,'content-length':media.length,'cache-control':'no-store','accept-ranges':'bytes'});
        res.end(media);return;
      }
      res.writeHead(200,{'content-type':'text/html'});
      res.end('<!doctype html><body><div id="root"></div><script>var exports={};'+compiled+';window.cache=exports;window.release=cache.installMediaCache("viewer-1");</script></body>');
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try{
      browser=await chromium.launch({executablePath:process.env.CONNECT_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
      const page=await browser.newPage();
      const origin='http://127.0.0.1:'+server.address().port;
      await page.goto(origin);
      await page.evaluate(()=>{
        for(const [tag,filename] of [['audio','autoplay.m4a'],['video','autoplay.mp4']]){
          const element=document.createElement(tag);
          element.preload='none';
          element.src='/storage/v1/object/sign/connect-attachments/'+filename;
          document.body.append(element);
        }
      });
      await page.waitForTimeout(100);
      const streamHits=()=>hits.filter(item=>/\/autoplay\.(?:m4a|mp4)/.test(item.url)&&!item.range).length;
      const before=streamHits();
      await page.evaluate(()=>{
        for(const el of document.querySelectorAll('audio,video'))el.dispatchEvent(new Event('play'));
      });
      await page.waitForTimeout(550);
      assert.equal(streamHits()-before,0,'PLAYBACK_PREFETCH_DUPLICATION: play generated an extra full-object GET');

      const profile='/storage/v1/object/sign/connect-profile-media/user/videos/preview.mp4';
      const videoBefore=hits.filter(x=>x.url.startsWith(profile)).length;
      await page.evaluate(url=>cache.prefetchProfileFile(url,'viewer-1','videos',4*1024*1024),origin+profile);
      assert.equal(hits.filter(x=>x.url.startsWith(profile)).length,videoBefore,'BACKGROUND_VIDEO_DOWNLOAD: video warmup fetched the full original');

      const voice='/storage/v1/object/sign/connect-attachments/manual.m4a';
      await page.evaluate(url=>Promise.all([
        cache.prefetchChatAudio(url,'viewer-1',128),
        cache.prefetchChatAudio(url,'viewer-1',128),
      ]),origin+voice);
      assert.equal(hits.filter(x=>x.url.startsWith(voice)).length,1,'Small audio warmup must fetch each unique file once');
      assert.match(await page.evaluate(url=>cache.resolveCachedMedia(url,'viewer-1'),origin+voice),/^blob:/);
      await page.close();
    }finally{
      if(browser)await browser.close();
      await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    }
  });

// CONNECT_MEDIA_RESPONSE_CACHE_V1: the body must come from the first browser GET.
test('media read-through worker binds an account before the first response is cached',{timeout:20000},async()=>{
 const root=path.resolve(__dirname,'..'),web=fs.existsSync(path.join(root,'web/public/sw.js'))?'web/':'';
 const worker=fs.readFileSync(path.join(root,web+'public/sw.js'),'utf8');
 const server=http.createServer((req,res)=>{if(req.url==='/sw.js'){res.writeHead(200,{'content-type':'application/javascript','service-worker-allowed':'/'});res.end(worker);return;}res.setHeader('content-type','text/html');res.end('<!doctype html><body>fixture</body>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CONNECT_CHROMIUM_PATH||process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);const reply=await page.evaluate(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));return new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.controller.postMessage({type:'CONNECT_MEDIA_BIND',protocol:1,user:'alice',nonce:'0123456789abcdef0123456789abcdef'},[channel.port2]);setTimeout(()=>resolve(null),1200);});});assert.equal(reply?.protocol,1,'first-response cache worker protocol is missing');}finally{await browser.close();await new Promise(r=>server.close(r));}
});

// CONNECT_MEDIA_RESPONSE_CACHE_V1: actual HTTP, Chromium, IndexedDB and byte accounting.
test('first-response photo/audio/video cache: 100 reopens, ranges, offline, versions, deletion and account fencing',{timeout:90000},async()=>{
 const root=path.resolve(__dirname,'..'),worker=fs.readFileSync(root+'/public/sw.js','utf8');
 const png=fs.readFileSync(root+'/public/icon-192.png');
 const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=c>>>1^(c&1?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 const chunk=(name,body)=>{const type=Buffer.from(name),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(body.length);sum.writeUInt32BE(crc(Buffer.concat([type,body])));return Buffer.concat([length,type,body,sum]);};
 const header=Buffer.alloc(13);header.writeUInt32BE(1024);header.writeUInt32BE(1024,4);header[8]=8;header[9]=2;
 const pixels=Buffer.alloc(1024*(1024*3+1));let random=42;for(let y=0;y<1024;y++)for(let x=1;x<=3072;x++){random^=random<<13;random^=random>>>17;random^=random<<5;pixels[y*3073+x]=random&255;}
 const photo=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',require('node:zlib').deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
 const wav=Buffer.alloc(44+32000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(32000,40);
 const bytes=Buffer.from(Array.from({length:25000},(_,i)=>i%251));const hits=[];let offline=false,version=1;let slowRelease;
 const data=new Map([['photo.png',photo],['voice.wav',wav],['audio.wav',wav],['parts.mp4',bytes],['changed.mp4',bytes],['partial.mp4',bytes],['avatar.png',png],['sticker.webp',png],['thumb__thumb.webp',png]]);
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://local');if(u.pathname==='/sw.js'){res.writeHead(200,{'content-type':'application/javascript','service-worker-allowed':'/'});res.end(worker);return;}
  if(u.pathname.includes('/storage/v1/object/')){
   const name=u.pathname.split('/').pop(),body=data.get(name)||bytes,tag='"'+(name==='changed.mp4'?version:1)+'"';let start=0,end=body.length-1,status=200;
   const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');if(range&&(!req.headers['if-range']||req.headers['if-range']===tag)){start=range[1]?Number(range[1]):Math.max(0,body.length-Number(range[2]));end=range[1]&&range[2]?Math.min(end,Number(range[2])):end;status=206;}
   hits.push({name,range:req.headers.range||'',bytes:offline?0:end-start+1,status});
   if(offline){res.writeHead(503);res.end();return;}if(start>body.length-1){res.writeHead(416,{'content-range':'bytes */'+body.length});res.end();return;}
   const type=name.endsWith('.wav')?'audio/wav':name.endsWith('.webm')?'video/webm':name.endsWith('.mp4')?'video/mp4':'image/png';
   res.writeHead(status,{'content-type':type,'content-length':end-start+1,'etag':tag,'accept-ranges':'bytes','cache-control':'no-store',...(status===206?{'content-range':`bytes ${start}-${end}/${body.length}`}:{})});
   if(name==='slow.mp4'){res.write(body.subarray(start,start+100));slowRelease=()=>res.end(body.subarray(start+100,end+1));return;}
   res.end(body.subarray(start,end+1));return;
  }
  res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><body><script>var exports={};'+compiled+';window.cache=exports;window.release=cache.installMediaCache("alice");</script></body>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CONNECT_CHROMIUM_PATH||undefined,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);assert.equal(await page.evaluate(()=>cache.whenMediaCacheReady()),true);
  await page.evaluate(async()=>{for(const [bucket,file]of [['connect-attachments','photo.png'],['connect-avatars','avatar.png'],['connect-stickers','sticker.webp'],['connect-attachments','thumb__thumb.webp']]){const image=new Image();image.src='/storage/v1/object/sign/'+bucket+'/'+file+'?token=first';document.body.append(image);await image.decode();image.remove();}});
  await page.waitForTimeout(100);assert.equal(hits.filter(h=>h.name==='photo.png').length,1,'rendering launched a second full photo GET');
  const initial=hits.length;offline=true;await page.context().setOffline(true);
  await page.evaluate(async()=>{for(let i=0;i<100;i++){const image=new Image();image.src='/storage/v1/object/sign/connect-attachments/photo.png?token=reopen-'+i;document.body.append(image);await image.decode();image.remove();}});
  assert.equal(hits.length,initial,'100 offline reopens must use the first response');
  await page.context().setOffline(false);await page.reload();assert.equal(await page.evaluate(()=>cache.whenMediaCacheReady()),true);
  assert.equal(await page.evaluate(async()=>{const local=await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/photo.png?token=expired');if(!cache.isCachedMediaUrl(local))return false;const image=new Image();image.src=local;await image.decode();return image.naturalWidth===1024;}),true,'complete image survives restart offline');assert.equal(hits.length,initial);offline=false;
  console.log('MEDIA_PHASE photos-offline-passed');
  // A real WAV is played; PLAY/load events never launch a separate full-object fill.
  for(const file of ['voice.wav','audio.wav']){
   await page.evaluate(async file=>{const audio=new Audio();audio.preload='none';audio.src='/storage/v1/object/sign/connect-attachments/'+file;document.body.append(audio);await audio.play();await new Promise(r=>audio.addEventListener('ended',r,{once:true}));audio.remove();},file);
   const count=hits.length;offline=true;
   await page.evaluate(async file=>{const audio=new Audio(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/'+file));await audio.play();audio.currentTime=.6;await new Promise(r=>audio.addEventListener('ended',r,{once:true}));audio.remove();},file);
   assert.equal(hits.length,count,'repeat audio/seek fetched the original again');offline=false;
  }
  console.log('MEDIA_PHASE audio-passed');
  // Record a tiny valid video, so decoding and repeat playback are exercised too.
  const video=await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[];ctx.fillRect(0,0,32,32);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>chunks.push(e.data);const end=new Promise(r=>recorder.onstop=r);recorder.start();await new Promise(r=>setTimeout(r,250));ctx.fillStyle='red';ctx.fillRect(0,0,32,32);recorder.stop();await end;stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));});
  data.set('circle.webm',Buffer.from(video));data.set('movie.webm',Buffer.from(video));
  for(const file of ['circle.webm','movie.webm']){await page.evaluate(async file=>{const el=document.createElement('video');el.muted=true;el.preload='none';el.src='/storage/v1/object/sign/connect-attachments/'+file;document.body.append(el);await el.play();await new Promise(r=>el.addEventListener('ended',r,{once:true}));el.remove();},file);const count=hits.length;offline=true;await page.evaluate(async file=>{const el=document.createElement('video');el.muted=true;el.src=await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/'+file);document.body.append(el);await el.play();await new Promise(r=>el.addEventListener('ended',r,{once:true}));el.remove();},file);assert.equal(hits.length,count,'repeat video fetched cached bytes');offline=false;}
  console.log('MEDIA_PHASE video-passed');
  const read=(file,range)=>page.evaluate(async({file,range})=>{const r=await fetch('/storage/v1/object/sign/connect-attachments/'+file,{headers:range?{Range:range}:{}});return {status:r.status,range:r.headers.get('content-range'),bytes:Array.from(new Uint8Array(await r.arrayBuffer()))};},{file,range});
  assert.deepEqual((await read('parts.mp4','bytes=0-999')).bytes,[...bytes.subarray(0,1000)]);
  assert.equal(await page.evaluate(async()=>cache.isCachedMediaUrl(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/parts.mp4'))),false,'a prefix was marked complete');
  let count=hits.length;for(let i=0;i<20;i++)await read('parts.mp4','bytes=100-199');assert.equal(hits.length,count,'cached range was redownloaded');
  assert.deepEqual((await read('parts.mp4','bytes=5000-5999')).bytes,[...bytes.subarray(5000,6000)]);
  assert.deepEqual((await read('parts.mp4')).bytes,[...bytes]);assert.equal(hits.filter(h=>h.name==='parts.mp4').reduce((n,h)=>n+h.bytes,0),bytes.length,'overlapping Range bytes were transferred twice');
  count=hits.length;offline=true;const suffix=await read('parts.mp4','bytes=-23');assert.deepEqual(suffix.bytes,[...bytes.subarray(-23)]);assert.equal(suffix.range,'bytes 24977-24999/25000');assert.equal((await read('parts.mp4','bytes=999999-')).status,416);assert.equal(hits.length,count);offline=false;
  await read('partial.mp4','bytes=0-99');offline=true;assert.equal(await page.evaluate(async()=>cache.isCachedMediaUrl(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/partial.mp4'))),false);offline=false;
  await read('changed.mp4','bytes=0-99');version=2;const changed=await read('changed.mp4');assert.equal(changed.status,200,'If-Range mismatch must return one coherent new representation');assert.deepEqual(changed.bytes,[...bytes]);
  // Token lifetime uses an explicit clock and one pending signer; local data wins.
  const signing=await page.evaluate(async()=>{let now=1000,signs=0,blob=null,epoch=1;const links=cache.createSignedMediaCache({now:()=>now,lease:()=>epoch,cached:async()=>blob,sign:async()=>{signs++;return 'https://media/file?token='+signs;}});const one=await links.resolve('alice','connect-attachments','x');for(let i=0;i<100;i++)await links.resolve('alice','connect-attachments','x');const reused=signs;now+=3600001;const refreshed=await Promise.all([links.resolve('alice','connect-attachments','x'),links.resolve('alice','connect-attachments','x')]);blob='blob:local';now+=3600001;const local=await links.resolve('alice','connect-attachments','x');return{one,reused,signs,refreshed,local};});assert.equal(signing.reused,1);assert.equal(signing.signs,2);assert.notEqual(signing.one,signing.refreshed[0]);assert.equal(signing.refreshed[0],signing.refreshed[1]);assert.equal(signing.local,'blob:local');
  await page.evaluate(async()=>{await cache.linkMessageMedia('alice','a',['photo.png']);await cache.linkMessageMedia('alice','b',['photo.png']);await cache.purgeDeletedMedia('alice','a');});assert.equal(await page.evaluate(async()=>cache.isCachedMediaUrl(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/photo.png'))),true);
  await page.evaluate(()=>cache.purgeDeletedMedia('alice','b'));assert.equal(await page.evaluate(async()=>cache.isCachedMediaUrl(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/photo.png'))),false);
  count=hits.length;assert.equal((await read('photo.png')).status,410);assert.equal(hits.length,count,'retired photo reached Storage');
  await page.evaluate(()=>{window.old=cache.cacheMediaUrl('/storage/v1/object/sign/connect-attachments/slow.mp4');window.late=fetch(old).then(r=>r.arrayBuffer()).then(()=>true,()=>false);});
  while(!slowRelease)await new Promise(r=>setTimeout(r,10));await page.evaluate(async()=>{release();release=cache.installMediaCache('bob');await cache.whenMediaCacheReady();});slowRelease();await page.evaluate(()=>late);
  assert.equal(await page.evaluate(async()=>cache.isCachedMediaUrl(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/voice.wav'))),false,'second account read private bytes');
  await page.evaluate(async()=>{release();release=cache.installMediaCache('alice');await cache.whenMediaCacheReady();});assert.equal(await page.evaluate(async()=>cache.isCachedMediaUrl(await cache.resolveCachedMedia('/storage/v1/object/sign/connect-attachments/slow.mp4'))),false,'late write survived logout');
  await page.evaluate(()=>cache.clearCachedMedia('temporary'));const stats=await page.evaluate(()=>cache.cacheStats());assert.equal(stats.audio+stats.photos+stats.videos,0);assert.ok(stats.system>0);
  count=hits.length;await page.evaluate(()=>{for(let i=0;i<100;i++){const el=document.createElement(i%2?'audio':'video');el.preload='none';el.src='/storage/v1/object/sign/connect-attachments/old-large-'+i+'.mp4';document.body.append(el);el.remove();}});await page.waitForTimeout(100);assert.equal(hits.length,count,'large chat eagerly fetched old originals');
  console.log('MEDIA_NETWORK_ACCOUNTING '+JSON.stringify({photo:{firstFullGETs:1,reopens:100,repeatGETs:0,bytes:photo.length},range:{bytes:bytes.length,expected:bytes.length},signing:{valid100:1,expiredConcurrent:1},device:'NOT_TESTED'}));
 }finally{slowRelease?.();await browser.close();await new Promise(r=>server.close(r));}
});
