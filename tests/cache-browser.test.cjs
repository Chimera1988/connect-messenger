const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
const {chromium}=require(process.env.CONNECT_PLAYWRIGHT_MODULE||'playwright-core');
test('persistent media cache survives restart, ignores signed tokens, isolates accounts and preserves avatar/vault on cleanup',async()=>{
 const media=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/media-cache.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const vault=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/secure-vault.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP4DwQACfsD/Wj6HMwAAAAASUVORK5CYII=','base64');let requests=0;
 const server=http.createServer((req,res)=>{if(req.url.startsWith('/storage/')){requests++;res.writeHead(200,{'content-type':'image/png'});res.end(pixel);return;}res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><div id="root"></div><script>var exports={};'+media+';window.cache=exports;exports={};'+vault+';window.Vault=exports.SecureVault;</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CONNECT_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(async()=>{window.release=cache.installMediaCache('user-a');window.secretVault=new Vault('user-a');await secretVault.putMany({account:'secret-key-material'});for(const bucket of ['connect-avatars','connect-attachments']){const img=new Image();img.src='/storage/v1/object/sign/'+bucket+'/sample.png?token=old';document.body.append(img);}});await page.waitForFunction(async()=>{const s=await cache.cacheStats();return s.photos>0&&s.system>0;});
 const count=requests;assert.equal(await page.evaluate(()=>cache.mediaIdentity('https://evil.test/storage/v1/object/sign/connect-avatars/sample.png')),null);
 assert.match(await page.evaluate(()=>cache.resolveCachedMedia(location.origin+'/storage/v1/object/sign/connect-attachments/sample.png?token=new')),/^blob:/);assert.equal(requests,count);
 await page.reload();assert.equal(await page.evaluate(async()=>{window.release=cache.installMediaCache('user-a');return await new Vault('user-a').get('account');}),'secret-key-material');assert.match(await page.evaluate(()=>cache.resolveCachedMedia(location.origin+'/storage/v1/object/sign/connect-attachments/sample.png?token=restart')),/^blob:/);assert.equal(requests,count);
 await page.evaluate(async()=>{await cache.linkMessageMedia('user-a','one',['sample.png']);await cache.linkMessageMedia('user-a','two',['sample.png']);await cache.purgeDeletedMedia('user-a','one');});assert.ok((await page.evaluate(()=>cache.cacheStats())).photos>0);
 await page.evaluate(()=>cache.purgeDeletedMedia('user-a','two'));assert.equal((await page.evaluate(()=>cache.cacheStats())).photos,0);
 await page.evaluate(()=>{const img=new Image();img.src='/storage/v1/object/sign/connect-attachments/sample.png?token=late';document.body.append(img);});await page.waitForTimeout(150);assert.equal((await page.evaluate(()=>cache.cacheStats())).photos,0);
 await page.evaluate(()=>cache.clearCachedMedia('temporary'));const stats=await page.evaluate(()=>cache.cacheStats());assert.ok(stats.system>0);assert.equal(stats.photos,0);assert.equal(await page.evaluate(()=>new Vault('user-a').get('account')),'secret-key-material');
 assert.equal(await page.evaluate(async()=>{release();release=cache.installMediaCache('user-b');return (await cache.cacheStats()).system;}),0);
 await page.close();
 }finally{try{if(browser)await browser.close();}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}}
});
