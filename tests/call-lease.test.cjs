const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),database=require('./helpers/database.cjs');
test('expired upgraded call releases busy state; a legacy peer without lease is preserved',async()=>{
 const db=await database();try{const file=fs.readdirSync('supabase/migrations').find(f=>f.endsWith('_connect_call_leases.sql'));assert.ok(file);await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',chat='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[a,'a@example.invalid',b,'b@example.invalid']);await db.query('insert into conversations(id,user_a,user_b)values($1,$2,$3)',[chat,a,b]);
 const call=(await db.query("insert into connect_calls(conversation_id,caller_id,callee_id,status,offer,answer) values($1,$2,$3,'active','{\"type\":\"offer\",\"sdp\":\"fixture offer long enough\"}','{\"type\":\"answer\",\"sdp\":\"fixture answer long enough\"}') returning id",[chat,a,b])).rows[0].id;
 await db.query("insert into private.connect_call_leases(call_id,user_id,expires_at)values($1,$2,now()-interval '1 minute')",[call,a]);await db.query('select private.connect_expire_call_leases()');assert.equal((await db.query('select status from connect_calls')).rows[0].status,'active');
 await db.query("insert into private.connect_call_leases(call_id,user_id,expires_at)values($1,$2,now()+interval '1 minute')",[call,b]);await db.query('select private.connect_expire_call_leases()');assert.equal((await db.query('select status from connect_calls')).rows[0].status,'active','A live peer protects a suspended browser');
 await db.query("update private.connect_call_leases set expires_at=now()-interval '1 minute'");await db.query('select private.connect_expire_call_leases()');assert.equal((await db.query('select status from connect_calls')).rows[0].status,'ended');
 }finally{await db.close();}
});
