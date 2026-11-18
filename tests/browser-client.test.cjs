const test=require('node:test'),assert=require('node:assert/strict');
const loader=require('./helpers/load-ts.cjs');
test('browser features reuse one auth client and Request proxy preserves method, headers and body',async()=>{
 let clients=0,received;
 const mod=loader({'@supabase/supabase-js':{createClient:(_u,_k,options)=>{clients++;return {options};}}},
 {window:{location:{hostname:'connect-chat.duckdns.org',origin:'https://app.invalid'}},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public'}},
 fetch:async(input,init)=>{received=new Request(input,init);return new Response('{}');}})('lib/supabase-browser.ts');
 assert.equal(mod.browserSupabase(),mod.browserSupabase());assert.equal(clients,1);
 await mod.supabaseFetch(new Request('https://project.supabase.co/rest/v1/messages',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:'{"body":"example"}'}));
 assert.equal(received.url,'https://app.invalid/supabase/rest/v1/messages');assert.equal(received.method,'POST');assert.equal(received.headers.get('authorization'),'Bearer fixture');assert.equal(await received.text(),'{"body":"example"}');
});
test('call button sends explicit conversation identity even when two peers share a display name',()=>{
 let received;
 const {ConnectCallButton}=loader({}, {Event,CustomEvent,window:{dispatchEvent:event=>{received=event;return true;}}})('components/ConnectAudioCalls.tsx');
 const target={conversationId:'chat-b',peerId:'peer-b',peerName:'Same name'};
 ConnectCallButton({peerName:'Same name',target}).props.onClick();
 assert.equal(received.detail?.conversationId,'chat-b');assert.equal(received.detail?.peerId,'peer-b');
});
