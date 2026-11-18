const test=require('node:test'),assert=require('node:assert/strict'),database=require('./helpers/database.cjs'),fs=require('node:fs');
test('revoked and blocked identities cannot use direct tables or SECURITY DEFINER call RPCs',async()=>{
 const db=await database();try{
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>f.startsWith('20261118')).sort())await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',chat='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await db.query('insert into auth.users(id,email)values($1,$2),($3,$4)',[a,'a@example.invalid',b,'b@example.invalid']);await db.query('insert into conversations(id,user_a,user_b)values($1,$2,$3)',[chat,a,b]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sid,a]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[a,JSON.stringify({sub:a,session_id:sid})]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from conversations')).rows.length,1);
  await db.exec('reset role');await db.query('delete from auth.sessions where id=$1',[sid]);await db.exec('set role authenticated');
  assert.equal((await db.query('select * from conversations')).rows.length,0);assert.equal((await db.query('select * from profiles')).rows.length,0);
  await assert.rejects(db.query("select connect_start_audio_call($1,'{\"type\":\"offer\",\"sdp\":\"fixture long enough offer\"}')",[chat]),/session/i);
  await db.exec('reset role');await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[sid,a]);await db.query('update profiles set is_blocked=true where id=$1',[a]);await db.exec('set role authenticated');assert.equal((await db.query('select * from conversations')).rows.length,0);
 }finally{await db.close();}
});
