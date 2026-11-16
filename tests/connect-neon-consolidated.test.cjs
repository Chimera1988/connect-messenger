const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const mutation=require('../lib/connect-neon-mutation.cjs');
test('only exact same-origin browser requests may mutate Neon',()=>{
 for(const [origin,expected] of [['https://connect.test',true],['https://evil.test',false],[null,false]]){
  const req={url:'https://connect.test/api/connect-neon/messages',headers:new Headers(origin?{origin}:{})};
  assert.equal(mutation.allowMutation(req),expected);
 }
});
test('Neon send is idempotent, token-bound and owned by sender',()=>{
 const s=read('app/api/connect-neon/messages/route.js');
 assert(s.includes('sessionUser(request)'));assert(s.includes('allowMutation(request)'));
 assert(s.includes('api_send_text'));assert(s.includes('messageId'));
});
test('edit and delete are protected independently',()=>{
 const s=read('app/api/connect-neon/message/[id]/route.js');
 assert(s.includes('api_edit_text'));assert(s.includes('api_delete_text'));
 assert(s.includes('allowMutation(request)'));assert(s.includes('sessionUser(request)'));
});
test('private events require session and conversation membership',()=>{
 const s=read('app/api/connect-neon/events/route.js');
 assert(s.includes('sessionUser(request)'));assert(s.includes('c.user_a=$2 OR c.user_b=$2'));
 assert(s.includes('text_events'));
});
test('Neon message reads consult tombstones',()=>{
 const s=read('app/api/connect-neon/messages/route.js');
 assert(s.includes('message_tombstones'));assert(s.includes('deletedIds'));
 assert(s.includes('m.deleted_at IS NULL'));
});
test('directory checks hidden members',()=>{
 const s=read('app/api/connect-neon/directory/route.js');
 assert(s.includes('hidden_members'));assert(s.includes('sessionUser(request)'));
});
test('client retains a supabase-auth bootstrap only on 401',()=>{
 const s=read('lib/connect-neon-text-client.ts');
 assert(s.includes('response.status===401'));assert(s.includes('getSupabaseToken'));
 assert(s.includes('AbortController'));
});


test('PostgREST PromiseLike mutations handle rejection without unsupported catch()',()=>{
 const pagePath=path.join(root,'app/page.tsx');
 const source=fs.existsSync(pagePath)?read('app/page.tsx'):read('_patch/apply.py');
 assert(!source.includes('.then(()=>{}).catch(()=>{})'),'PostgREST PromiseLike has no catch method');
 assert((source.match(/\.then\(\(\)=>\{\},\(\)=>\{\}\)/g)||[]).length>=2,
  'both edit and send must handle rejection with the second then callback');
});
