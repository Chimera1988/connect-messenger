const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),database=require('./helpers/database.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333',AB='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',AC='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
test('inbox returns exact counts beyond 1000 messages, old chats, local hides and only participant rows',async()=>{
 const db=await database();try{
  const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_connect_inbox_summary.sql'));assert.ok(file,'Inbox migration missing');await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.query('insert into auth.users(id,email) values($1,$2),($3,$4),($5,$6)',[A,'a@example.invalid',B,'b@example.invalid',C,'c@example.invalid']);
  await db.query('insert into conversations(id,user_a,user_b) values($1,$2,$3),($4,$2,$5)',[AB,A,B,AC,C]);
  await db.query("insert into messages(conversation_id,sender_id,body,created_at) select $1,$2,'fixture','2026-01-01'::timestamptz+make_interval(secs=>i) from generate_series(1,1205)i",[AB,B]);
  await db.query("insert into messages(conversation_id,sender_id,body,created_at) values($1,$2,'older chat','2025-01-01')",[AC,C]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[AB,A,AC,B]);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:AB})]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);await db.exec('set role authenticated');
  const rows=(await db.query("select * from connect_inbox_summary('{}','{}','{}') order by conversation_id")).rows;
  assert.equal(rows.length,2);assert.equal(Number(rows.find(r=>r.conversation_id===AB).unread_count),1205);assert.equal(rows.find(r=>r.conversation_id===AC).latest.body,'older chat');
  const hidden=rows.find(r=>r.conversation_id===AC).latest.id;
  const filtered=(await db.query('select * from connect_inbox_summary($1::jsonb,$2::jsonb,$3::uuid[])',[JSON.stringify({[AB]:'2026-01-01T00:20:00Z'}),'{}',[hidden]])).rows;
  assert.equal(Number(filtered.find(r=>r.conversation_id===AB).unread_count),5);assert.equal(filtered.find(r=>r.conversation_id===AC).latest,null);
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:AC})]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[B]);assert.equal((await db.query("select * from connect_inbox_summary('{}','{}','{}')")).rows.length,1);
 }finally{await db.close();}
});
