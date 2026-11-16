// Connect text continuity: server validates the independent Neon session.
// An existing Supabase login is used only to bootstrap/renew that session.
type NeonJson = Record<string, any>;
export type NeonCall = {ok:boolean;status:number;data:NeonJson|null};
async function boundedFetch(url:string,init:RequestInit={},ms=6500):Promise<Response>{
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
 try{return await fetch(url,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal});}
 finally{clearTimeout(timer);}
}
export async function connectNeonRequest(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,
 body?:Record<string,unknown>,getSupabaseToken?:()=>Promise<string|undefined>):Promise<NeonCall>{
 const call=async()=>{
  const init:RequestInit={method};
  if(body){init.body=JSON.stringify(body);init.headers={'Content-Type':'application/json'};}
  return boundedFetch(url,init);
 };
 try{
  let response=await call();
  if(response.status===401 && getSupabaseToken){
   const token=await getSupabaseToken().catch(()=>undefined);
   if(token){
    const boot=await boundedFetch('/api/connect-neon/session',{method:'POST',headers:{Authorization:'Bearer '+token}},6500);
    if(boot.ok)response=await call();
   }
  }
  const data=await response.json().catch(()=>null) as NeonJson|null;
  return {ok:response.ok,status:response.status,data};
 }catch{return {ok:false,status:0,data:null};}
}
