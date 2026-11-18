const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
test('baseline rebuilds schema and enforces participant access without production data', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage; create schema vault; create schema net; create schema extensions;
      create table auth.users(id uuid primary key,email text);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create function auth.role() returns text language sql stable as $$ select current_user::text $$;
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,created_at timestamptz default now(),updated_at timestamptz default now(),metadata jsonb);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
      create view vault.decrypted_secrets as select null::text name,null::text decrypted_secret,now() created_at where false;
      grant usage on schema public,auth,storage to anon,authenticated,service_role;grant execute on all functions in schema auth to public;
    `);
    await db.exec(fs.readFileSync('supabase/baseline/connect.sql','utf8'));
    const names = (await db.query("select tablename from pg_tables where schemaname='public'")).rows.map(r=>r.tablename);
    for (const name of ['profiles','messages','conversations','connect_invitation_codes','connect_music_presence','connect_call_journal_settings']) assert(names.includes(name),name);
    await db.exec(`insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','one@example.invalid'),('22222222-2222-4222-8222-222222222222','two@example.invalid'),('33333333-3333-4333-8333-333333333333','third@example.invalid');
      insert into conversations(id,user_a,user_b) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
      set role authenticated; select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);`);
    assert.equal((await db.query('select * from conversations')).rows.length,0);
    assert.equal((await db.query('select * from messages')).rows.length,0);
  } finally { await db.close(); }
});
