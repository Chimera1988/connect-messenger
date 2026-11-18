import type { SupabaseClient } from '@supabase/supabase-js';

export function setPushSession(userId:string|null):void {
  if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;
  const message={type:'CONNECT_SESSION',userId:userId||''};
  if(navigator.serviceWorker.controller)navigator.serviceWorker.controller.postMessage(message);
  else void navigator.serviceWorker.ready.then(reg=>reg.active?.postMessage(message)).catch(()=>{});
}

/** Remove this installation, leaving the account's other phones untouched.
 * Offline logout still locks Worker identity immediately. Session-bound server
 * registrations also disappear when the corresponding auth session is revoked.
 */
export async function retireCurrentPush(client:SupabaseClient,userId:string):Promise<void> {
  if(typeof navigator==='undefined'||navigator.onLine===false||!('serviceWorker' in navigator))return;
  const controller=new AbortController();
  const task=(async()=>{
    const [{data:{session}},registration]=await Promise.all([client.auth.getSession(),navigator.serviceWorker.getRegistration()]);
    if(session?.user.id!==userId||controller.signal.aborted)return;
    const subscription=await registration?.pushManager.getSubscription();
    if(!subscription||controller.signal.aborted)return;
    await fetch('/api/push/register',{method:'DELETE',cache:'no-store',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
      body:JSON.stringify({endpoint:subscription.endpoint})});
  })().catch(()=>{});
  let timer:ReturnType<typeof setTimeout>|undefined;
  try {await Promise.race([task,new Promise<void>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve();},1800);})]);}
  finally {if(timer)clearTimeout(timer);controller.abort();}
}
