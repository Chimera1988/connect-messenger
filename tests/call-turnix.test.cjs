const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../app/api/calls/ice/route.ts'),'utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const USER='00000000-0000-4000-8000-123456789abc', SECRET='MY_PRIVATE_TURNIX_FIXTURE_TOKEN';
function fixture({env={},upstream,authorized=true,clientIP='203.0.113.9'}={}){
  const requests=[],warnings=[],exports={};
  const deps={
    'node:crypto':crypto,
    'node:net':require('node:net'),
    '@supabase/supabase-js':{createClient:()=>({auth:{getUser:async()=>({data:{user:authorized?{id:USER}:null},error:authorized?null:Error('unauthorized')})}})},
    'next/server':{NextResponse:{json:(body,opts={})=>({status:opts.status||200,body,headers:opts.headers||{}})}},
  };
  vm.runInNewContext(compiled,{exports,require:n=>{assert.ok(deps[n],'unexpected dep '+n);return deps[n]},
    process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'publishable',...env}},
    console:{warn:(...items)=>warnings.push(items.join(' '))},
    fetch:async(url,opts)=>{requests.push({url,opts});return upstream?upstream(url,opts):{ok:false,status:503}},
    AbortSignal,Date,JSON,Promise,
  });
  return {requests,warnings,get:auth=>exports.GET({headers:{get:name=>name==='authorization'?auth:(name==='x-vercel-forwarded-for'?clientIP:null)}})};
}
const issued={iceServers:[
  {urls:['stun:stun.turnix.io:3478']},
  {urls:['turn:eu-central.turnix.io:3478?transport=udp','turns:eu-central.turnix.io:443?transport=tcp'],username:'short-lived',credential:'temporary'},
],expiresAt:'2026-11-11T00:00:00Z'};
test('unauthorized clients cannot request TURN credentials',async()=>{
  const a=fixture({env:{TURNIX_API_TOKEN:SECRET}});assert.equal((await a.get(null)).status,401);assert.equal(a.requests.length,0);
  const b=fixture({env:{TURNIX_API_TOKEN:SECRET},authorized:false});assert.equal((await b.get('Bearer invalid')).status,401);assert.equal(b.requests.length,0);
});
test('Turnix credentials become ICE servers for PWA and APK without disclosing the API token',async()=>{
  const a=fixture({env:{TURNIX_API_TOKEN:SECRET},upstream:async()=>({ok:true,json:async()=>issued})});
  const result=await a.get('Bearer session');assert.equal(result.status,200);assert.equal(result.body.relayConfigured,true);
  assert.equal(a.requests.length,1);const {url,opts}=a.requests[0];
  assert.equal(url,'https://turnix.io/api/v1/credentials/ice');
  assert.equal(opts.headers.Authorization,'Bearer '+SECRET);
  assert.equal(opts.headers['X-TURN-CLIENT-IP'],'203.0.113.9');
  const sent=JSON.parse(opts.body);assert.equal(sent.ttl,3600);
  assert.match(sent.initiator_client,/^u_[a-f0-9]{24}$/);assert.equal(opts.method,'POST');
  assert.equal(JSON.stringify(result).includes(SECRET),false);
  assert.equal(result.body.iceServers.find(x=>x.username==='short-lived').credential,'temporary');
  assert.equal(result.headers['Cache-Control'],'private, no-store');
});
test('missing token leaves the previous STUN fallback operational',async()=>{
  const a=fixture();const result=await a.get('Bearer session');
  assert.equal(result.status,200);assert.equal(result.body.relayConfigured,false);
  assert.equal(a.requests.length,0);assert.ok(result.body.iceServers.length);
});
test('Turnix 401, 429, exceptions and malformed credentials never leak secrets',async()=>{
  const upstreams=[
    async()=>({ok:false,status:401}),async()=>({ok:false,status:429}),
    async()=>{throw Error('secret can never appear')},
    async()=>({ok:true,json:async()=>({iceServers:[{urls:'stun:stun.turnix.io:3478'}]})}),
    async()=>({ok:true,json:async()=>({iceServers:[{urls:'https://host.invalid',username:'a',credential:'b'}]})}),
  ];
  for(const upstream of upstreams){const a=fixture({env:{TURNIX_API_TOKEN:SECRET},upstream});
    const r=await a.get('Bearer session');assert.equal(r.status,200);assert.equal(r.body.relayConfigured,false);
    assert.ok(r.body.iceServers.length);assert.ok(!JSON.stringify(r).includes(SECRET));
    assert.ok(a.warnings.length);assert.ok(!a.warnings.join('').includes(SECRET));
  }
});
test('existing coturn remains an optional fallback when Turnix is unavailable',async()=>{
  const a=fixture({env:{TURNIX_API_TOKEN:SECRET,CONNECT_TURN_URLS:'turn:relay.invalid:3478',CONNECT_TURN_SHARED_SECRET:'fixture-old-secret'},upstream:async()=>({ok:false,status:503})});
  const r=await a.get('Bearer session');assert.equal(r.body.relayConfigured,true);
  assert.ok(r.body.iceServers.some(x=>x.urls.includes('turn:relay.invalid:3478')));
});
test('spoofed X-Forwarded-For is ignored; IP passed only from trusted edge header',async()=>{
  const a=fixture({env:{TURNIX_API_TOKEN:SECRET},clientIP:'not an IP',upstream:async()=>({ok:true,json:async()=>issued})});
  await a.get('Bearer session');assert.equal(a.requests[0].opts.headers['X-TURN-CLIENT-IP'],undefined);
});
