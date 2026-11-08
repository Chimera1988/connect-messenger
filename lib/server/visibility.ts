import type { SupabaseClient } from '@supabase/supabase-js';

/** Fail closed for any server-side service-role notification. */
export async function canReach(client:SupabaseClient,a:string,b:string):Promise<boolean>{
  if(!a||!b)return false;
  if(a===b)return true;
  const {data,error}=await client.from('connect_hidden_members').select('user_id,admin_id').in('user_id',[a,b]);
  if(error)return false;
  const hidden=new Map((data||[]).map(x=>[x.user_id,x.admin_id]));
  return (!hidden.has(a)||hidden.get(a)===b)&&(!hidden.has(b)||hidden.get(b)===a);
}
