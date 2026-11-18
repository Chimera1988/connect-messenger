import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.57.0';
/** getUser verifies the JWT before reading its session claim. */
export async function liveIdentity(db:SupabaseClient,token:string){
 const result=await db.auth.getUser(token);if(result.error){if(!result.error.status||result.error.status===429||result.error.status>=500)throw Error('Authorization unavailable');return null;}if(!result.data.user)return null;
 let sid:string;try{const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));sid=claims.session_id;}catch{return null;}
 if(typeof sid!=='string'||!(/^[0-9a-f-]{36}$/i).test(sid))return null;
 const user=result.data.user;
 const [session,profile]=await Promise.all([db.rpc('connect_auth_session_active',{p_user_id:user.id,p_session_id:sid}),db.from('profiles').select('is_blocked').eq('id',user.id).maybeSingle()]);
 if(session.error||profile.error)throw Error('Identity verification unavailable');
 return session.data===true&&profile.data&&!profile.data.is_blocked?user:null;
}
