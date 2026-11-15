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
