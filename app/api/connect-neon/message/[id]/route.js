import { getPool } from '../../../../../lib/connect-neon-live-db.cjs';
import { isUuid } from '../../../../../lib/connect-neon-live-guards.cjs';
import { sessionUser,json } from '../../../../../lib/connect-neon-live-session.cjs';
import { allowMutation } from '../../../../../lib/connect-neon-mutation.cjs';
export const runtime='nodejs';
export async function PATCH(request,{params}){
 if(process.env.CONNECT_NEON_TEXT_WRITE_ENABLED!=='1')return json({error:'Neon text writes disabled'},503);
 if(!allowMutation(request))return json({error:'Origin refused'},403);
 try{
  const actor=await sessionUser(request);if(!actor)return json({error:'Unauthorized'},401);
  const {id}=await params;if(!isUuid(id))return json({error:'Invalid message'},400);
  const input=await request.json();if(typeof input?.body!=='string'||!input.body.trim()||input.body.length>10000)return json({error:'Invalid text'},400);
  const {rows}=await getPool().query('SELECT connect_backup.api_edit_text($1,$2,$3) AS message',[actor,id,input.body]);
  return json({message:rows[0].message});
 }catch(e){return json({error:e?.code==='42501'?'Not editable':'Neon unavailable'},e?.code==='42501'?403:503);}
}
export async function DELETE(request,{params}){
 if(process.env.CONNECT_NEON_TEXT_WRITE_ENABLED!=='1')return json({error:'Neon text writes disabled'},503);
 if(!allowMutation(request))return json({error:'Origin refused'},403);
 try{
  const actor=await sessionUser(request);if(!actor)return json({error:'Unauthorized'},401);
  const {id}=await params;if(!isUuid(id))return json({error:'Invalid message'},400);
  const {rows}=await getPool().query('SELECT connect_backup.api_delete_text($1,$2) AS result',[actor,id]);
  return json(rows[0].result);
 }catch(e){return json({error:e?.code==='42501'?'Not permitted':'Neon unavailable'},e?.code==='42501'?403:503);}
}
