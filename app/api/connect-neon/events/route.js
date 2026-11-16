import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { isUuid,parseEventCursor } from '../../../../lib/connect-neon-live-guards.cjs';
import { sessionUser,json } from '../../../../lib/connect-neon-live-session.cjs';
export const runtime='nodejs';
export async function GET(request){
 try{
  const user=await sessionUser(request);if(!user)return json({error:'Unauthorized'},401);
  const q=new URL(request.url).searchParams,conv=q.get('conversationId'),after=parseEventCursor(q.get('after'));
  if(!isUuid(conv)||after===null)return json({error:'Invalid cursor'},400);
  const {rows}=await getPool().query(`SELECT e.id::text AS id,e.message_id,e.event_kind
   FROM connect_backup.text_events e JOIN connect_backup.conversations c ON c.id=e.conversation_id
   WHERE e.conversation_id=$1 AND (c.user_a=$2 OR c.user_b=$2) AND e.id>$3::bigint
   AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE
       (h.user_id=c.user_a AND h.admin_id<>$2::uuid) OR (h.user_id=c.user_b AND h.admin_id<>$2::uuid))
   ORDER BY e.id ASC LIMIT 200`,[conv,user,after]);
  return json({events:rows,nextCursor:rows.length?rows.at(-1).id:after,hasMore:rows.length===200});
 }catch{return json({error:'Neon events unavailable'},503);}
}
