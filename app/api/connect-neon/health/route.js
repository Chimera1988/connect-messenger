import { getPool } from '../../../../lib/connect-neon-live-db.cjs';
import { json } from '../../../../lib/connect-neon-live-session.cjs';
export const runtime='nodejs';
export async function GET() {
  try {
    const {rows}=await getPool().query('SELECT count(*)::integer AS profiles FROM connect_backup.profiles');
    if (!rows.length) throw Error('No database response');
    return json({ok:true,backend:'neon-main',mode:'read-only'});
  } catch {return json({ok:false,backend:'neon-main'},503);}
}
