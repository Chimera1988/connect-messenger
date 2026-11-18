const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./helpers/load-ts.cjs')();
test('late work belongs to the original account and chat, including switching away and back',()=>{
 const {SessionScope}=load('lib/session-scope.ts');const scope=new SessionScope();
 scope.setUser('a');scope.setChat('chat-a');const ticket=scope.capture('chat-a');assert.equal(scope.current(ticket),true);
 scope.setChat('chat-b');assert.equal(scope.current(ticket),false);scope.setChat('chat-a');assert.equal(scope.current(ticket),false);
 const fresh=scope.capture('chat-a');scope.setUser('b');scope.setChat('chat-a');assert.equal(scope.current(fresh),false);
});
test('session resources are disposed on logout once, failures do not stop other cleanup',()=>{
 const {SessionScope}=load('lib/session-scope.ts');const scope=new SessionScope();let stopped=0;
 scope.setUser('a');scope.onReset(()=>{throw Error('one cleanup failed');});scope.onReset(()=>stopped++);
 scope.setUser('a');assert.equal(stopped,0);scope.setUser(null);assert.equal(stopped,1);scope.setUser(null);assert.equal(stopped,1);
});
