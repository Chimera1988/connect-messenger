'use strict';
const { getPool } = require('./connect-neon-live-db.cjs');
const { parseNeonSession, sessionHash } = require('./connect-neon-live-guards.cjs');
const { parseSessionCookie } = require('./connect-neon-live-cookie.cjs');
async function sessionUser(request) {
  const bearer = parseNeonSession(request.headers.get('authorization'));
  const cookie = parseSessionCookie(request.headers.get('cookie'));
  const token = bearer || cookie;
  if (!token) return null;
  const { rows } = await getPool().query(
    `SELECT s.user_id FROM connect_backup.client_sessions s
     JOIN connect_backup.profiles p ON p.id=s.user_id
     WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()
       AND p.is_blocked=false`,
    [sessionHash(token)]);
  return rows.length === 1 ? rows[0].user_id : null;
}
function json(body,status=200) {
  return Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
module.exports={sessionUser,json};
