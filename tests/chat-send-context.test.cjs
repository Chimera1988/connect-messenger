const test=require('node:test'),assert=require('node:assert/strict');
const actual=require('./helpers/actual-function.cjs');
const load=require('./helpers/load-ts.cjs')();
const {SessionScope}=load('lib/session-scope.ts');
function harness(){
 let resolve;const response=new Promise(r=>resolve=r);let currentDraft='message in A',rows=[],notice='',busy=false;
 const scope=new SessionScope();scope.setUser('self');scope.setChat('chat-a');
 const deps={MESSAGE_COLUMNS:'id,conversation_id,body,created_at',sessionScope:scope,activeChat:'chat-a',activeChatRef:{current:'chat-a'},user:{id:'self'},draft:'message in A',busy:false,replyTo:null,editing:null,
 optimisticSend:{current:null},scrollRef:{current:null},lastKeypress:{current:0},compareChatMessages:(a,b)=>a.created_at.localeCompare(b.created_at),
 deliverMessage:()=>response,crypto,requestAnimationFrame:fn=>fn(),supabase:{from:()=>({insert:()=>({select:()=>({single:()=>response})})})},
 setBusy:v=>busy=v,setNotice:v=>notice=v,setMessages:fn=>rows=fn(rows),setDraft:v=>currentDraft=typeof v==='function'?v(currentDraft):v,setReplyTo:()=>{},updateTyping:async()=>{},setLatest:()=>{},cancelCompose:()=>{}};
 const send=Function(...Object.keys(deps),actual('app/page.tsx','sendMessage')+'\nreturn sendMessage;')(...Object.values(deps));
 return {send,resolve,scope,deps,draft:()=>currentDraft,rows:()=>rows,notice:()=>notice};
}
test('late failure from chat A does not restore its text into the composer of chat B',async()=>{
 const h=harness();const pending=h.send({preventDefault(){}});h.scope.setChat('chat-b');h.deps.activeChatRef.current='chat-b';
 h.resolve({data:null,error:{message:'offline'}});await pending;assert.equal(h.draft(),'');assert.equal(h.rows().length,0);
});
test('late success after logout does not restore message data into a later account',async()=>{
 const h=harness();const pending=h.send({preventDefault(){}});h.scope.setUser('next-user');
 h.resolve({data:{id:'server-id',body:'message in A',conversation_id:'chat-a',created_at:new Date().toISOString()},error:null});await pending;
 assert.equal(h.rows().filter(m=>!m.id.startsWith('local-')).length,0);
});
test('an obsolete send handler cannot insert its optimistic text into a later account',async()=>{
 const h=harness();h.scope.setUser('next-user');h.scope.setChat('chat-a');const job=h.send({preventDefault(){}});try{assert.equal(h.rows().length,0);}finally{h.resolve({data:null,error:{message:'offline'}});await job;}
});
