const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('test runner discovers nested regression and integration files and propagates a failing test',()=>{
 const {discover,run}=require('../scripts/test-all.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'connect-tests-'));try{fs.mkdirSync(root+'/nested');fs.writeFileSync(root+'/nested/new.test.cjs',"require('node:test')('regression',()=>{throw Error('fixture failure');});");fs.writeFileSync(root+'/rtc.integration.cjs','');fs.writeFileSync(root+'/helper.cjs','throw Error("not a test")');assert.equal(discover(root).length,2);assert.notEqual(run(root,{stdio:'pipe'}),0);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
