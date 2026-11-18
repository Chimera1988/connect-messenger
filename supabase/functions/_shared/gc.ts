import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.57.0';
/** DB retirement commits before Storage removal. Reference triggers use the same
 * path lock, so no new reference can enter the check/remove gap. */
export async function collectObject(db:SupabaseClient,bucket:string,path:string,worker:string):Promise<boolean>{
 const base=path.replace(/__(thumb\.webp|poster\.jpg)$/,'');
 const claim=await db.rpc('connect_gc_prepare',{p_bucket:bucket,p_path:base,p_worker:worker});
 if(claim.error)throw claim.error;if(claim.data!==true)return false;
 const paths=bucket==='connect-attachments'?[base,base+'__thumb.webp',base+'__poster.jpg']:[base];
 const removed=await db.storage.from(bucket).remove(paths);if(removed.error)throw removed.error;
 const ack=await db.rpc('connect_gc_ack',{p_bucket:bucket,p_path:base,p_worker:worker});
 if(ack.error)throw ack.error;if(ack.data!==true)throw Error('GC lease changed before acknowledgement');return true;
}
