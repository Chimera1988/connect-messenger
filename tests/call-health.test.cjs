const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/api/calls/health/route.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture(env={},allowed=true){
 const exports={};vm.runInNewContext(compiled,{exports,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',...env}},require:name=>name==='next/server'?{NextResponse:{json:(body,options={})=>({body,status:options.status||200,headers:options.headers})}}:{createClient:()=>({auth:{getUser:async()=>({data:{user:allowed?{id:'fixture'}:null},error:allowed?null:Error('denied')})}})}});
 return bearer=>exports.GET({headers:{get:()=>bearer}});
}
test('call configuration diagnostics require authenticated access',async()=>{
 assert.equal((await fixture()(null)).status,401);assert.equal((await fixture({},false)('Bearer fixture')).status,401);
});
test('missing TURN/Firebase is explicit and diagnostics never include secrets',async()=>{
 const r=await fixture()('Bearer fixture');assert.equal(r.body.relayConfigured,false);assert.equal(r.body.firebaseConfigured,false);assert.equal(r.headers['Cache-Control'],'private, no-store');
 const secret='PRIVATE_TEST_SECRET';const r2=await fixture({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'connect-messenger-5c824',client_email:'fixture',private_key:secret}),CONNECT_TURN_URLS:'turn:relay.example.invalid:3478',CONNECT_TURN_SHARED_SECRET:secret})('Bearer fixture');
 assert.equal(r2.body.firebaseProjectMatches,true);assert.equal(r2.body.relayConfigured,true);assert.ok(!JSON.stringify(r2).includes(secret));assert.deepEqual(Object.keys(r2.body).sort(),['firebaseConfigured','firebaseProjectMatches','relayConfigured','version']);
});
test('wrong Firebase project and malformed config are observable safely',async()=>{
 assert.equal((await fixture({FIREBASE_SERVICE_ACCOUNT_JSON:'{broken'})('Bearer fixture')).body.firebaseConfigured,false);
 const r=await fixture({FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({project_id:'another-project',client_email:'fixture',private_key:'fixture'}),CONNECT_TURN_URLS:'https://not-turn.invalid',CONNECT_TURN_SHARED_SECRET:'fixture'})('Bearer fixture');
 assert.equal(r.body.firebaseConfigured,true);assert.equal(r.body.firebaseProjectMatches,false);assert.equal(r.body.relayConfigured,false);
});
