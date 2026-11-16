const { createHash } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
function isUuid(value) { return typeof value === 'string' && UUID.test(value); }
function parseNeonSession(value) {
  if (typeof value !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value);
  return match && TOKEN.test(match[1]) ? match[1] : null;
}
function sessionHash(token) {
  if (!TOKEN.test(token || '')) throw new Error('Invalid session format');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
function parsePageLimit(input) {
  const n = Number(input);
  return input === null ? 100 : Number.isInteger(n) && n >= 1 && n <= 200 ? n : null;
}
function parseCursor(ts, id) {
  if (ts === null && id === null) return { timestamp: null, id: null };
  if (!isUuid(id) || typeof ts !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{1,6}Z$/.test(ts)) return null;
  const date = new Date(ts);
  if (!Number.isFinite(date.valueOf())) return null;
  return { timestamp: ts, id };
}
function parseEventCursor(input) {
  if (input === null) return '0';
  if (typeof input !== 'string' || !/^(0|[1-9][0-9]{0,18})$/.test(input)) return null;
  try { return BigInt(input) <= 9223372036854775807n ? input : null; }
  catch { return null; }
}
module.exports = { isUuid, parseNeonSession, sessionHash, parsePageLimit, parseCursor, parseEventCursor };
