const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
test('installer verifies integrity, rejects path/source drift before writing and is idempotent',()=>{
 const {decode,applyManifest}=require('../scripts/remediation-installer.cjs');const root=fs.mkdtempSync(path.join(os.tmpdir(),'connect-installer-'));try{
  fs.writeFileSync(root+'/source.txt','original');const manifest={version:1,base:'a'.repeat(40),files:[{path:'source.txt',before:hash('original'),after:hash('fixed'),content:Buffer.from('fixed').toString('base64')},{path:'new.txt',before:null,after:hash('new'),content:Buffer.from('new').toString('base64')}]};
  const payload=zlib.gzipSync(JSON.stringify(manifest));assert.deepEqual(decode(payload,hash(payload)),manifest);assert.throws(()=>decode(payload,'0'.repeat(64)),/integrity/i);
  fs.writeFileSync(root+'/source.txt','unknown edit');assert.throws(()=>applyManifest(root,manifest),/SOURCE_DRIFT/);assert.equal(fs.existsSync(root+'/new.txt'),false);
  fs.writeFileSync(root+'/source.txt','original');applyManifest(root,manifest);applyManifest(root,manifest);assert.equal(fs.readFileSync(root+'/source.txt','utf8'),'fixed');assert.equal(fs.readFileSync(root+'/new.txt','utf8'),'new');
  assert.throws(()=>applyManifest(root,{...manifest,files:[{...manifest.files[1],path:'../escape.txt'}]}),/path/i);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
