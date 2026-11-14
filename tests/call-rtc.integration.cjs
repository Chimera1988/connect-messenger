/* Real local WebRTC/Opus transport, actual PWA handlers, in-memory signaling.
 * No physical microphone, user credentials, external calls or TURN assertions.
 * Explicit GC drains the native test addon's resources before Node shuts down.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript'),wrtc=require('@roamhq/wrtc');
const source=fs.readFileSync(path.join(__dirname,'../components/ConnectAudioCalls.tsx'),'utf8');
const tree=ts.createSourceFile('calls.tsx',source,99,true,4),functions=new Map();
function walk(node){if(ts.isFunctionDeclaration(node)&&node.name)functions.set(node.name.text,node.getText(tree));ts.forEachChild(node,walk);}walk(tree);
const copy=value=>JSON.parse(JSON.stringify(value));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const chat='33333333-3333-4333-8333-333333333333';
const all=[],timers=new Set(),sinks=new Set();let row=null,sequence=0,nextCall=0,failedIce=0,denyMicrophone=false;
const ice=[];
function later(fn){queueMicrotask(()=>void fn());}
function endpoint(userId,frequency){
 const facts={frames:0,nonzero:0,connected:0},context={console:{info(){},warn(){}},Date,Error,Promise,Set,Map,AbortController,
  setTimeout,clearTimeout,traceCall(){},userId,phase:'idle',shownName:'Test',
  RING_TIMEOUT_MS:50000,uuidPattern:/^[a-f0-9-]{36}$/i,isLive:s=>s==='ringing'||s==='active',friendlyError:e=>e.message,
  window:{},navigator:{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)',audioSession:{type:'auto'},mediaDevices:{async getUserMedia(){
   if(denyMicrophone===userId){denyMicrophone=false;throw Error('test permission denied');}
   const source=new wrtc.nonstandard.RTCAudioSource(),track=source.createTrack();let frame=0;
   const timer=setInterval(()=>{if(track.readyState!=='live'){clearInterval(timer);timers.delete(timer);return;}
    const samples=new Int16Array(480);for(let i=0;i<480;i++)samples[i]=Math.round(6000*Math.sin(2*Math.PI*frequency*(frame*480+i)/48000));frame++;
    source.onData({samples,sampleRate:48000,bitsPerSample:16,channelCount:1,numberOfFrames:480});},10);
   timers.add(timer);return new wrtc.MediaStream([track]);
  }}},MediaStream:wrtc.MediaStream,
  RTCPeerConnection:class extends wrtc.RTCPeerConnection{constructor(options){super(options);this.addEventListener('track',event=>{
   const sink=new wrtc.nonstandard.RTCAudioSink(event.track);sinks.add(sink);sink.ondata=data=>{facts.frames++;if(data.samples.some(n=>Math.abs(n)>100))facts.nonzero++;};
  });}},
  getIceServers:async()=>[],notifyIncoming:async()=>{},notifyCallEnded:async()=>{},
  soundRef:{current:{unlock(){},stop(){},connected(){facts.connected++;}}},
  remoteAudioRef:{current:{srcObject:null,pause(){},play:()=>Promise.resolve()}},
  setPhase(value){context.phase=value;},setShown(){},setShownName(){},setShownPeerId(){},setShownAvatarUrl(){},setSpeakerOn(){},setElapsed(){},setMuted(){},setToast(){},setError(){},
 };
 for(const name of ['call','pc','stream','iceChannel','ringTimeout','transportTimeout','submittedAnswer'])context[name+'Ref']={current:null};
 for(const name of ['localIce','remoteIce'])context[name+'Ref']={current:[]};
 for(const name of ['answerPending','outgoingPending','entered','iceSyncing','iceSending'])context[name+'Ref']={current:false};
 context.knownIceRef={current:new Set()};context.generationRef={current:0};context.remoteIceCursorRef={current:0};
 context.client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-local-token'}}})},
  removeChannel:async()=>{},channel(){const q={on(){return q},subscribe(fn){later(()=>fn('SUBSCRIBED'));return q}};return q;},
  from(table){let filters=[];const q={select(){return q},eq(k,v){filters.push(m=>m[k]===v);return q},neq(k,v){filters.push(m=>m[k]!==v);return q},gt(k,v){filters.push(m=>m[k]>v);return q},order(){return q},
   async insert(value){if(userId===ids[0]&&failedIce===0){failedIce++;return{error:{code:'TEST_TRANSIENT'}};}ice.push({...copy(value),id:++sequence});return{};},
   async limit(n){return{data:ice.filter(m=>filters.every(f=>f(m))).slice(0,n)};},
   async maybeSingle(){return{data:table==='profiles'?{display_name:'Test'}:row&&filters.every(f=>f(row))?copy(row):null};}
  };return q;},
  async rpc(name,args){
   if(name==='connect_start_audio_call'){
    row={id:`44444444-4444-4444-8444-${String(++nextCall).padStart(12,'0')}`,conversation_id:chat,caller_id:userId,callee_id:ids.find(id=>id!==userId),status:'ringing',created_at:new Date().toISOString(),offer:copy(args.p_offer),answer:null};
    const pending=copy(row);later(()=>right.presentIncoming(pending));return{data:copy(row)};
   }
   if(name==='connect_answer_audio_call'){
    if(!row||row.status!=='ringing')return{error:{message:'Call unavailable or already answered'}};
    row={...row,status:'active',answer:copy(args.p_answer),answered_at:new Date().toISOString()};
   }else if(name==='connect_finish_audio_call'){
    if(['decline','busy'].includes(args.p_reason)&&row.status==='active')return{data:copy(row)};
    row={...row,status:args.p_reason==='decline'?'declined':'ended',ended_at:new Date().toISOString()};
   }
   const updated=copy(row);for(const c of all)later(()=>c.onUpdatedCall(updated));return{data:updated};
  },
 };
 vm.createContext(context);
 for(const name of ['configureCallAudioSession','sendIce','flushLocalIce','flushRemoteIce','receiveIce','pullIce','watchIce','cleanup','finish','connectionDeadline','createPeer','onUpdatedCall','presentIncoming','startOutgoing','acceptIncoming']){
  assert.ok(functions.has(name),name);vm.runInContext(ts.transpileModule(functions.get(name),{compilerOptions:{target:99}}).outputText,context);
 }
 context.facts=facts;all.push(context);return context;
}
let left=endpoint(ids[0],440),right=endpoint(ids[1],660);
const poll=setInterval(()=>{for(const c of all)if(c.callRef.current&&c.pcRef.current){void c.flushLocalIce();void c.pullIce();}},40);
async function until(check,label){const end=Date.now()+10000;while(Date.now()<end){if(check())return;await wait(30);}throw Error('Timed out: '+label);}
async function begin(){await left.startOutgoing({conversationId:chat,peerId:ids[1],peerName:'Test'});await until(()=>right.phase==='incoming','incoming');await right.acceptIncoming();}
async function main(){
 await begin();assert.equal(left.navigator.audioSession.type,'play-and-record');assert.equal(right.navigator.audioSession.type,'play-and-record');await until(()=>left.facts.nonzero>20&&right.facts.nonzero>20,'bidirectional decoded PCM');
 // In trickle ICE the initial SDP is immutable; candidates arrive as separate
 // signaling rows. Do not require localDescription.sdp to grow after setLocalDescription.
 await until(()=>ids.every(id=>ice.some(candidate=>candidate.call_id===row.id&&candidate.sender_id===id&&candidate.candidate?.candidate)),
  'both peers persist their trickled ICE candidates');
 const persistedIce=ice.filter(candidate=>candidate.call_id===row.id);
 await right.onUpdatedCall(copy(row));assert.equal(right.phase,'active');assert.equal(left.phase,'active');
 const first={left:copy(left.facts),right:copy(right.facts),trickledIcePersisted:persistedIce.length,iceRetryFailures:failedIce};
 assert.equal(failedIce,1);assert.equal(first.left.connected,1);assert.equal(first.right.connected,1);
 const shadow=endpoint(ids[1],880);shadow.presentIncoming({...copy(row),status:'ringing'});await shadow.acceptIncoming();
 assert.equal(row.status,'active');assert.equal(left.phase,'active');assert.equal(right.phase,'active');assert.equal(shadow.phase,'idle');
 for(const sink of sinks)sink.stop();sinks.clear();
 await right.finish('hangup');await until(()=>left.phase==='idle'&&right.phase==='idle','both ends release');assert.equal(left.navigator.audioSession.type,'auto');assert.equal(right.navigator.audioSession.type,'auto');
 denyMicrophone=ids[1];await begin();await until(()=>left.phase==='idle'&&right.phase==='idle','permission failure release');
 const oldFrames=[left.facts.nonzero,right.facts.nonzero];await begin();
 await until(()=>left.facts.nonzero>oldFrames[0]+10&&right.facts.nonzero>oldFrames[1]+10,'next call without restart');
 for(const sink of sinks)sink.stop();sinks.clear();await left.finish('hangup');await until(()=>right.phase==='idle','caller hangup');
 return{scope:'actual PWA handlers + Linux native WebRTC/Opus, synthetic PCM and in-memory signaling; not physical Android/iOS/FCM/TURN',firstCall:first,
  shadowDeviceCannotEndWinningCall:true,calleeAndCallerHangups:true,nextCallAfterPermissionFailure:true};
}
(async()=>{let result;
 try{result=await main();console.log(JSON.stringify(result,null,2));if(process.env.CONNECT_RTC_REPORT)fs.writeFileSync(process.env.CONNECT_RTC_REPORT,JSON.stringify(result,null,2)+'\n');}
 catch(error){console.error(error);process.exitCode=1;}
 finally{
  clearInterval(poll);for(const sink of sinks)sink.stop();sinks.clear();for(const timer of timers)clearInterval(timer);timers.clear();
  for(const c of all)c.cleanup();all.length=0;left=right=null;await wait(200);
  if(global.gc)global.gc();await wait(200);
 }
})();
