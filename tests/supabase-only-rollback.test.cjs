'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const page=require('./helpers/app-source.cjs')();
const pkg=JSON.parse(read('package.json'));
test('one authoritative Supabase path for send, read, edit, delete and history',()=>{
  assert.match(page,/supabase\.from\('messages'\)\.insert/);
  assert.match(page,/supabase\.from\('messages'\)\.update/);
  assert.match(page,/await eraseMessage\(m\)/);
  assert.match(page,/supabase\.from\('messages'\)\.select/);
  assert.doesNotMatch(page,/connectNeon|connect-neon|CONNECT_NEON/i);
});
test('all Neon HTTP endpoints, client helpers and rollout jobs are gone',()=>{
  assert.equal(fs.existsSync(path.join(root,'app/api/connect-neon')),false);
  for(const prefix of ['lib/connect-neon-','tests/connect-neon-','.github/workflows/connect-neon-']){
    const dir=path.dirname(prefix),head=path.basename(prefix);
    const found=fs.readdirSync(path.join(root,dir)).filter(name=>name.startsWith(head));
    assert.deepEqual(found,[],prefix+' residual files');
  }
});
test('old sign-out and media-cache repairs are preserved',()=>{
  assert.match(page,/CONNECT_PWA_LOGOUT_SESSION_RECOVERY_20261117/);
  assert.match(page,/signOut\(\{ scope: 'local' \}\)/);
  assert.match(page,/setUser\(null\); setLoading\(false\); setSetup\(false\)/);
  assert.equal(fs.existsSync(path.join(root,'tests/pwa-logout-regression.test.cjs')),true);
  assert.equal(fs.existsSync(path.join(root,'tests/media-cache-stale-error.test.cjs')),true);
});
test('Neon client libraries are removed, essential Supabase services unchanged',()=>{
  for(const name of ['pg','@aws-sdk/client-s3','@aws-sdk/s3-request-presigner']){
    assert.equal(pkg.dependencies[name],undefined,name+' no longer needed');
  }
  assert.equal(pkg.dependencies['@supabase/supabase-js'],'2.57.0');
  const discovered=require('../scripts/test-all.cjs').discover(path.join(root,'tests'));
  for(const name of ['pwa-logout-regression.test.cjs','media-cache-stale-error.test.cjs','supabase-only-rollback.test.cjs'])assert(discovered.some(file=>file.endsWith(name)),name);
});
