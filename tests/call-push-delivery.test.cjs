const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/api/push/call/route.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function fixture({devices,web,android,configured=true,reserved=false,vapidSetup}={}){
 const call={id:'11111111-1111-4111-8111-111111111111',caller_id:'caller',callee_id:'callee',conversation_id:'chat',status:'ringing',created_at:new Date().toISOString()};
 let held=reserved,inserts=0,deletes=0;const removed=[];
 const db={from(table){let verb='select',values;const q={select(){return q},eq(){return q},maybeSingle(){return q},insert(v){verb='insert';values=v;return q},delete(){verb='delete';return q},then(resolve,reject){let result={data:null,error:null};if(table==='connect_call_push_log'){if(verb==='insert'){inserts++;if(held)result.error={code:'23505'};else held=true;}if(verb==='delete'){deletes++;held=false;}}if(table==='connect_calls')result.data=call;if(table==='conversations')result.data={user_a:'caller',user_b:'callee'};if(table==='push_devices'&&verb==='select')result.data=devices;if(table==='push_devices'&&verb==='delete')removed.push(values);if(table==='profiles')result.data={display_name:'Synthetic caller'};return Promise.resolve(result).then(resolve,reject)}};return q;}};
 const exp={},env={NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'test-only',...(configured?{FIREBASE_SERVICE_ACCOUNT_JSON:'{}',VAPID_PUBLIC_KEY:'public',VAPID_PRIVATE_KEY:'test-only',VAPID_SUBJECT:'mailto:example@example.invalid'}:{})};
 const deps={'next/server':{NextResponse:{json:(body,options={})=>({status:options.status||200,body})}},'../../../../lib/server/visibility':{canReach:async()=>true},'@supabase/supabase-js':{createClient:(_u,key)=>key==='public'?{auth:{getUser:async()=>({data:{user:{id:'caller'}}})}}:db},'firebase-admin/app':{getApps:()=>[{}],initializeApp:()=>{},cert:x=>x},'firebase-admin/messaging':{getMessaging:()=>({send:android||(async()=>{})})},'web-push':{setVapidDetails(){vapidSetup?.()},sendNotification:web||(async()=>{})}};
 vm.runInNewContext(compiled,{exports:exp,require:name=>{assert.ok(deps[name],name);return deps[name]},process:{env},console:{info(){},warn(){}},Date,Promise});
 return{post:()=>exp.POST({headers:{get:()=> 'Bearer fixture'},json:async()=>({callId:call.id})}),get held(){return held},get inserts(){return inserts},get deletes(){return deletes}};
}
const webDevice={id:'web',platform:'web',subscription:{}},androidDevice={id:'android',platform:'android',endpoint:'fixture'};
test('a slow web endpoint cannot block Android FCM; web timeout is bounded',async()=>{
 let finishWeb,startedAndroid=false;const web=new Promise(r=>finishWeb=r);
 const f=fixture({devices:[webDevice,androidDevice],web:(_s,_p,options)=>{assert.equal(options.timeout,6000);return web},android:async message=>{assert.equal(message.android.priority,'high');assert.equal(message.android.ttl,45000);startedAndroid=true;}});
 const pending=f.post();for(let i=0;i<20&&!startedAndroid;i++)await new Promise(r=>setImmediate(r));assert.equal(startedAndroid,true,'FCM must start before the slow web request settles');finishWeb();assert.equal((await pending).body.sent,2);assert.equal(f.held,true);
});
test('a transient endpoint failure retries and counts one accepted notification',async()=>{
 let attempts=0;const f=fixture({devices:[androidDevice],android:async()=>{if(++attempts===1)throw Object.assign(Error('temporary'),{code:'messaging/server-unavailable'})}});
 assert.equal((await f.post()).body.sent,1);assert.equal(attempts,2);assert.equal(f.inserts,1);
});
test('failed transports release reservation and an unconfigured transport never reserves',async()=>{
 const f=fixture({devices:[androidDevice],android:async()=>{throw Error('offline')}});assert.equal((await f.post()).body.sent,0);assert.equal(f.held,false);assert.equal(f.deletes,1);await f.post();assert.equal(f.inserts,2);
 const missing=fixture({devices:[androidDevice],configured:false});assert.equal((await missing.post()).status,503);assert.equal(missing.inserts,0);
});
test('duplicate call push does not start a competing delivery',async()=>{
 let sends=0;const f=fixture({devices:[androidDevice],reserved:true,android:async()=>{sends++}});assert.equal((await f.post()).body.duplicate,true);assert.equal(sends,0);
});

test('invalid web push configuration cannot block a configured Android device',async()=>{
 let androidSent=0;const f=fixture({devices:[webDevice,androidDevice],vapidSetup:()=>{throw Error('invalid VAPID')},android:async()=>{androidSent++}});assert.equal((await f.post()).body.sent,1);assert.equal(androidSent,1);
});
