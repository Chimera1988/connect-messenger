const test=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-ts.cjs');
test('failed finish intent survives reload, retries under its owner and never ends another account call',async()=>{
 const values=new Map(),storage={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const module=()=>load({}, {localStorage:storage})('lib/calls/finish.ts');const first=module();let fail=true,calls=0;
 const client={rpc:async(name,args)=>{calls++;assert.equal(name,'connect_finish_owned_audio_call');assert.equal(args.p_answer_sha256,'a'.repeat(64));return fail?{error:{message:'offline'}}:{data:{status:'ended'}};}};
 await first.queueCallFinish(client,'a',{callId:'id',reason:'hangup',answerHash:'a'.repeat(64)});assert.equal(calls,1);assert.ok([...values.values()].some(v=>v.includes('id')));
 const reloaded=module();await reloaded.flushCallFinishes(client,'b');assert.equal(calls,1);fail=false;await reloaded.flushCallFinishes(client,'a');assert.equal(calls,2);await reloaded.flushCallFinishes(client,'a');assert.equal(calls,2);
});
