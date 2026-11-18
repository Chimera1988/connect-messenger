const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
module.exports=async function database(){
 const db=new PGlite();
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
 return db;
};
