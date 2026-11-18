const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),http=require('node:http'),{chromium}=require('playwright-core');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',AB='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',AC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('production PWA preserves per-chat drafts, explicit call identity, offline session and push deep link; logout locks all private UI',{timeout:90000},async()=>{
 const socket=http.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const processLog=[];const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',data=>processLog.push(data.toString()));server.stderr.on('data',data=>processLog.push(data.toString()));
 let browser;try{
  const origin='http://127.0.0.1:'+port;let started=false;for(let i=0;i<100;i++){try{if((await fetch(origin)).ok){started=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert(started,processLog.join(''));
  browser=await chromium.launch({args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.routeWebSocket('**',ws=>ws.close());
  const profiles=[{id:A,display_name:'Я'},{id:B,display_name:'Одинаковое имя'},{id:C,display_name:'Одинаковое имя'}].map(p=>({...p,is_blocked:false,bio:'',avatar_path:null,last_seen_at:null,online_until:null}));
  const conversations=[{id:AB,user_a:A,user_b:B,created_at:'2026-01-02T00:00:00Z'},{id:AC,user_a:A,user_b:C,created_at:'2026-01-01T00:00:00Z'}];
  const session={access_token:'header.'+Buffer.from(JSON.stringify({sub:A,session_id:AC,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature',refresh_token:'synthetic-local-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:A,aud:'authenticated',role:'authenticated',email:'fixture@example.invalid',user_metadata:{},app_metadata:{}}};
  let authStatus=200,authRequests=0;const errors=[];
  await context.addInitScript(({session})=>{localStorage.setItem('sb-example-auth-token',JSON.stringify(session));window.addEventListener('connect:audio-call:start',event=>{window.callIntent=event.detail;event.stopImmediatePropagation();},true);},{session});
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.origin===origin){if(url.pathname==='/api/auth/verify'){authRequests++;return json({ok:true,userId:A,isAdmin:false},authStatus);}if(url.pathname.startsWith('/api/'))return json({ok:true,iceServers:[],relayConfigured:false});return route.continue();}
   if(url.hostname!=='example.invalid')return route.abort();
   if(url.pathname.startsWith('/auth/'))return json(url.pathname.endsWith('/user')?session.user:session);
   const table=url.pathname.split('/').at(-1),single=request.headers().accept?.includes('vnd.pgrst.object');let rows=[];
   if(table==='profiles'){rows=profiles;const id=url.searchParams.get('id')?.replace('eq.','');if(id)rows=rows.filter(p=>p.id===id);}
   if(table==='conversations')rows=conversations;
   if(table==='connect_inbox_summary')rows=conversations.map(c=>({conversation_id:c.id,latest:null,unread_count:0,incoming_at:null,states:[]}));
   if(table==='connect_unified_capabilities')return json({activity:1});
   return json(single?(rows[0]||null):rows);
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await page.locator('.dialog-row').first().waitFor();assert.equal(await page.locator('.dialog-row').count(),2);
  await page.locator('.dialog-row').nth(0).click();const input=page.getByRole('textbox',{name:'Сообщение',exact:true});await input.fill('Черновик А');await page.getByRole('button',{name:'Назад к чатам'}).click();await page.locator('.dialog-row').nth(1).click();await input.fill('Черновик Б');
  await page.locator('.connect-call-trigger').click();assert.equal((await page.evaluate(()=>window.callIntent)).conversationId,AC);
  await page.getByRole('button',{name:'Назад к чатам'}).click();await page.locator('.dialog-row').nth(0).click();assert.equal(await input.inputValue(),'Черновик А');
  await page.evaluate(()=>window.composerProbe=document.querySelector('input[aria-label="Сообщение"]'));authStatus=503;const previousAuth=authRequests;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));for(let i=0;i<100&&authRequests===previousAuth;i++)await new Promise(r=>setTimeout(r,20));assert(authRequests>previousAuth);await page.getByText('Восстанавливаем соединение…',{exact:true}).waitFor();assert.equal(await input.inputValue(),'Черновик А');assert.equal(await page.evaluate(()=>window.composerProbe===document.querySelector('input[aria-label="Сообщение"]')),true);
  authStatus=200;
  const deep=await context.newPage();await deep.goto(origin+'/?conversation='+AC+'&connect_user='+A);await deep.getByRole('button',{name:'Назад к чатам'}).waitFor();await deep.locator('.connect-call-trigger').click();assert.equal((await deep.evaluate(()=>window.callIntent)).conversationId,AC);assert.equal(new URL(deep.url()).searchParams.has('conversation'),false);await deep.close();
  authStatus=200;await page.getByRole('button',{name:'Назад к чатам'}).click();await page.getByRole('button',{name:'Настройки',exact:true}).click();await page.getByRole('button',{name:'Выйти из аккаунта'}).click();await page.getByRole('textbox',{name:'Электронная почта',exact:true}).waitFor();assert.equal(await page.locator('.dialog-row').count(),0);assert.equal(await page.locator('input[aria-label="Сообщение"]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();server.kill('SIGTERM');await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);});}
});
