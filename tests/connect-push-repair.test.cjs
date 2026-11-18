const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/connect-push-repair.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function setup({permission='granted',existing=true,registered=true,enabled=true,online=true,invalidKey=false,failNetwork=false}={}){
 const calls={register:0,status:0,subscribe:0,unsubscribe:0,retire:0,permission:0},state=new Map(),endpoint='https://push.example/current';
 const subscription={endpoint,options:{applicationServerKey:new Uint8Array(invalidKey?[9,9,9]:[1,2,3]).buffer},toJSON(){return{endpoint,keys:{p256dh:'key',auth:'auth'}};},async unsubscribe(){calls.unsubscribe++;return true;}};
 let current=existing?subscription:null;
 const reg={pushManager:{async getSubscription(){return current;},async subscribe(o){calls.subscribe++;assert.equal(o.userVisibleOnly,true);assert.deepEqual(Array.from(new Uint8Array(o.applicationServerKey)),[1,2,3]);current=subscription;return current;}}};
 const navigator={onLine:online,serviceWorker:{async getRegistration(){return reg;},async register(){return reg;}}};
 const window={ConnectAndroid:null,PushManager:function(){},dispatchEvent(){}};
 const Notification={permission,requestPermission(){calls.permission++;return Promise.resolve('granted');}};window.Notification=Notification;
 const fetch=async (url,options)=>{
  if(failNetwork)throw Error('network offline');
  if(url.endsWith('/diagnostics')){calls.status++;return {ok:true,status:200,async json(){return{registered,enabled}}};}
  if(options.method==='DELETE'){calls.retire++;return{ok:true,status:200};}
  if(url.endsWith('/register')){calls.register++;return{ok:true,status:200};}
  throw Error(url);
 };
 const supabase={auth:{async getSession(){return{data:{session:{access_token:'synthetic-test-token',user:{id:'user-a'}}}};}},from(table){assert.equal(table,'notification_preferences');return{select(){return this},eq(){return this},async maybeSingle(){return{data:{enabled}}}};}};
 const context=vm.createContext({exports:{},window,navigator,Notification,PushManager:function(){},localStorage:{getItem(k){return state.get(k)||null},setItem(k,v){state.set(k,v)}},fetch,CustomEvent:class{constructor(name,opts){this.type=name;this.detail=opts.detail;}},process:{env:{NEXT_PUBLIC_VAPID_PUBLIC_KEY:'AQID'}},atob:global.atob});
 vm.runInContext(js,context);
 return{calls,state,api:context.exports,client:supabase,endpoint};
}
test('granted permission with existing registered endpoint leaves subscription untouched',async()=>{
 const f=setup();const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'active');assert.equal(f.calls.status,1);assert.equal(f.calls.subscribe,0);assert.equal(f.calls.register,0);assert.equal(f.calls.unsubscribe,0);
});
test('missing server registration is recovered without asking permission or creating a new endpoint',async()=>{
 const f=setup({registered:false});const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'active');assert.equal(f.calls.status,1);assert.equal(f.calls.register,1);assert.equal(f.calls.subscribe,0);assert.equal(f.calls.permission,0);
});
test('missing local subscription with existing consent is created once and registered',async()=>{
 const f=setup({existing:false});const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'active');assert.equal(f.calls.subscribe,1);assert.equal(f.calls.register,1);assert.equal(f.calls.permission,0);
});
test('permission not granted is never prompted automatically and no subscription is touched',async()=>{
 const f=setup({permission:'default',existing:false});const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'permission');assert.equal(f.calls.subscribe,0);assert.equal(f.calls.permission,0);
});
test('offline/failed request does not revoke or recreate the existing subscription',async()=>{
 const f=setup({failNetwork:true});const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'temporary');assert.equal(f.calls.unsubscribe,0);assert.equal(f.calls.subscribe,0);assert.equal(f.calls.register,0);
});
test('explicit disabled preference is honored without force enabling',async()=>{
 const f=setup({enabled:false});const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'disabled');assert.equal(f.calls.unsubscribe,0);assert.equal(f.calls.register,0);
});
test('mismatched key never unsubscribes automatically',async()=>{
 const f=setup({invalidKey:true});const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'invalid-key');assert.equal(f.calls.unsubscribe,0);assert.equal(f.calls.register,0);
});
test('explicit manual reconnection may rotate a mismatched VAPID subscription',async()=>{
 const f=setup({invalidKey:true});const result=await f.api.reconcileWebPush(f.client,'user-a',{manual:true});assert.equal(result.state,'active');assert.equal(f.calls.unsubscribe,1);assert.equal(f.calls.subscribe,1);assert.equal(f.calls.register,1);
});
test('old endpoint is removed only after the new endpoint is successfully registered',async()=>{
 const f=setup({registered:false});f.state.set('connect-web-push-last-endpoint:user-a','https://push.example/previous');const result=await f.api.reconcileWebPush(f.client,'user-a');assert.equal(result.state,'active');assert.equal(f.calls.register,1);assert.equal(f.calls.retire,1);assert.equal(f.state.get('connect-web-push-last-endpoint:user-a'),f.endpoint);
});
