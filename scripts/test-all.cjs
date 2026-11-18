'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function discover(root,e2e=false){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{const file=path.join(root,entry.name);return entry.isDirectory()?discover(file,e2e):(e2e?/\.e2e\.cjs$/:/\.(?:test|integration)\.cjs$/).test(entry.name)?[file]:[];}).sort();}
function run(root,options={}){
 const files=discover(root,process.argv.includes('--e2e'));if(!files.length)throw Error('No tests discovered');
 const environment={...process.env};delete environment.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--expose-gc','--test','--test-concurrency=1','--test-timeout=120000',...files],{stdio:'inherit',...options,env:environment});
 if(result.error)throw result.error;return result.status??1;
}
module.exports={discover,run};if(require.main===module){if(process.argv.includes('--list'))console.log(discover(path.resolve('tests')).join('\n'));else process.exitCode=run(path.resolve('tests'));}
