const test=require('node:test'),assert=require('node:assert/strict');
const actual=require('./helpers/actual-function.cjs');
const {SessionScope}=require('./helpers/load-ts.cjs')()('lib/session-scope.ts');
function fixture(){
 let resolve,calls=0,stops=0,recorders=0;
 const media=new Promise(r=>resolve=r),scope=new SessionScope();scope.setUser('self');scope.setChat('a');
 const deps={window:{},sessionScope:scope,navigator:{mediaDevices:{getUserMedia:()=>{calls++;return media;}}},activeChat:'a',activeChatRef:{current:'a'},recording:false,
 recordingFinalizing:{current:false},recordingChat:{current:null},recordingStream:{current:null},mediaRecorder:{current:null},recordInterval:{current:null},recordingSend:{current:null},recordingStarted:{current:0},audioChunks:{current:[]},
 MediaRecorder:class {static isTypeSupported(){return true;}constructor(){recorders++;}start(){}},setNotice(){},setRecording(){},setRecordSeconds(){},isNativeMediaRuntime:()=>false,updateRecording:async()=>{},sendAttachment:async()=>{},performance};
 const begin=Function(...Object.keys(deps),actual('app/page.tsx','beginRecording')+'\nreturn beginRecording;')(...Object.values(deps));
 return {begin,scope,resolve:()=>resolve({getTracks:()=>[{stop:()=>stops++}]}),counts:()=>({calls,stops,recorders})};
}
test('late microphone permission after logout stops capture without constructing a recorder',async()=>{
 const h=fixture();const job=h.begin();h.scope.setUser(null);h.resolve();await job;assert.equal(h.counts().stops,1);assert.equal(h.counts().recorders,0);
});
test('two quick record taps never request two independent microphone streams',async()=>{
 const h=fixture();const a=h.begin(),b=h.begin();assert.equal(h.counts().calls,1);h.scope.setUser(null);h.resolve();await Promise.all([a,b]);
});
