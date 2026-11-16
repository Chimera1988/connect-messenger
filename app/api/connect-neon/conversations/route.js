import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { sessionUser,json } from '../../../../lib/connect-neon-live-session.cjs';
export const runtime='nodejs';
export async function GET(request) {
  try {
    const userId=await sessionUser(request);
    if(!userId) return json({error:'Unauthorized'},401);
    const {rows}=await getPool().query(`
       SELECT c.id,c.user_a,c.user_b,c.created_at,peer.id AS peer_id,peer.display_name AS peer_name,
              (a.user_id IS NOT NULL) AS peer_has_avatar
       FROM connect_backup.conversations c
       JOIN connect_backup.profiles peer
         ON peer.id=CASE WHEN c.user_a=$1::uuid THEN c.user_b ELSE c.user_a END
       LEFT JOIN connect_backup.avatars a
         ON a.user_id=peer.id AND a.object_key=peer.avatar_path
       WHERE (c.user_a=$1::uuid OR c.user_b=$1::uuid)
         AND NOT EXISTS (
           SELECT 1 FROM connect_backup.hidden_members h
           WHERE h.user_id=peer.id AND h.admin_id<>$1::uuid
         )
       ORDER BY c.created_at DESC,c.id DESC LIMIT 200`,[userId]);
    return json({conversations:rows.map(row=>({...row,created_at:row.created_at.toISOString()}))});
  }catch{return json({error:'Neon chat list unavailable'},503);}
}
