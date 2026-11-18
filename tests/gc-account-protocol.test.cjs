const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),database=require('./helpers/database.cjs');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',CHAT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',W1='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',W2='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
test('GC leases exclude competing workers, protect live references and reject references after retirement',async()=>{
 const db=await database();try{
  const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_connect_gc_account_protocol.sql'));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
  await db.query('insert into auth.users(id,email)values($1,$2),($3,$4)',[A,'a@example.invalid',B,'b@example.invalid']);await db.query('insert into conversations(id,user_a,user_b)values($1,$2,$3)',[CHAT,A,B]);const path=CHAT+'/'+A+'/fixture';
  const prepare=(p,w=W1)=>db.query("select connect_gc_prepare('connect-attachments',$1,$2) safe",[p,w]);
  const message=(await db.query("insert into messages(conversation_id,sender_id,body,attachment_path,attachment_name,attachment_kind,attachment_type,attachment_size)values($1,$2,'file',$3,'fixture','file','application/octet-stream',10)returning id",[CHAT,A,path])).rows[0].id;
  assert.equal((await prepare(path)).rows[0].safe,false);await db.query('delete from messages where id=$1',[message]);
  assert.equal((await prepare(path)).rows[0].safe,true);assert.equal((await prepare(path,W2)).rows[0].safe,false);
  await assert.rejects(db.query("insert into messages(conversation_id,sender_id,body,attachment_path)values($1,$2,'late',$3)",[CHAT,A,path]),/retired/i);
  await assert.rejects(db.query("insert into messages(conversation_id,sender_id,body)values($1,$2,$3)",[CHAT,A,'[[connect-album:'+JSON.stringify([{path,name:'x',kind:'image'}])+']]']),/retired/i);
  await db.query('select connect_gc_ack($1,$2,$3)',['connect-attachments',path,W1]);assert.equal((await db.query('select * from connect_media_deletion_jobs')).rows.length,0);
 }finally{await db.close();}
});
test('Auth delete anonymizes identity atomically and preserves peer messages, calls and referenced files',async()=>{
 const db=await database();try{const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_connect_gc_account_protocol.sql'));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.query('insert into auth.users(id,email)values($1,$2),($3,$4)',[A,'a@example.invalid',B,'b@example.invalid']);await db.query('insert into conversations(id,user_a,user_b)values($1,$2,$3)',[CHAT,A,B]);
 const attachment=CHAT+'/'+A+'/history-file.bin',avatar=A+'/avatar.jpg';
 await db.query("insert into messages(conversation_id,sender_id,body,attachment_path,attachment_name,attachment_kind,attachment_type,attachment_size)values($1,$2,'history',$3,'history-file.bin','file','application/octet-stream',10)",[CHAT,A,attachment]);
 await db.query("insert into storage.objects(bucket_id,name,owner_id)values('connect-attachments',$1,$3),('connect-avatars',$2,$3)",[attachment,avatar,A]);await db.query("insert into connect_calls(conversation_id,caller_id,callee_id,status,offer)values($1,$2,$3,'ended','{}')",[CHAT,A,B]);
 await db.query('delete from auth.users where id=$1',[A]);assert.equal((await db.query('select * from conversations')).rows.length,1);assert.equal((await db.query('select * from messages')).rows.length,1);assert.equal((await db.query('select * from connect_calls')).rows.length,1);
 const profile=(await db.query('select * from profiles where id=$1',[A])).rows[0];assert.equal(profile.display_name,'Удалённый пользователь');assert.equal(profile.is_blocked,true);assert.ok(profile.deleted_at);
 assert.equal((await db.query("select connect_account_file_gc_is_safe('connect-attachments',$1,$2) safe",[attachment,A])).rows[0].safe,false);
 assert.equal((await db.query("select connect_account_file_gc_is_safe('connect-avatars',$1,$2) safe",[avatar,A])).rows[0].safe,true);
 await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[W2,B]);await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[B,JSON.stringify({session_id:W2})]);await db.exec('set role authenticated');
 assert.equal((await db.query('select * from messages')).rows.length,1);assert.equal((await db.query('select * from conversations')).rows.length,1);assert.equal((await db.query('select * from connect_calls')).rows.length,1);
 }finally{await db.close();}
});
