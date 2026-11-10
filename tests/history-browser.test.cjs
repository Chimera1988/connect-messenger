const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
const {chromium}=require(process.env.CONNECT_PLAYWRIGHT_MODULE||'playwright-core');
const compile=name=>ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/'+name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
test('history restart, tuple paging, unread window, cross-tab clear and durable unknown deletion barriers',async()=>{
 const order=compile('chat-order'),history=compile('chat-history-cache');
 const server=http.createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'});res.end('<!doctype html><script>var exports={};'+order+';window.order=exports;exports={};function require(){return window.order;}'+history+';window.historyCache=exports;</script>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({executablePath:process.env.CONNECT_CHROMIUM_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage(),url='http://127.0.0.1:'+server.address().port;await page.goto(url);
  await page.evaluate(async()=>{
   const h=historyCache;await h.readChatHistory('a','chat');
   await h.dropCachedMessageById('a','retired-unknown');
   const rows=Array.from({length:1000},(_,i)=>({id:String(i).padStart(8,'0'),conversation_id:'chat',sender_id:'peer',created_at:'2026-11-10T12:00:00.000001Z',body:'body-'+i}));
   rows.push({id:'retired-unknown',conversation_id:'chat',created_at:'2026-11-10T12:00:01Z'});
   await h.writeChatHistory('a','chat',rows,'2026-11-10T11:59:00Z');
   await h.writeChatHistory('b','chat',[{id:'other',conversation_id:'chat',created_at:'2026-11-10T12:00:00Z'}]);
  });
  let snapshot=await page.evaluate(()=>historyCache.readChatHistory('a','chat'));assert.equal(snapshot.messages.length,200);assert.equal(snapshot.messages[0].id,'00000000');assert.equal(snapshot.hasNewer,true);
  const seen=new Set(snapshot.messages.map(x=>x.id));let cursor=snapshot.messages.at(-1);
  while(true){const next=await page.evaluate(c=>historyCache.readNewerChatHistory('a','chat',c.created_at,c.id),cursor);for(const m of next.messages){assert.equal(seen.has(m.id),false);seen.add(m.id);}if(!next.hasNewer)break;cursor=next.messages.at(-1);}
  assert.equal(seen.size,1000);assert.equal(seen.has('retired-unknown'),false);
  await page.evaluate(()=>historyCache.writeChatHistory('a','chat',[],'2026-11-10T12:00:02Z'));snapshot=await page.evaluate(()=>historyCache.readChatHistory('a','chat'));assert.equal(snapshot.messages[0].id,'00000800');assert.equal(snapshot.hasMore,true);
  const older=await page.evaluate(c=>historyCache.readOlderChatHistory('a','chat',c.created_at,c.id),snapshot.messages[0]);assert.equal(older.messages.length,120);assert.equal(older.messages.at(-1).id,'00000799');
  await page.evaluate(async()=>{const h=historyCache;await h.writeChatHistory('a','chat',[{id:'00000999',conversation_id:'chat',created_at:'2026-11-10T12:00:00.000001Z',edited_at:'2026-11-10T13:00:00Z',body:'edited'}]);await h.writeChatHistory('a','chat',[{id:'00000999',conversation_id:'chat',created_at:'2026-11-10T12:00:00.000001Z',body:'stale'}],'2026-11-10T11:00:00Z');});
  await page.reload();snapshot=await page.evaluate(()=>historyCache.readChatHistory('a','chat'));assert.equal(snapshot.messages.at(-1).body,'edited');assert.equal(snapshot.readAt,'2026-11-10T12:00:02Z');
  const tab=await context.newPage();await tab.goto(url);await tab.evaluate(()=>historyCache.readChatHistory('a','chat'));
  await page.evaluate(async()=>{const clear=historyCache.wipeUserHistory('a');const stale=historyCache.writeChatHistory('a','chat',[{id:'late',conversation_id:'chat',created_at:'2026-11-10T12:00:00Z'}]);await Promise.all([clear,stale]);});
  assert.equal(await page.evaluate(()=>historyCache.chatHistoryStats('a').then(s=>s.messages)),0);
  await tab.evaluate(()=>historyCache.writeChatHistory('a','chat',[{id:'late-tab',conversation_id:'chat',created_at:'2026-11-10T12:00:00Z'}]));assert.equal(await tab.evaluate(()=>historyCache.chatHistoryStats('a').then(s=>s.messages)),0);
  await tab.evaluate(async()=>{const h=historyCache;await h.readChatHistory('a','chat');await h.writeChatHistory('a','chat',[{id:'fresh',conversation_id:'chat',created_at:'2026-11-10T12:00:00Z'},{id:'retired-unknown',conversation_id:'chat',created_at:'2026-11-10T12:00:00Z'}]);});
  assert.deepEqual(await page.evaluate(()=>historyCache.readChatHistory('a','chat').then(s=>s.messages.map(x=>x.id))),['fresh']);
  assert.equal(await page.evaluate(()=>historyCache.chatHistoryStats('b').then(s=>s.messages)),1);
  assert.equal(await page.evaluate(()=>order.chatTimeKey('2026-11-10T15:00:00.000001+03:00')===order.chatTimeKey('2026-11-10T12:00:00.000001Z')),true);
  await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
