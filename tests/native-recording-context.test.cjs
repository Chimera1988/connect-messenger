const test=require('node:test'),assert=require('node:assert/strict'),actual=require('./helpers/actual-function.cjs'),load=require('./helpers/load-ts.cjs');
test('native video result from an earlier session cannot send after A to B to A',async()=>{
 let resolve,sent=0;const response=new Promise(r=>resolve=r),scope=new(load()('lib/session-scope.ts').SessionScope)();scope.setUser('self');scope.setChat('chat');
 const deps={window:{ConnectNative:{request:()=>response}},activeChat:'chat',activeChatRef:{current:'chat'},sessionScope:scope,updateActivity:async()=>{},sendAttachment:async()=>sent++,setNotice(){},setVideoNoteOpen(){},setInterval:()=>1,clearInterval(){}};
 const open=Function(...Object.keys(deps),actual('app/page.tsx','openNativeVideoNote')+'\nreturn openNativeVideoNote;')(...Object.values(deps));const job=open();scope.setUser('next');scope.setUser('self');scope.setChat('chat');resolve({name:'private-recording'});await job;assert.equal(sent,0);
});
