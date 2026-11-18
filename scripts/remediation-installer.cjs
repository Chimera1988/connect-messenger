'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),{execFileSync}=require('node:child_process');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function decode(payload,expected){if(!/^[a-f0-9]{64}$/.test(expected)||hash(payload)!==expected)throw Error('Payload integrity check failed');const manifest=JSON.parse(zlib.gunzipSync(payload,{maxOutputLength:20*1024*1024}));if(manifest.version!==1||!Array.isArray(manifest.files)||!/^[a-f0-9]{40}$/.test(manifest.base))throw Error('Unsupported manifest');return manifest;}
function target(root,name){
 if(typeof name!=='string'||!name||!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(part=>!part||part==='..'||part==='.'||part==='.git')||path.isAbsolute(name))throw Error('Unsafe manifest path');
 const file=path.join(root,name);let current=root;for(const part of name.split('/')){current=path.join(current,part);if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw Error('Symlink manifest path is prohibited');}return file;
}
function inspect(root,manifest){
 const seen=new Set();return manifest.files.map(entry=>{if(seen.has(entry.path))throw Error('Duplicate manifest path');seen.add(entry.path);const file=target(root,entry.path),actual=fs.existsSync(file)?hash(fs.readFileSync(file)):null;
  if(entry.before!==null&&!/^[a-f0-9]{64}$/.test(entry.before)||entry.after!==null&&!/^[a-f0-9]{64}$/.test(entry.after))throw Error('Invalid manifest digest');
  const content=entry.after===null?null:Buffer.from(entry.content,'base64');if(content&&hash(content)!==entry.after)throw Error('File content integrity check failed: '+entry.path);
  if(actual!==entry.before&&actual!==entry.after)throw Error('SOURCE_DRIFT: '+entry.path);
  return {entry,file,actual,content};
 });
}
function applyManifest(root,manifest){
 const changes=inspect(root,manifest); // Verify every path and byte before the first mutation.
 for(const {entry,file,actual,content}of changes){if(actual===entry.after)continue;if(content===null)fs.unlinkSync(file);else{fs.mkdirSync(path.dirname(file),{recursive:true});const temporary=file+'.connect-install-tmp';fs.writeFileSync(temporary,content,{flag:'wx'});fs.chmodSync(temporary,fs.existsSync(file)?fs.statSync(file).mode&0o777:0o644);fs.renameSync(temporary,file);}}
 inspect(root,manifest);return changes.map(row=>row.entry.path);
}
function assertSource(root,manifest){
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 let changes;try{changes=git('diff','--name-only',manifest.base,'HEAD').split('\n').filter(Boolean);}catch{throw Error('SOURCE_DRIFT: expected base commit is unavailable');}
 const states=inspect(root,manifest),allAfter=states.every(state=>state.actual===state.entry.after),allowed=new Set(allAfter?manifest.files.map(file=>file.path):[]);allowed.add('.github/workflows/connect-architecture-remediation.yml');
 if(changes.some(file=>!allowed.has(file)))throw Error('SOURCE_DRIFT: repository HEAD changed beyond the reviewed source');
}
module.exports={decode,applyManifest,assertSource};
if(require.main===module){try{
 const [root,encoded,expected,listFile]=process.argv.slice(2);if(!root||!encoded||!expected)throw Error('Usage: installer root payload.b64 sha256 [paths-file]');
 const manifest=decode(Buffer.from(fs.readFileSync(encoded,'utf8').replace(/\s/g,''),'base64'),expected);assertSource(root,manifest);const names=applyManifest(root,manifest);if(listFile)fs.writeFileSync(listFile,Buffer.from(names.join('\0')+'\0'));console.log('Verified and applied '+names.length+' reviewed paths.');
}catch(error){console.error(error.message);process.exitCode=1;}}
