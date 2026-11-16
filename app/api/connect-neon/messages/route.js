import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { isUuid,parsePageLimit,parseCursor } from '../../../../lib/connect-neon-live-guards.cjs';
import { sessionUser,json } from '../../../../lib/connect-neon-live-session.cjs';
import { allowMutation } from '../../../../lib/connect-neon-mutation.cjs';
export const runtime='nodejs';
export async function GET(request) {
 try {
  const userId=await sessionUser(request);
  if(!userId)return json({error:'Unauthorized'},401);
  const q=new URL(request.url).searchParams,conversationId=q.get('conversationId');
  const limit=parsePageLimit(q.get('limit')),cursor=parseCursor(q.get('beforeTimestamp'),q.get('beforeId'));
  if(!isUuid(conversationId)||limit===null||cursor===null)return json({error:'Invalid request'},400);
  const db=getPool();
  const {rows}=await db.query(`SELECT m.id,m.conversation_id,m.sender_id,m.body,m.created_at,m.edited_at,
   m.deleted_for_sender,m.reply_to,m.deleted_at,m.attachment_path,m.attachment_name,
   m.attachment_type,m.attachment_size,m.attachment_kind
   FROM connect_backup.messages m
   JOIN connect_backup.conversations c ON c.id=m.conversation_id
   LEFT JOIN connect_backup.message_tombstones t ON t.message_id=m.id
   WHERE m.conversation_id=$1 AND (c.user_a=$2 OR c.user_b=$2)
   AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h
       WHERE h.user_id=c.user_a AND h.admin_id<>$2::uuid
          OR h.user_id=c.user_b AND h.admin_id<>$2::uuid)
   AND m.deleted_at IS NULL AND t.message_id IS NULL
   AND NOT (m.deleted_for_sender=true AND m.sender_id=$2)
   AND ($3::timestamptz IS NULL OR (m.created_at,m.id)<($3::timestamptz,$4::uuid))
   ORDER BY m.created_at DESC,m.id DESC LIMIT $5`,
   [conversationId,userId,cursor.timestamp,cursor.id,limit]);
  const {rows:deleted}=await db.query(`SELECT t.message_id FROM connect_backup.message_tombstones t
   JOIN connect_backup.conversations c ON c.id=t.conversation_id
   WHERE t.conversation_id=$1 AND (c.user_a=$2 OR c.user_b=$2)
   AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE
       (h.user_id=c.user_a AND h.admin_id<>$2::uuid) OR
       (h.user_id=c.user_b AND h.admin_id<>$2::uuid))
   ORDER BY t.deleted_at DESC LIMIT 5000`,[conversationId,userId]);
  const messages=rows.map(({created_at,...m})=>({...m,created_at:created_at.toISOString()}));
  const last=messages.at(-1);
  return json({messages,deletedIds:deleted.map(x=>x.message_id),
   nextCursor:messages.length===limit&&last?{beforeTimestamp:last.created_at,beforeId:last.id}:null});
 }catch{return json({error:'Neon read unavailable'},503);}
}
export async function POST(request) {
 if(process.env.CONNECT_NEON_TEXT_WRITE_ENABLED!=='1')return json({error:'Neon text writes disabled'},503);
 if(!allowMutation(request))return json({error:'Origin refused'},403);
 try {
  const userId=await sessionUser(request);
  if(!userId)return json({error:'Unauthorized'},401);
  const data=await request.json();
  if(!data||!isUuid(data.conversationId)||!isUuid(data.messageId)||typeof data.body!=='string'||
     data.body.trim().length<1||data.body.length>10000||
     (data.replyTo!==null && data.replyTo!==undefined && !isUuid(data.replyTo)))return json({error:'Invalid message'},400);
  const {rows}=await getPool().query('SELECT connect_backup.api_send_text($1,$2,$3,$4,$5) AS message',
    [userId,data.conversationId,data.messageId,data.body,data.replyTo||null]);
  return json({message:rows[0].message},201);
 }catch(e){
   const code=e?.code;
   if(code==='42501')return json({error:'Conversation not permitted'},403);
   if(code==='23505')return json({error:'Message id is already used'},409);
   if(code==='22023')return json({error:'Invalid message'},400);
   return json({error:'Neon write unavailable'},503);
 }
}
