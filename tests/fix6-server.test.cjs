const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('FIX6 real Postgres: additive/idempotent journal, offline barrier, participants, calls fence and cascades',async()=>{
 const db=new PGlite(),a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333',chat='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555',deleted='66666666-6666-4666-8666-666666666666';
 const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261110151449_connect_fix6_history_barrier.sql'),'utf8');
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema private;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.connect_can_reach(uuid,uuid) returns boolean language sql stable as $$select true$$;
   grant usage on schema auth,private to authenticated;
   create table conversations(id uuid primary key,user_a uuid,user_b uuid);grant select on conversations to authenticated;
   create table messages(id uuid primary key,conversation_id uuid references conversations(id) on delete cascade,sender_id uuid,body text,created_at timestamptz default now(),deleted_at timestamptz);
   alter table messages enable row level security;grant select,insert,update,delete on messages to authenticated;
   create policy own_messages on messages for all to authenticated using(sender_id=auth.uid()) with check(sender_id=auth.uid());
   create table connect_calls(id uuid primary key,caller_id uuid,callee_id uuid);alter table connect_calls enable row level security;grant select on connect_calls to authenticated;
   create policy old_permissive_visibility on connect_calls for select to authenticated using(private.connect_can_reach(caller_id,callee_id));
   insert into conversations values('${chat}','${a}','${b}');insert into messages values('${id}','${chat}','${a}','keep original',now(),null),('${deleted}','${chat}','${a}','existing deleted bytes unchanged',now(),now());
   insert into connect_calls values('${id}','${a}','${b}');`);
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query('select body from messages where id=$1',[deleted])).rows[0].body,'existing deleted bytes unchanged');
  assert.equal((await db.query('select count(*)::int n from connect_message_tombstones')).rows[0].n,1);
  await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${third}',false);`);
  assert.equal((await db.query('select * from connect_deleted_since()')).rows.length,0);
  assert.equal((await db.query('select * from connect_calls')).rows.length,0);
  await assert.rejects(db.query("insert into connect_message_tombstones(message_id,conversation_id) values($1,$2)",[id,chat]),/permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  assert.equal((await db.query('select * from connect_calls')).rows.length,1);
  await db.query('update messages set deleted_at=now(),body=$1 where id=$2',['',id]);
  const events=(await db.query('select * from connect_deleted_since()')).rows;assert.equal(events.length,2);
  await db.query('delete from messages where id=$1',[id]);
  await assert.rejects(db.query('insert into messages(id,conversation_id,sender_id,body) values($1,$2,$3,$4)',[id,chat,a,'offline resurrection']),/retired/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);assert.equal((await db.query('select * from connect_deleted_since()')).rows.length,2);
  const last=events.at(-1);assert.equal((await db.query('select * from connect_deleted_since($1,$2,200)',[last.deleted_at,last.message_id])).rows.length,0);
  await db.exec('reset role');await db.query('delete from conversations where id=$1',[chat]);
  assert.equal((await db.query('select count(*)::int n from connect_message_tombstones')).rows[0].n,0);
 }finally{await db.close();}
});
