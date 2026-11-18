const test = require('node:test');
const assert = require('node:assert/strict');
const loader = require('./helpers/load-ts.cjs');
const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
function fixture({active = true, blocked = false, authError = null, profileError = null, sessionError = null} = {}) {
  const token = 'header.' + Buffer.from(JSON.stringify({sub:USER,session_id:SESSION})).toString('base64url') + '.signature';
  const client = {
    auth: { getUser: async () => ({data:{user:{id:USER}},error:authError}) },
    from: table => { assert.equal(table,'profiles'); return {select: () => ({eq: () => ({maybeSingle: async () => ({data:{is_blocked:blocked},error:profileError})})})}; },
    rpc: async (name,args) => { assert.equal(name,'connect_auth_session_active'); assert.equal(args.p_user_id,USER);assert.equal(args.p_session_id,SESSION);return {data:active,error:sessionError}; },
  };
  const api=loader({'@supabase/supabase-js':{createClient:()=>client}}, {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'server-fixture'}}})('lib/server/admin.ts');
  return {api,request:new Request('https://app.invalid/api',{headers:{authorization:'Bearer '+token}})};
}
test('a revoked session cannot use service-role routes even with a valid user JWT',async()=>{
  const {api,request}=fixture({active:false});
  await assert.rejects(api.authenticatedUser(request),e=>e.status===401);
});
test('blocked access is forbidden and backend failures stay distinguishable from invalid credentials',async()=>{
  for(const [options,status] of [[{blocked:true},403],[{profileError:{code:'network'}},503],[{sessionError:{code:'network'}},503],[{authError:{status:503}},503]]){
    const {api,request}=fixture(options);await assert.rejects(api.authenticatedUser(request),e=>e.status===status);
  }
});
test('verified session context is bound to the signature-validated user',async()=>{
  const {api,request}=fixture(); const result=await api.authenticatedUser(request);assert.equal(result.sessionId,SESSION);assert.equal(result.user.id,USER);
});
test('authentication errors produce appropriate HTTP status without leaking backend details',()=>{
  const {api}=fixture();assert.equal(api.fail(new api.HttpError(403,'Доступ закрыт')).status,403);
});
test('TURN health endpoint rejects a blocked account rather than bypassing common authorization',async()=>{
  const token='header.'+Buffer.from(JSON.stringify({sub:USER,session_id:SESSION})).toString('base64url')+'.signature';
  const client={auth:{getUser:async()=>({data:{user:{id:USER}},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{is_blocked:true},error:null})})})}),rpc:async()=>({data:true,error:null})};
  const route=loader({'@supabase/supabase-js':{createClient:()=>client},'next/server':{NextResponse:Response}}, {process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture'}}})('app/api/calls/health/route.ts');
  const response=await route.GET(new Request('https://app.invalid/api/calls/health',{headers:{authorization:'Bearer '+token}}));assert.equal(response.status,403);
});
test('rate limiter fails closed on backend errors and returns 429 on a spent budget',async()=>{
 const {api}=fixture();
 for(const [result,status] of [[{data:false,error:null},429],[{data:null,error:{code:'unavailable'}},503]])
  await assert.rejects(api.requireRateLimit({rpc:async()=>result},USER,'turn',12,60),e=>e.status===status);
});
