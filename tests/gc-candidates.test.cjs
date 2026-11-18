const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),database=require('./helpers/database.cjs');
test('protected media jobs cannot starve a later eligible deletion behind the batch limit',async()=>{
 const db=await database();try{const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_connect_gc_account_protocol.sql'));await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',chat='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',path=chat+'/'+a+'/live';
 await db.query('insert into auth.users(id,email)values($1,$2),($3,$4)',[a,'a@example.invalid',b,'b@example.invalid']);await db.query('insert into conversations(id,user_a,user_b)values($1,$2,$3)',[chat,a,b]);
 await db.query("insert into messages(conversation_id,sender_id,body)values($1,$2,$3)",[chat,a,'legacy link '+path]);
 await db.query("insert into connect_media_deletion_jobs(message_id,conversation_id,sender_id,path,queued_at)values(gen_random_uuid(),$1,$2,$3,now()-interval '1 day'),(gen_random_uuid(),$1,$2,$4,now())",[chat,a,path,chat+'/'+a+'/orphan']);
 const rows=(await db.query("select * from connect_gc_candidates('media',null,null,1)")).rows;assert.equal(rows.length,1);assert.equal(Object.values(rows[0])[0].path,chat+'/'+a+'/orphan');
 }finally{await db.close();}
});
