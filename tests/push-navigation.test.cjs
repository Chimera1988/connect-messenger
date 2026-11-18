const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./helpers/load-ts.cjs')();
const CHAT='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('notification navigation waits for auth and directory, checks owner and cannot open an arbitrary chat',()=>{
 const {navigationDecision}=load('lib/chat/navigation-intent.ts');const intent={conversationId:CHAT,userId:'a'};
 assert.equal(navigationDecision(intent,null,[],false),'wait');
 assert.equal(navigationDecision(intent,'a',[],false),'wait');
 assert.equal(navigationDecision(intent,'a',[CHAT],true),'open');
 assert.equal(navigationDecision(intent,'b',[CHAT],true),'reject');
 assert.equal(navigationDecision(intent,'a',[],true),'reject');
 assert.equal(navigationDecision({conversationId:'../admin',userId:'a'},'a',['../admin'],true),'reject');
});
