const test=require('node:test'),assert=require('node:assert/strict'),loader=require('./helpers/load-ts.cjs');
test('an optional signed URL failure after message commit is still a successful attachment send',async()=>{
 const events=[];let payload;
 const client={auth:{getSession:async()=>({data:{session:{user:{id:'self'},access_token:'fixture'}}})},rpc:async(_name,args)=>{events.push(args.p_action||'begin');return{};},from:()=>({insert:value=>{payload=value;return{select:()=>({single:async()=>({data:{...value,created_at:new Date().toISOString()},error:null})})};}}),storage:{from:()=>({createSignedUrl:async()=>{throw Error('offline after commit');}})}};
 const load=loader({'tus-js-client':{},'../connect-media-optimizer':{connectOptimizeMedia:async file=>({file})}},{File,Blob,DOMException,fetch:async()=>({ok:true})});
 const {deliverAttachments}=load('lib/chat/attachments.ts');const scope=load('lib/session-scope.ts').sessionScope;scope.setUser('self');scope.setChat('chat');
 const file=new File(['fixture'],'note.txt',{type:'text/plain'});const result=await deliverAttachments(client,'self','chat',[file],null,()=>{});assert.equal(result.data.id,payload.id);assert.equal(result.pending,false);assert.equal(events.includes('abandon'),false);
});
