const test=require('node:test'),assert=require('node:assert/strict'),actual=require('./helpers/actual-function.cjs');
test('camera switch permission arriving after recorder closes stops the granted stream',async()=>{
 let resolve,stops=0,stateChanges=0;const permission=new Promise(r=>resolve=r),previous={getTracks:()=>[{stop(){}}]};
 const deps={phase:'ready',recorderRef:{current:null},streamRef:{current:previous},flipPending:{current:false},facing:'user',navigator:{mediaDevices:{getUserMedia:()=>permission}},live:{current:null},setFacing:()=>stateChanges++,setError:()=>stateChanges++,setPhase:()=>{}};
 const flip=Function(...Object.keys(deps),actual('components/chat/VideoNoteRecorder.tsx','flipCamera')+'\nreturn flipCamera;')(...Object.values(deps));
 const job=flip();deps.streamRef.current=null;resolve({getTracks:()=>[{stop:()=>stops++}]});await job;assert.equal(stops,1);assert.equal(stateChanges,0);
});
test('two record taps before React renders create only one video recorder',()=>{
 let created=0;const stream={};const deps={streamRef:{current:stream},phase:'ready',flipPending:{current:false},recorderRef:{current:null},chunksRef:{current:[]},savedRef:{current:null},startRef:{current:0},timerRef:{current:null},
 MediaRecorder:class{static isTypeSupported(){return true;}constructor(){created++;this.state='inactive';}start(){this.state='recording';}},normalizedRecordingStream:()=>stream,isNativeMediaRuntime:()=>false,setSeconds(){},setPhase(){},onRecordingChange(){},setError(){},stopNormalizedFrames(){},window:{setInterval:()=>1},Date};
 const start=Function(...Object.keys(deps),actual('components/chat/VideoNoteRecorder.tsx','start')+'\nreturn start;')(...Object.values(deps));start();start();assert.equal(created,1);
});
