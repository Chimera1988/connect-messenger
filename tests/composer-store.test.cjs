const test=require('node:test'),assert=require('node:assert/strict');
const load=require('./helpers/load-ts.cjs')();
test('drafts and selected files stay in their conversation and are cleared at the account boundary',()=>{
 const {ComposerStore}=load('lib/chat/composer-store.ts');const store=new ComposerStore();
 const file=new File(['private-a'],'a.txt');store.update('a','chat-a',{draft:'draft a',files:[file]});
 assert.equal(store.get('a','chat-b').draft,'');assert.equal(store.get('a','chat-b').files.length,0);
 assert.equal(store.get('b','chat-a').files.length,0);assert.equal(store.get('a','chat-a').draft,'draft a');
 store.clear();assert.equal(store.get('a','chat-a').files.length,0);assert.equal(store.get('a','chat-a').draft,'');
});
