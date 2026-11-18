const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),database=require('./helpers/database.cjs');
test('backend preflight accepts observed source and repeatable upgrade, but refuses unknown function drift',async()=>{
 const db=await database();try{
  await db.exec('create publication supabase_realtime');const preflight=fs.readFileSync('supabase/preflight.sql','utf8');await db.exec(preflight);
  for(let pass=0;pass<2;pass++)for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.startsWith('20261118')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.exec(preflight);await db.exec("create or replace function public.connect_has_live_session()returns boolean language sql as $$select false$$");await assert.rejects(db.exec(preflight),/BACKEND_SOURCE_DRIFT/);
 }finally{await db.close();}
});
