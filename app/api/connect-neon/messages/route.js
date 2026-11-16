import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { isUuid,parsePageLimit,parseCursor } from '../../../../lib/connect-neon-live-guards.cjs';
import { sessionUser,json } from '../../../../lib/connect-neon-live-session.cjs';
export const runtime='nodejs';
export async function GET(request) {
  try {
    const userId=await sessionUser(request);
    if (!userId) return json({error:'Unauthorized'},401);
    const q=new URL(request.url).searchParams;
    const conversationId=q.get('conversationId');
    const limit=parsePageLimit(q.get('limit'));
    const cursor=parseCursor(q.get('beforeTimestamp'),q.get('beforeId'));
    if(!isUuid(conversationId)||limit===null||cursor===null)return json({error:'Invalid request'},400);
    const {rows}=await getPool().query(`
      SELECT m.id,m.conversation_id,m.sender_id,m.body,m.created_at,m.edited_at,
      m.deleted_for_sender,m.reply_to,m.deleted_at,m.attachment_path,m.attachment_name,
      m.attachment_type,m.attachment_size,m.attachment_kind
      FROM connect_backup.messages m
      JOIN connect_backup.conversations c ON c.id=m.conversation_id
      LEFT JOIN connect_backup.message_tombstones t ON t.message_id=m.id
      WHERE m.conversation_id=$1 AND (c.user_a=$2 OR c.user_b=$2)
        AND m.deleted_at IS NULL AND t.message_id IS NULL
        AND NOT (m.deleted_for_sender=true AND m.sender_id=$2)
        AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::uuid))
      ORDER BY m.created_at DESC,m.id DESC LIMIT $5`,
      [conversationId,userId,cursor.timestamp,cursor.id,limit]);
    const messages=rows.map(({created_at,...rest})=>({...rest,created_at:created_at.toISOString()}));
    const last=messages.at(-1);
    return json({messages,nextCursor:messages.length===limit && last ? {beforeTimestamp:last.created_at,beforeId:last.id} : null});
  } catch {return json({error:'Neon read unavailable'},503);}
}
// No POST handler until old APKs are compatible with Neon-authoritative writes.
