'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app/page.tsx'),'utf8');
function makeLogout(result){
  const begin=source.indexOf('  async function logout() {');
  const end=source.indexOf('\n  const keyboardOpen',begin);
  assert(begin>=0&&end>begin,'Logout body missing or moved');
  const events=[];
  const deps={
    supabase:{auth:{signOut:async options=>{events.push(['signOut',options]);return result;}}},
    busy:false,
    setBusy:v=>events.push(['busy',v]),
    fetch:async()=>({ok:true,status:200}),
    user:{id:'00000000-0000-0000-0000-000000000001'},
    wipeUserHistory:async()=>{events.push(['wipe']);},
    historyWarmStamps:{current:{}},
    inboxMediaWarm:{current:{clear(){}}},
    avatarCacheEpoch:{current:0},
    setAvatarUrls:()=>{},
    forgetUserChatPresentation:()=>{},
    warmedChatWindows:{current:{clear(){}}},
    signedMediaLifetimes:{current:{clear(){}}},
    exitChat:()=>events.push(['exitChat']),
    setProfiles:()=>{},
    setConversations:()=>{},
    setMessages:()=>{},
    setLatest:()=>{},
    setUnread:()=>{},
    readCache:{current:{}},
    setPassword:()=>{},
    setNotice:v=>events.push(['notice',v]),
    setUser:v=>events.push(['user',v]),
    setLoading:v=>events.push(['loading',v]),
    setSetup:v=>events.push(['setup',v]),
  };
  const logout=Function(...Object.keys(deps),source.slice(begin,end)+'\nreturn logout;')(...Object.values(deps));
  return {events,logout};
}
test('a successful local sign-out always switches to the login view',async()=>{
  const {events,logout}=makeLogout({error:null});
  await logout();
  assert.deepEqual(events.find(e=>e[0]==='signOut')?.[1],{scope:'local'},'Only this device must sign out');
  assert(events.some(e=>e[0]==='user'&&e[1]===null),'React auth state must be cleared explicitly');
  assert(events.some(e=>e[0]==='loading'&&e[1]===false),'Login screen must not remain behind a spinner');
  assert(events.some(e=>e[0]==='wipe'),'After success local cached chat data can be cleared');
});
test('failed sign-out preserves the current authenticated UI and history',async()=>{
  const {events,logout}=makeLogout({error:new Error('network unavailable')});
  await logout();
  assert(!events.some(e=>e[0]==='wipe'),'Never clear history before sign-out success');
  assert(!events.some(e=>e[0]==='user'&&e[1]===null),'Do not claim logged out on auth failure');
  assert(events.some(e=>e[0]==='notice'&&String(e[1]).includes('Не удалось выйти')),'Show a real error');
});
test('SIGNED_OUT auth event updates login UI before awaiting any native session bridge',()=>{
  const from=source.indexOf('supabase.auth.onAuthStateChange((event, session) =>');
  const to=source.indexOf('return () => { alive = false; subscription.unsubscribe(); };',from);
  assert(from>=0&&to>from,'Session listener not found');
  const body=source.slice(from,to);
  assert(/event === 'SIGNED_OUT'/.test(body),'SIGNED_OUT event must be handled explicitly');
  const beforeAwait=body.slice(0,body.indexOf('await window.__connectPrepareSession'));
  assert(beforeAwait.includes('setUser(null)'),'SIGNED_OUT should immediately enter login UI');
});
