const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const guard=require('../lib/connect-neon-live-guards.cjs');
const cookie=require('../lib/connect-neon-live-cookie.cjs');
const avatars=require('../lib/connect-neon-live-avatars.cjs');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('production session strictly validates bearer tokens',()=>{
 assert.equal(guard.parseNeonSession('Bearer '+ 'a'.repeat(43)),'a'.repeat(43));
 assert.equal(guard.parseNeonSession('Bearer anything'),null);
 assert.equal(guard.parseNeonSession('Bearer '+ 'a'.repeat(43)+' another'),null);
 assert.equal(guard.sessionHash('a'.repeat(43)).length,64);
});
test('cursor and page size limits enforced',()=>{
 assert.equal(guard.parsePageLimit('201'),null);
 assert.equal(guard.parsePageLimit('0'),null);
 assert.equal(guard.parsePageLimit(null),100);
 assert.equal(guard.parseCursor('junk','not-uuid'),null);
});
test('session cookie is secure',()=>{
 const s=cookie.sessionCookie('a'.repeat(43));
 for(const v of ['HttpOnly','Secure','SameSite=Strict','Max-Age=604800'])assert(s.includes(v));
 assert(s.includes('__Secure-connect_neon_live_session'));
 assert.equal(cookie.parseSessionCookie('other=abc'),null);
});
test('only correctly shaped avatar metadata accepted',()=>{
 const id='79f2cc8d-21e0-41a4-9f9c-3037ab8e5ad1';
 const row={object_key:id+'/avatar-1794565337005.jpg',content_type:'image/jpeg',byte_size:2500,sha256:'a'.repeat(64)};
 assert(avatars.isValidAvatarMetadata(row,id));
 assert(!avatars.isValidAvatarMetadata({...row,object_key:'../evil.jpg'},id));
 assert(!avatars.isValidAvatarMetadata({...row,byte_size:2097153},id));
});
test('messages API reads safely and writes through an authorized Neon function',()=>{
 const source=read('app/api/connect-neon/messages/route.js');
 assert(source.includes('c.user_a=$2 OR c.user_b=$2'));
 assert(source.includes('message_tombstones'));
 assert(/export async function POST/.test(source));
 assert(source.includes('m.deleted_at IS NULL'));
});
test('production credentials are server-only and limited',()=>{
 const db=read('lib/connect-neon-live-db.cjs');
 const av=read('app/api/connect-neon/avatar/[userId]/route.js');
 assert(db.includes('CONNECT_NEON_READ_DATABASE_URL'));
 assert(db.includes('CONNECT_NEON_READ_ONLY'));
 assert(!db.includes('NEON_STAGE_DATABASE_URL'));
 assert(av.includes('CONNECT_NEON_S3_SECRET_ACCESS_KEY'));
 assert(!av.includes('NEON_STAGE_S3_SECRET_ACCESS_KEY'));
});
test('Neon shadow does not change critical Supabase paths',()=>{
 const f=path.join(root,'app/page.tsx');
 if(fs.existsSync(f)){
   const page=read('app/page.tsx');
   assert(page.includes('Neon production shadow session'));
   assert(page.includes("supabase.from('messages')"));
   assert(page.includes("supabase.channel('connect-chat-'"));
 }else{
   assert(read('_patch/supabase-session-hook.txt').includes('Neon production shadow session'));
   assert(read('_patch/chat-shadow-hook.txt').includes('nonblocking shadow'));
 }
});

test('live Neon cookie scope is correct and logout script revokes it',()=>{
 assert(cookie.sessionCookie('a'.repeat(43)).includes('Path=/api/connect-neon'));
 const pageFile=path.join(root,'app/page.tsx');
 if(fs.existsSync(pageFile)) assert(read('app/page.tsx').includes("method:'DELETE',credentials:'same-origin'"));
 else assert(read('_patch/logout-inject.txt').includes("method:'DELETE'"));
});
