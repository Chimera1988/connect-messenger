const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./helpers/load-ts.cjs')();
test('session reset stops playback and drops the private source and decoder',()=>{
 const {releasePlayback}=load('lib/media/playback-lifecycle.ts');
 let paused=false,src='https://private.invalid/media',stream={},loads=0;
 const audio={pause(){paused=true;},removeAttribute(name){assert.equal(name,'src');src='';},load(){loads++;},get srcObject(){return stream;},set srcObject(value){stream=value;}};
 releasePlayback(audio);assert.equal(paused,true);assert.equal(src,'');assert.equal(stream,null);assert.equal(loads,1);
});
