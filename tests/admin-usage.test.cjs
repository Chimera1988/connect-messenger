'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('admin-only page is linked in PWA settings and not in Android',()=>{
 const source=require('./helpers/app-source.cjs')();
 assert.match(source,/type SettingsPage = [^\n]*'usage'/);
 assert.match(source,/id:'usage' as SettingsPage/);
 assert.match(source,/settingsPage==='usage' && admin && <ConnectAdminUsage/);
 assert.match(source,/import ConnectAdminUsage from '\.\.\/components\/ConnectAdminUsage'/);
});
test('usage API requires existing Supabase identity and explicit admin setting',()=>{
 const api=read('app/api/admin/usage/route.ts');
 assert.match(api,/await authenticatedUser\(request\)/);
 assert.match(api,/process\.env\.CONNECT_ADMIN_USER_ID/);
 assert.match(api,/user\.id!==adminId/);
 assert.match(api,/sessionIdFromVerifiedToken/);
 assert.match(api,/connect_admin_usage_snapshot/);
 assert.match(api,/headers:\{'Cache-Control':'no-store, private'/);
 assert.doesNotMatch(api,/CONNECT_NEON|connect-neon|process\.env\.NEXT_PUBLIC_SUPABASE_SERVICE/i);
});
test('server-only SQL function checks an active auth session and disallows public execute',()=>{
 const sql=read('sql/connect_admin_usage_snapshot.sql');
 assert.match(sql,/FROM auth\.sessions AS s/);
 assert.match(sql,/p_session_id/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.connect_admin_usage_snapshot\(uuid, uuid\) FROM PUBLIC, anon, authenticated/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.connect_admin_usage_snapshot\(uuid, uuid\) TO service_role/i);
 assert.match(sql,/pg_database_size\(current_database\(\)\)/);
 assert.match(sql,/FROM storage\.objects AS o/);
 assert.doesNotMatch(sql,/DELETE FROM storage|DROP TABLE|TRUNCATE TABLE/i);
});
test('responsive gauges are tied to real counters, never fake transfer totals',()=>{
 const comp=read('components/ConnectAdminUsage.tsx');
 const css=read('app/admin-usage.css');
 assert.match(comp,/setInterval\(refresh,60000\)/);
 assert.match(comp,/aria-valuenow=/);
 assert.match(comp,/storageBytes/);
 assert.match(comp,/databaseBytes/);
 assert.match(comp,/monthStoredBytes/);
 assert.match(comp,/egress\)/i);
 assert.match(comp,/value=\{null\} comparison=\{5\*GiB\}/);
 assert.match(comp,/Обновить/);
 assert.match(css,/\.connect-usage-track/);
 assert.match(css,/var\(--accent\)/);
});
