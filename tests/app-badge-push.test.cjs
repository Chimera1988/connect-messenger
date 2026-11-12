'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function worker() {
  const handlers={};
  const displayed=[];
  const notices=[];
  let holdNotification=false;
  let releaseNotification=()=>{};
  const self={
    navigator:{setAppBadge:async value=>{displayed.push(value);},clearAppBadge:async()=>{displayed.push(0);}},
    registration:{
      showNotification:(title,options)=>{
        notices.push({title,options});
        if(!holdNotification)return Promise.resolve();
        return new Promise(resolve=>{releaseNotification=resolve;});
      },getNotifications:async()=>[],
    },
    addEventListener:(type,callback)=>{handlers[type]=callback;},
  };
  const ctx=vm.createContext({self,indexedDB:{},Promise,Date,Number,Math,Object,console,URL});
  vm.runInContext(readFileSync('public/sw.js','utf8'),ctx);
  // Use the real badge event and count logic but avoid browser-specific IndexedDB
  // transaction plumbing: the test is specifically the push event path.
  vm.runInContext(`let state=badgeEmpty();
    badgeChange=async(_user,update)=>{update(state);await badgeDisplay(badgeCount(state));};
    watermark=async()=>'';
  `,ctx);
  function receive(data){
    let promise;
    handlers.push({data:{json:()=>data},waitUntil(value){promise=value;}});
    assert.ok(promise,'push must be owned by waitUntil');
    return promise;
  }
  return {displayed,notices,ctx,receive,
    hold(){holdNotification=true;},
    release(){holdNotification=false;releaseNotification();}
  };
}
const chat='11111111-1111-4111-8111-111111111111';
const message={kind:'message',userId:'viewer',conversationId:chat,messageId:'message-1',createdAt:'2026-11-13T02:00:00Z',title:'From Connect'};

test('message push sets badge in background while iOS notification promise is still pending',async()=>{
 const w=worker();w.hold();
 const finish=w.receive({...message});
 // If a pending notification blocks the icon badge, this test catches it.
 for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(w.notices.length,1,'message notification was scheduled');
 assert.equal(w.displayed.at(-1),1,'badge updated without waiting for notification UI');
 w.release();await finish;
});

test('legacy message payload without createdAt receives a badge and duplicate push is counted once',async()=>{
 const w=worker();
 const legacy={...message,messageId:'legacy-1'};delete legacy.createdAt;
 await w.receive(legacy);
 assert.equal(w.displayed.at(-1),1);
 assert.ok(Date.parse(w.notices.at(-1).options.data.createdAt),'notification timestamp must be valid');
 await w.receive(legacy);
 assert.equal(w.displayed.at(-1),1,'same message must not inflate the badge');
});

test('read watermark still suppresses already read message pushes',async()=>{
 const w=worker();
 vm.runInContext("watermark=async()=> '2026-11-13T03:00:00Z'",w.ctx);
 await w.receive(message);
 assert.equal(w.displayed.length,0);
 assert.equal(w.notices.length,0);
});

test('incoming call path does not add an event badge',async()=>{
 const w=worker();
 await w.receive({kind:'incoming-call',callId:'call-1',userId:'viewer',title:'Incoming'});
 assert.equal(w.notices.length,1);
 assert.equal(w.displayed.length,0);
});
