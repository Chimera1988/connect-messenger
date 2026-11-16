'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { chromium } = require(process.env.CONNECT_PLAYWRIGHT_MODULE || 'playwright-core');
const root = path.resolve(__dirname, '..');
const media = ts.transpileModule(fs.readFileSync(path.join(root,'lib/media-cache.ts'),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const png = fs.readFileSync(path.join(root,'public/icon-192.png'));
test('delayed image error must not evict verified media blob', {timeout:45000}, async () => {
  const server = http.createServer((req,res) => {
    const url = new URL(req.url,'http://127.0.0.1');
    if (url.pathname.endsWith('.png')) {
      res.writeHead(200,{'content-type':'image/png','content-length':png.length});res.end(png);return;
    }
    res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
    res.end('<!doctype html><div id="fixtures"></div><script>var exports={};'+media+';window.cache=exports;window.release=cache.installMediaCache("cache-test")</script>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser = await chromium.launch({executablePath:process.env.CONNECT_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.evaluate(async()=>{
      const img = new Image();img.id='original';img.src='/storage/v1/object/sign/connect-avatars/a.png?token=fresh';
      document.getElementById('fixtures').appendChild(img);
      await img.decode();
    });
    await page.waitForFunction(async()=> (await cache.cacheStats()).system>0,null,{timeout:12000});
    await page.evaluate(async()=>{
      const src=await cache.resolveCachedMedia('/storage/v1/object/sign/connect-avatars/a.png?token=fresh');
      if(!src.startsWith('blob:')) throw Error('Expected indexed cached avatar before error simulation');
      window.cachedProbe=new Image();cachedProbe.id='cached-probe';cachedProbe.src=src;
      document.getElementById('fixtures').appendChild(cachedProbe);
      await cachedProbe.decode();
      window.spuriousEvictions=0;
      window.addEventListener('connect:cache-changed',()=>spuriousEvictions++);
    });
    // Allow the MutationObserver to record the actual blob binding before injecting
    // a delayed error event for an earlier resource (a real browser race).
    await page.waitForTimeout(80);
    await page.evaluate(()=>cachedProbe.dispatchEvent(new Event('error')));
    await page.waitForTimeout(160);
    const state=await page.evaluate(async()=>({
      evictions:spuriousEvictions,
      cached: (await cache.resolveCachedMedia('/storage/v1/object/sign/connect-avatars/a.png?token=fresh')).startsWith('blob:')
    }));
    assert.equal(state.evictions,0,'Spurious image error evicted a valid persistent cache entry');
    assert(state.cached,'Persistent image cache must remain readable');
    await page.close();
  } finally {
    try {if(browser)await browser.close();}
    finally {await new Promise(resolve=>server.close(resolve));}
  }
});
