// CONNECT_PWA_VOICE_WAVE_LAZY_RESTORE_20261116
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../lib/chat-media-presentation.ts'),'utf8');
const page=fs.readFileSync(path.join(__dirname,'../app/page.tsx'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const storage=new Map();
let fetches=0;
let events=0;
const samples=new Float32Array(430);
for(let i=0;i<samples.length;i++)samples[i]=Math.sin(i)*((Math.floor(i/10)%8+1)/8);
class AudioContextFake {
  async decodeAudioData(buffer){assert.ok(buffer.byteLength>0);return {duration:4.3,getChannelData(){return samples;}};}
  async close(){}
}
const context={
  exports:{},AudioContext:AudioContextFake,AbortController,Promise,Map,Array,Math,Number,JSON,
  setTimeout,clearTimeout,
  window:{dispatchEvent(event){if(event.type==='connect:chat-wave')events++;}},
  CustomEvent:class {constructor(type,options){this.type=type;this.detail=options.detail;}},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  fetch:async ()=>{fetches++;await Promise.resolve();return {ok:true,headers:{get:()=>String(512)},arrayBuffer:async()=>new ArrayBuffer(512)};}
};
vm.runInNewContext(compiled,context,{filename:'chat-media-presentation.js'});
const {readChatWave,prewarmChatWave}=context.exports;

test('two calls for the same new voice share one fetch and render a non-uniform 43-bar wave',async()=>{
  await Promise.all([
    prewarmChatWave('alice','chat/voice.m4a','https://cdn.example/voice.m4a',512),
    prewarmChatWave('alice','chat/voice.m4a','https://cdn.example/voice.m4a',512),
  ]);
  const wave=readChatWave('alice','chat/voice.m4a');
  assert.ok(wave,'new voice must have cached waveform after decode');
  assert.equal(wave.bars.length,43);
  assert.ok(new Set(wave.bars.map(x=>Math.round(x*100))).size>4,'voice amplitude must vary');
  assert.equal(wave.duration,4.3);
  assert.equal(fetches,1,'concurrent decode must not duplicate egress');
  assert.equal(events,1,'mounted VoicePlayer must receive update');
});

test('waveform is saved per user and survives re-display without another request',async()=>{
  await prewarmChatWave('alice','chat/voice.m4a','https://cdn.example/voice.m4a',512);
  assert.equal(fetches,1);
  assert.ok(storage.has('connect-chat-wave-v1:alice:chat/voice.m4a'));
  assert.equal(readChatWave('bob','chat/voice.m4a'),null);
  await prewarmChatWave('bob','chat/voice.m4a','https://cdn.example/voice.m4a',512);
  assert.equal(fetches,2);
});

test('large and unknown-size audio is never automatically fetched for waveform',async()=>{
  await prewarmChatWave('alice','chat/large.m4a','https://cdn.example/large.m4a',2*1024*1024+1);
  await prewarmChatWave('alice','chat/unknown.m4a','https://cdn.example/unknown.m4a',0);
  assert.equal(fetches,2);
});

test('PWA renders waves only when voice is visible and computes outgoing wave locally',()=>{
  assert.match(page,/CONNECT_PWA_VOICE_WAVE_LAZY_RESTORE_20261116/);
  assert.match(page,/new IntersectionObserver\(entries=>/);
  assert.match(page,/void prewarmChatWave\(user\.id,path,localVoiceUrl,file\.size\)/);
  assert.match(page,/\.finally\(\(\)=>URL\.revokeObjectURL\(localVoiceUrl\)\)/);
  assert.match(page,/byteSize=\{m\.attachment_size\|\|0\}/);
});
