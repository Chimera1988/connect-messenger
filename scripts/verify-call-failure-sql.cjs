const fs=require('node:fs');const {PGlite}=require(process.env.CONNECT_SQL_TEST_MODULE||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.connect_calls(id uuid primary key,conversation_id uuid not null,caller_id uuid not null,callee_id uuid not null,status text not null check(status in ('ringing','active','ended','declined','busy','missed','failed')),offer jsonb,answer jsonb,created_at timestamptz not null default now(),answered_at timestamptz,ended_at timestamptz);`);
 const sql=fs.readFileSync(require('node:path').join(__dirname,'../supabase/migrations/20261111000100_connect_fail_audio_call.sql'),'utf8');
 await db.exec(sql);await db.exec(sql);
 const result=await db.query(`select has_function_privilege('anon','public.connect_finish_owned_audio_call(uuid,text,text)','EXECUTE') anon,has_function_privilege('authenticated','public.connect_finish_owned_audio_call(uuid,text,text)','EXECUTE') authenticated,(select count(*)::int from public.connect_calls) persisted_rows,current_setting('plpgsql.check_asserts') asserts`);
 if(result.rows[0].anon||!result.rows[0].authenticated||result.rows[0].persisted_rows!==0||result.rows[0].asserts!=='on')throw Error('ACL/data isolation failed');
 console.log(JSON.stringify({engine:'PostgreSQL WASM/PGlite 0.3.14',exactMigrationExecuted:true,idempotent:true,transactionalSqlCases:12,checks:result.rows[0],productionMigrated:false,physicalCall:false},null,2));
 }finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
