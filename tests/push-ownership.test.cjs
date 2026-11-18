const test=require('node:test'),assert=require('node:assert/strict');
const database=require('./helpers/database.cjs');
const fs=require('node:fs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',SA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',SB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('push endpoint has one account owner, revoked sessions cannot register, and DB rate limits are atomic',async()=>{
 const db=await database();try{
  const upgrade=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_connect_session_push_security.sql'));
  await db.exec(fs.readFileSync('supabase/migrations/'+upgrade,'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/'+upgrade,'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[A,'a@example.invalid',B,'b@example.invalid']);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[SA,A,SB,B]);
  await db.query("insert into push_devices(user_id,platform,endpoint)values($1,'android','fixture-installation-endpoint-123456789')",[A]);
  assert.equal((await db.query('select * from connect_push_targets($1::uuid[])',[[A]])).rows.length,0,'Unbound legacy installation must not borrow another device session');
  const register=(id,sid)=>db.query("select connect_register_push_device($1,$2,'android','fixture-installation-endpoint-123456789',null) ok",[id,sid]);
  assert.equal((await register(A,SA)).rows[0].ok,true);assert.equal((await register(B,SB)).rows[0].ok,true);
  const rows=(await db.query('select user_id from push_devices')).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,B);
  await db.query('delete from auth.sessions where id=$1',[SB]);assert.equal((await db.query('select * from push_devices')).rows.length,0);
  await assert.rejects(register(B,SB),/session/i);
  for(let i=0;i<3;i++)assert.equal((await db.query("select connect_consume_rate_limit($1,'test',3,60) ok",[A])).rows[0].ok,true);
  assert.equal((await db.query("select connect_consume_rate_limit($1,'test',3,60) ok",[A])).rows[0].ok,false);
  await db.exec('set role authenticated');await assert.rejects(db.query("select connect_consume_rate_limit($1,'test',3,60)",[A]),/permission denied/);
 }finally{await db.close();}
});
