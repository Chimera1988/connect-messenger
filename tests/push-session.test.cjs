const test=require('node:test'),assert=require('node:assert/strict');
const loader=require('./helpers/load-ts.cjs');
test('logout retires only this account installation before discarding auth and always locks worker identity',async()=>{
 const posts=[],requests=[];
 const {retireCurrentPush,setPushSession}=loader({}, {window:{},navigator:{onLine:true,serviceWorker:{controller:{postMessage:m=>posts.push(m)},getRegistration:async()=>({pushManager:{getSubscription:async()=>({endpoint:'https://web.push.apple.com/installation-a'})}})}},
 fetch:async(url,opts)=>{requests.push({url,opts});return new Response('{}');}})('lib/push/session.ts');
 setPushSession(null);
 await retireCurrentPush({auth:{getSession:async()=>({data:{session:{user:{id:'a'},access_token:'token-a'}}})}},'a');
 assert.equal(posts[0].type,'CONNECT_SESSION');assert.equal(posts[0].userId,'');assert.equal(requests.length,1);
 assert.equal(requests[0].opts.method,'DELETE');assert.equal(JSON.parse(requests[0].opts.body).endpoint,'https://web.push.apple.com/installation-a');
 requests.length=0;
 await retireCurrentPush({auth:{getSession:async()=>({data:{session:{user:{id:'b'},access_token:'token-b'}}})}},'a');assert.equal(requests.length,0);
});
