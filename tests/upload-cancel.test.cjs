const test=require('node:test'),assert=require('node:assert/strict'),load=require('./helpers/load-ts.cjs');
test('logout aborts a live resumable upload and its retry timers',async()=>{
 let stopped=0,started=0;const fake={Upload:class{start(){started++;}async abort(){stopped++;}}};
 const module=load({'tus-js-client':fake},{Blob,DOMException})('lib/media/upload.ts');
 const controller=new AbortController();const job=module.uploadObject(new Blob([new Uint8Array(7*1024**2)]),'fixture',{endpoint:'https://example.invalid',token:'fixture',key:'fixture',signal:controller.signal});assert.equal(started,1);controller.abort();await assert.rejects(job,/cancelled/);assert.equal(stopped,1);
});
