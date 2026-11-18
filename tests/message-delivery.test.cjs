const test=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-ts.cjs');
test('committed message with lost response is recovered by stable UUID; retry never inserts a second row',async()=>{
 const {deliverMessage}=load()('lib/chat/delivery.ts');const rows=new Map();let inserts=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'self'}}}})},from:()=>({insert:payload=>{inserts++;rows.set(payload.id,payload);return{select:()=>({single:async()=>({error:{message:'lost response'}})})};},select:()=>{let id;const q={eq:(k,v)=>{if(k==='id')id=v;return q;},maybeSingle:async()=>({data:rows.get(id)})};return q;}})};
 const message={id:crypto.randomUUID(),conversation_id:'chat',sender_id:'self',body:'hello'};
 const result=await deliverMessage(client,message);assert.equal(result.data.id,message.id);assert.equal(rows.size,1);assert.equal(inserts,1);
});

test('an outbox retry cannot send or discard the previous account payload under a new identity',async()=>{
 const {deliverMessage,retryMessageOutbox}=load()('lib/chat/delivery.ts');let identity='next',inserts=0;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:identity}}}})},from:()=>({insert:payload=>{inserts++;return{select:()=>({single:async()=>({data:payload})})};}})};
 const message={id:crypto.randomUUID(),conversation_id:'chat',sender_id:'self',body:'private'};assert.equal((await deliverMessage(client,message)).pending,true);assert.equal(inserts,0);
 identity='self';await retryMessageOutbox(client,'self',()=>{});assert.equal(inserts,1);
});
