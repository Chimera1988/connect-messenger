const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const sw=readFileSync('public/sw.js','utf8');
const src=sw.split('// CONNECT_PWA_HOME_ICON_BADGE_V1')[1]?.split('function markers(){')[0];
assert.ok(src,'missing badge state in service worker');
const ctx=vm.createContext({self:{navigator:{}},indexedDB:{},Promise,Date,Number,Math,Object,console});
vm.runInContext(src,ctx);
vm.runInContext('badgeChange=(_user,edit)=>{edit(state);return Promise.resolve();};let state=badgeEmpty();',ctx);
const time=(v)=>`2026-11-13T00:00:${String(v).padStart(2,'0')}Z`;
const chat='11111111-1111-4111-8111-111111111111';
const invoke=async expression=>await vm.runInContext(expression,ctx);

test('snapshots replace approximate push totals, duplicate pushes never inflate them',async()=>{
 await invoke(`badgeSnapshot({userId:'u',chats:{'${chat}':2},latest:{'${chat}':'${time(2)}'},missed:1,callsLatest:'${time(1)}'})`);
 assert.equal(await invoke('badgeCount(state)'),3);
 const event=`{userId:'u',kind:'message',conversationId:'${chat}',messageId:'m3',createdAt:'${time(3)}'}`;
 await invoke(`badgeEvent(${event},'message')`);
 await invoke(`badgeEvent(${event},'message')`);
 assert.equal(await invoke('badgeCount(state)'),4);
 await invoke(`badgeEvent({userId:'u',conversationId:'${chat}',messageId:'old',createdAt:'${time(1)}'},'message')`);
 assert.equal(await invoke('badgeCount(state)'),4);
});

test('read and calls viewed clear only their respective events',async()=>{
 await invoke(`badgeSnapshot({userId:'u',chats:{'${chat}':2},latest:{'${chat}':'${time(2)}'},missed:1,callsLatest:'${time(1)}'})`);
 await invoke(`badgeEvent({userId:'u',conversationId:'${chat}',messageId:'m3',createdAt:'${time(3)}'},'message')`);
 await invoke(`badgeRead('u','${chat}','${time(3)}')`);
 assert.equal(await invoke('badgeCount(state)'),1);
 await invoke(`badgeEvent({userId:'u',callId:'c1',endedAt:'${time(5)}'},'call')`);
 await invoke(`badgeEvent({userId:'u',callId:'c1',endedAt:'${time(5)}'},'call')`);
 assert.equal(await invoke('badgeCount(state)'),2);
 await invoke(`badgeCallsViewed('u','${time(6)}')`);
 assert.equal(await invoke('badgeCount(state)'),0);
});
