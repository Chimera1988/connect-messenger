const test=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-ts.cjs'),auth=require('./helpers/route-auth.cjs');
test('failed Auth deletion never overwrites the profile and password-check session is closed',async()=>{
 let updates=0,closed=0;const user='11111111-1111-4111-8111-111111111111';
 const db=auth.decorate({from:()=>{const q={select:()=>q,eq:()=>q,update:()=>{updates++;return q;},maybeSingle:async()=>({data:{is_blocked:false}})};return q;}},user);db.auth.getUser=async()=>({data:{user:{id:user,email:'fixture@example.invalid'}}});db.auth.admin={deleteUser:async()=>({error:Error('Auth temporarily unavailable')})};
 const verifier={auth:{signInWithPassword:async()=>({data:{user:{id:user}},error:null}),signOut:async()=>{closed++;return{};}}};
 const route=load({'@supabase/supabase-js':{createClient:(_url,key)=>key==='public'?verifier:db}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://example.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'service-fixture'}}})('app/api/account/delete/route.ts');
 const result=await route.POST(new Request('https://example.invalid/api/account/delete',{method:'POST',headers:{authorization:auth.token(user),'content-type':'application/json'},body:JSON.stringify({password:'fixture'})}));assert.notEqual(result.status,200);assert.equal(updates,0);assert.equal(closed,1);
});
