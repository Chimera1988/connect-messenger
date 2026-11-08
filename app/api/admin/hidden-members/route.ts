import { authenticatedUser, fail } from '../../../../lib/server/admin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

async function adminOnly(request:Request){
  const {client,user}=await authenticatedUser(request);
  if(!process.env.CONNECT_ADMIN_USER_ID||process.env.CONNECT_ADMIN_USER_ID!==user.id)
    throw new Error('Доступно только администратору');
  return {client,user};
}

export async function GET(request:Request){
  try{
    const {client,user}=await adminOnly(request);
    const [{data:profiles,error:profileError},{data:hidden,error:hiddenError}]=await Promise.all([
      client.from('profiles').select('id,display_name,is_blocked').neq('id',user.id).eq('is_blocked',false).order('display_name'),
      client.from('connect_hidden_members').select('user_id'),
    ]);
    if(profileError||hiddenError)throw profileError||hiddenError;
    const hiddenIds=new Set((hidden||[]).map(x=>x.user_id));
    return Response.json({members:(profiles||[]).map(p=>({id:p.id,display_name:p.display_name,is_hidden:hiddenIds.has(p.id)}))},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return fail(e)}
}

export async function POST(request:Request){
  try{
    const {client,user}=await adminOnly(request);
    const body=await request.json();
    const id=body?.user_id;
    const hidden=body?.hidden;
    if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||id===user.id||typeof hidden!=='boolean')
      throw new Error('Неверные параметры');
    const {data:profile,error:profileError}=await client.from('profiles').select('id,is_blocked').eq('id',id).maybeSingle();
    if(profileError||!profile||profile.is_blocked)throw new Error('Участник не найден');
    if(hidden){
      const {error}=await client.from('connect_hidden_members').upsert({user_id:id,admin_id:user.id},{onConflict:'user_id'});
      if(error)throw error;
    }else{
      const {error}=await client.from('connect_hidden_members').delete().eq('user_id',id).eq('admin_id',user.id);
      if(error)throw error;
    }
    return Response.json({ok:true});
  }catch(e){return fail(e)}
}
