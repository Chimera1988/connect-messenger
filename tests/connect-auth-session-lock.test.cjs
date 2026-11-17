const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('cached session cannot unlock Connect without server-side verification',()=>{
 const page=read('app/page.tsx');
 assert.match(page,/CONNECT_PWA_AUTH_FAIL_CLOSED_20261117/);
 assert.match(page,/fetch\('\/api\/auth\/verify'/);
 assert.match(page,/response\.status === 401 \|\| response\.status === 403/);
 assert.match(page,/authGate!=='verified'/);
 assert.match(page,/setUser\(null\);setAuthGate\('offline'\)/);
 assert.match(page,/document\.addEventListener\('visibilitychange',onReturn\)/);
 assert.match(page,/window\.addEventListener\('online',onReturn\)/);
 assert.match(page,/window\.addEventListener\('offline',onOffline\)/);
});

test('local logout locks the private UI even when Supabase says session missing',()=>{
 const page=read('app/page.tsx');
 const logout=page.split('  async function logout() {')[1].split('\n  const keyboardOpen')[0];
 assert.match(logout,/setAuthGate\('denied'\);setUser\(null\)/);
 assert.match(logout,/error\.name!=='AuthSessionMissingError'/);
 assert.match(logout,/clearStoredConnectAuth\(\)/);
 assert.match(logout,/authSequence\.current/);
 assert.doesNotMatch(logout,/setNotice\('Не удалось выйти:/);
});

test('verification endpoint checks real identity, profile, and active session',()=>{
 const route=read('app/api/auth/verify/route.ts');
 assert.match(route,/client\.auth\.getUser\(auth\[1\]\)/);
 assert.match(route,/sessionIdFromAuthenticatedToken\(auth\[1\],user\.id\)/);
 assert.match(route,/client\.rpc\('connect_auth_session_active'/);
 assert.match(route,/valid!==true/);
 assert.match(route,/no-store, private/);
 assert.doesNotMatch(route,/NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
});

test('server-side database function checks Supabase auth.sessions and is not public',()=>{
 const sql=read('sql/connect_auth_session_active.sql');
 assert.match(sql,/auth\.sessions/);
 assert.match(sql,/s\.user_id=p_user_id AND s\.id=p_session_id/);
 assert.match(sql,/REVOKE ALL.*PUBLIC, anon, authenticated/);
 assert.match(sql,/GRANT EXECUTE.*service_role/);
 assert.doesNotMatch(sql,/DROP |DELETE FROM |TRUNCATE /);
});

test('modals outside the main screen cannot show media, message actions or contacts without verified auth',()=>{
 const page=read('app/page.tsx');
 for(const exposed of ['crop && <AvatarCropper','forwardIds.length>0&&<div','videoNoteOpen && <VideoNoteRecorder','mediaViewer && <ConnectGalleryViewer','menuMessage && <div']){
  assert(page.includes("authGate==='verified' && user && "+exposed),exposed);
 }
});
