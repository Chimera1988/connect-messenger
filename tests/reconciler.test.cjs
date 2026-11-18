const test=require('node:test'),assert=require('node:assert/strict'),loadTS=require('./helpers/load-ts.cjs')();
test('reconciler serializes requests, coalesces events and uses slower healthy fallback',async()=>{
 const {createReconciler}=loadTS('lib/realtime/reconciler.ts');let finish,calls=0;const timers=[];
 const sync=createReconciler(()=>{calls++;return new Promise(r=>finish=r);},{schedule:(fn,ms)=>{timers.push({fn,ms});return timers.length;},cancel:()=>{}});
 sync.trigger();sync.trigger();sync.trigger();assert.equal(calls,1);finish();await new Promise(r=>setImmediate(r));assert.equal(calls,2);finish();await new Promise(r=>setImmediate(r));
 sync.setHealthy(true);assert.equal(timers.at(-1).ms,30000);sync.stop();timers.at(-1).fn();assert.equal(calls,2);
});
