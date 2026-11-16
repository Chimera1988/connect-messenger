'use strict';
const SESSION_NAME='__Secure-connect_neon_live_session';
const TOKEN=/^[a-zA-Z0-9_-]{43}$/;
function parseSessionCookie(raw) {
  if(typeof raw!=='string'||raw.length>8192)return null;
  const values=raw.split(';').map(x=>x.trim()).filter(x=>x.startsWith(SESSION_NAME+'=')).map(x=>x.slice(SESSION_NAME.length+1));
  return values.length===1&&TOKEN.test(values[0])?values[0]:null;
}
function sessionCookie(token) {
  if(!TOKEN.test(token||''))throw new TypeError('Invalid token');
  return `${SESSION_NAME}=${token}; Max-Age=604800; Path=/api/connect-neon; HttpOnly; Secure; SameSite=Strict`;
}
function clearedSessionCookie() { return `${SESSION_NAME}=; Max-Age=0; Path=/api/connect-neon; HttpOnly; Secure; SameSite=Strict`; }
module.exports={parseSessionCookie,sessionCookie,clearedSessionCookie};
