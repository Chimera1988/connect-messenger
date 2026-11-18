'use strict';
const expected='tpwkmoxxzjfdsqsomhhr';
let url;try{url=new URL(process.env.CONNECT_DATABASE_URL||'');}catch{throw Error('CONNECT_DATABASE_URL is missing or invalid');}
const direct=url.hostname==='db.'+expected+'.supabase.co';
const pooler=url.hostname.endsWith('.pooler.supabase.com')&&decodeURIComponent(url.username)==='postgres.'+expected;
if(!['postgres:','postgresql:'].includes(url.protocol)||(!direct&&!pooler)||process.env.CONNECT_PROJECT_REF!==expected)throw Error('Database project does not match the reviewed Connect target');
if(!['require','verify-ca','verify-full'].includes(url.searchParams.get('sslmode')))throw Error('Database connection must explicitly require TLS');
console.log('Database target matches the reviewed project; TLS required.');
