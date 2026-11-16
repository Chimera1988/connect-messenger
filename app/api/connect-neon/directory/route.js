import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { sessionUser,json } from '../../../../lib/connect-neon-live-session.cjs';
export const runtime='nodejs';
export async function GET(request){
 try{
  const actor=await sessionUser(request);if(!actor)return json({error:'Unauthorized'},401);
  const db=getPool();
  const [ps,cs]=await Promise.all([
   db.query(`SELECT p.id,p.display_name,p.is_blocked,p.bio,p.avatar_path,p.last_seen_at,p.online_until
    FROM connect_backup.profiles p
    WHERE (p.id=$1 OR p.is_blocked=false)
    AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE h.user_id=p.id AND h.admin_id<>$1::uuid)
    ORDER BY p.created_at LIMIT 500`,[actor]),
   db.query(`SELECT c.id,c.user_a,c.user_b,c.created_at FROM connect_backup.conversations c
    WHERE (c.user_a=$1 OR c.user_b=$1)
    AND NOT EXISTS(SELECT 1 FROM connect_backup.hidden_members h WHERE
      (h.user_id=c.user_a AND h.admin_id<>$1::uuid) OR (h.user_id=c.user_b AND h.admin_id<>$1::uuid))
    ORDER BY c.created_at DESC LIMIT 500`,[actor])]);
  return json({profiles:ps.rows,conversations:cs.rows});
 }catch{return json({error:'Neon directory unavailable'},503);}
}
