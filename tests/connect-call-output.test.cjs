const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/connect-call-output.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const ctx=vm.createContext({exports:{}});vm.runInContext(js,ctx);const api=ctx.exports;
test('only real, distinct browser audio outputs are shown',()=>{
 const list=api.listedCallOutputs([{kind:'audioinput',deviceId:'m',label:'Mic'},{kind:'audiooutput',deviceId:'a',label:'Bluetooth'},{kind:'audiooutput',deviceId:'a',label:'duplicate'},{kind:'audiooutput',deviceId:'b',label:''},{kind:'audiooutput',deviceId:'',label:'anonymous'}]);
 assert.equal(list.length,2);assert.equal(list[0].label,'Bluetooth');assert.equal(list[1].label,'Аудиоустройство 2');
});
test('sink switch is real and awaited, not a fake Android speaker toggle',async()=>{
 let switched='unselected';const audio={setSinkId:async id=>{switched=id;}};
 assert.equal(api.callOutputSupported(audio),true);
 await api.chooseCallOutput(audio,'bluetooth-id');assert.equal(switched,'bluetooth-id');
 await api.chooseCallOutput(audio,'');assert.equal(switched,'');
});
test('browser without setSinkId must not claim a working audio output selector',async()=>{
 assert.equal(api.callOutputSupported({play(){}}),false);
 await assert.rejects(api.chooseCallOutput({play(){}},'fake-speaker'),/не поддерживается/);
});
