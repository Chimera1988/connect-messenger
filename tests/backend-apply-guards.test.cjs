const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
test('backend entry point refuses execution without explicit apply and completed-backup reference',()=>{
 const result=spawnSync('bash',['scripts/apply-backend.sh'],{env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(result.status,2);assert.match(result.stderr,/confirmation/);
});
test('database target guard rejects unrelated or unencrypted databases without echoing credentials',()=>{
 for(const url of ['postgresql://user:private-fixture@evil.invalid/postgres?sslmode=require','postgresql://postgres:private-fixture@db.tpwkmoxxzjfdsqsomhhr.supabase.co/postgres?sslmode=disable']){
  const result=spawnSync(process.execPath,['scripts/check-db-target.cjs'],{env:{...process.env,CONNECT_DATABASE_URL:url,CONNECT_PROJECT_REF:'tpwkmoxxzjfdsqsomhhr'},encoding:'utf8'});assert.notEqual(result.status,0);assert(!result.stderr.includes('private-fixture'));
 }
});

test('publication refuses to run before verification',()=>{
 const result=spawnSync('bash',['scripts/publish-remediation.sh'],{env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(result.status,2);assert.match(result.stderr,/validation/);
});
