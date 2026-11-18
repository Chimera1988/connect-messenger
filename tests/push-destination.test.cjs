const test=require('node:test');
const assert=require('node:assert/strict');
const load=require('./helpers/load-ts.cjs')();
test('only known HTTPS push provider endpoints are accepted; credentials, ports and local addresses are rejected',()=>{
  const {validPushSubscription}=load('lib/server/push-destination.ts');
  const sub=endpoint=>({endpoint,keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}});
  for(const endpoint of ['https://fcm.googleapis.com/fcm/send/opaque','https://web.push.apple.com/opaque','https://updates.push.services.mozilla.com/wpush/v2/opaque']) assert.equal(validPushSubscription(sub(endpoint),endpoint),true,endpoint);
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/x','https://[::1]/x','https://169.254.169.254/x','https://internal.local/a','https://fcm.googleapis.com.evil.invalid/a','https://user:pass@fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','https://web.push.apple.com/a#fragment','https://evil.invalid/redirect']) assert.equal(validPushSubscription(sub(endpoint),endpoint),false,endpoint);
  assert.equal(validPushSubscription({...sub('https://web.push.apple.com/x'),keys:{p256dh:'anything',auth:'anything'}},'https://web.push.apple.com/x'),false);
});
