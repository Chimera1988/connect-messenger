const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
test('real Postgres: repeatable call guard, permissions, late decline/busy, explicit hangup and rollback', async () => {
  const db = new PGlite();
  const caller = '11111111-1111-4111-8111-111111111111', callee = '22222222-2222-4222-8222-222222222222', id = '33333333-3333-4333-8333-333333333333';
  const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261110000100_connect_call_response_owner.sql'), 'utf8');
  try {
    await db.exec(`create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create role authenticated; create table connect_calls(id uuid primary key,caller_id uuid,callee_id uuid,status text,created_at timestamptz default now(),ended_at timestamptz);
      insert into connect_calls(id,caller_id,callee_id,status) values('${id}','${caller}','${callee}','active');`);
    await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/call-finish-before.sql'), 'utf8'));
    await db.exec('revoke all on function connect_finish_audio_call(uuid,text) from public; grant execute on function connect_finish_audio_call(uuid,text) to authenticated;');
    const acl = (await db.query("select proacl::text as acl from pg_proc where oid='connect_finish_audio_call(uuid,text)'::regprocedure")).rows[0].acl;
    await db.exec(migration); await db.exec(migration);
    assert.equal((await db.query("select proacl::text as acl from pg_proc where oid='connect_finish_audio_call(uuid,text)'::regprocedure")).rows[0].acl, acl);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [callee]);
    for (const reason of ['decline', 'busy', 'decline']) {
      assert.equal((await db.query('select * from connect_finish_audio_call($1,$2)', [id, reason])).rows[0].status, 'active');
      assert.equal((await db.query('select ended_at from connect_calls')).rows[0].ended_at, null);
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", ['44444444-4444-4444-8444-444444444444']);
    await assert.rejects(db.query("select * from connect_finish_audio_call($1,'hangup')", [id]), /Call unavailable/);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [callee]);
    assert.equal((await db.query("select * from connect_finish_audio_call($1,'hangup')", [id])).rows[0].status, 'ended');
    assert.equal((await db.query("select * from connect_finish_audio_call($1,'hangup')", [id])).rows[0].status, 'ended');
    await db.exec("update connect_calls set status='ringing',ended_at=null");
    assert.equal((await db.query("select * from connect_finish_audio_call($1,'decline')", [id])).rows[0].status, 'declined');
    await db.exec("update connect_calls set status='active',ended_at=null");
    assert.equal((await db.query("select * from connect_finish_audio_call($1,'failed')", [id])).rows[0].status, 'failed');
    await db.exec(fs.readFileSync(path.join(__dirname, '../supabase/rollback/20261110000100_connect_call_response_owner.sql'), 'utf8'));
    await db.exec("update connect_calls set status='active',ended_at=null");
    assert.equal((await db.query("select * from connect_finish_audio_call($1,'decline')", [id])).rows[0].status, 'ended');
    await db.exec(migration);
    // Unknown function bodies are refused before any replacement.
    await db.exec(fs.readFileSync(path.join(__dirname, 'fixtures/call-finish-before.sql'), 'utf8').replace(' for update;', ' FOR  UPDATE;'));
    await assert.rejects(db.exec(migration), /Incompatible/);
    assert.equal((await db.query('select count(*)::int as n from connect_calls')).rows[0].n, 1);
  } finally { await db.close(); }
});
