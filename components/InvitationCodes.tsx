'use client';

import { useEffect,useRef,useState } from 'react';
import { sessionScope } from '../lib/session-scope';
import { useConnectSession } from './ConnectSessionProvider';

type Invite = { id:string;email:string;created_at:string;expires_at:string;redeemed_at:string|null;revoked_at:string|null;invite_type:'normal'|'hidden' };
const panel:React.CSSProperties={position:'fixed',inset:0,zIndex:99999,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:16};
const card:React.CSSProperties={width:'100%',maxWidth:420,maxHeight:'85vh',overflowY:'auto',background:'#171c27',color:'#fff',borderRadius:18,padding:22,boxShadow:'0 12px 60px #0009'};
const field:React.CSSProperties={display:'block',width:'100%',padding:13,borderRadius:10,background:'#262d3a',color:'#fff',border:'1px solid #454b59',fontSize:16,boxSizing:'border-box',margin:'12px 0'};
const btn:React.CSSProperties={padding:'11px 15px',borderRadius:10,background:'#526bfa',border:0,color:'#fff',fontWeight:600,cursor:'pointer'};
export default function InvitationCodes(){
 const {user,admin,setAdmin,client}=useConnectSession();const signed=!!user;
 const [open,setOpen]=useState(false),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[code,setCode]=useState(''),[issued,setIssued]=useState(''),[invites,setInvites]=useState<Invite[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[mode,setMode]=useState<'normal'|'hidden'>('normal');
 const epoch=useRef(0);
 function resetPanel(){epoch.current++;setOpen(false);setEmail('');setPassword('');setConfirm('');setCode('');setIssued('');setInvites([]);setError('');setBusy(false);}
 const current=(stamp:number)=>stamp===epoch.current;
 useEffect(()=>{resetPanel();return sessionScope.onReset(resetPanel);},[user?.id,admin]);
 useEffect(()=>{
  const show=(kind:'normal'|'hidden')=>{if(!user||!admin)return;const stamp=epoch.current;setMode(kind);setIssued('');setOpen(true);setError('');void load(stamp).catch(e=>{if(current(stamp))setError(e instanceof Error?e.message:String(e));});};
  const normal=()=>show('normal'),hidden=()=>show('hidden');
  window.addEventListener('connect:open-invitations',normal);window.addEventListener('connect:open-hidden-invitations',hidden);
  return()=>{window.removeEventListener('connect:open-invitations',normal);window.removeEventListener('connect:open-hidden-invitations',hidden);};
 },[user?.id,admin]);
 useEffect(()=>{const register=()=>{if(!signed){setOpen(true);setError('');}};window.addEventListener('connect:open-registration-invite',register);return()=>window.removeEventListener('connect:open-registration-invite',register);},[signed]);
 async function request(path:string,method:string,body?:object){
  const privateRequest=path!=='/api/invite/redeem',ticket=sessionScope.capture();let token='';
  if(privateRequest){if(!client||!user||!admin||ticket.userId!==user.id)throw Error('Сессия завершена');const {data:{session}}=await client.auth.getSession();if(session?.user.id!==user.id||!sessionScope.current(ticket))throw Error('Сессия завершена');token=session.access_token;}
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json();if(privateRequest&&!sessionScope.current(ticket))throw Error('Сессия завершена');
  if(!response.ok){if(privateRequest&&(response.status===401||response.status===403)){setAdmin(false);resetPanel();}throw Error(data.error||'Ошибка запроса');}return data;
 }
 async function load(stamp=epoch.current){const data=await request('/api/admin/invite','GET');if(current(stamp))setInvites(data.invitations||[]);}
 async function create(){const stamp=epoch.current;setBusy(true);setError('');try{const data=await request('/api/admin/invite','POST',{email,invite_type:mode});if(!current(stamp))return;setIssued(data.code);await load(stamp);}catch(e){if(current(stamp))setError(e instanceof Error?e.message:String(e));}finally{if(current(stamp))setBusy(false);}}
 async function revoke(id:string){const stamp=epoch.current;setBusy(true);setError('');try{await request('/api/admin/invite','DELETE',{id});await load(stamp);}catch(e){if(current(stamp))setError(e instanceof Error?e.message:String(e));}finally{if(current(stamp))setBusy(false);}}
 async function register(){if(password!==confirm){setError('Пароли не совпадают');return;}const stamp=epoch.current;setBusy(true);setError('');try{const data=await request('/api/invite/redeem','POST',{code,password});if(!current(stamp))return;resetPanel();alert(`Аккаунт ${data.email} создан. Теперь войдите в Connect со своим паролем.`);}catch(e){if(current(stamp))setError(e instanceof Error?e.message:String(e));}finally{if(current(stamp))setBusy(false);}}
 return <>


 {open&&(!signed||admin)&&<div style={panel}><div style={card} role="dialog" aria-modal="true" aria-label="Приглашения Connect"><button onClick={()=>setOpen(false)} style={{float:'right',...btn,background:'#343b4b'}}>Закрыть ×</button>
 <h2 style={{margin:'5px 0 20px'}}>{signed?(mode==='hidden'?'Коды для скрытых':'Приглашения'):'Регистрация по коду'}</h2>
 {signed?<><p>{mode==='hidden'?'Этот код создаст скрытого участника. В его контактах будет только администратор.':'Создайте одноразовый код на 24 часа для email пользователя.'}</p><input style={field} type="email" placeholder="Email нового пользователя" value={email} onChange={e=>setEmail(e.target.value)}/><button style={btn} disabled={busy||!email.includes('@')} onClick={()=>void create()}>Создать код</button>{issued&&<><p>Код для передачи пользователю:</p><input style={field} readOnly value={issued}/><button style={btn} onClick={()=>void navigator.clipboard.writeText(issued)}>Скопировать</button> <button style={btn} onClick={()=>void(navigator.share?navigator.share({text:`Приглашение в Connect: ${issued}`}).catch(()=>{}):navigator.clipboard.writeText(issued))}>Поделиться</button></>}
 <h3>Последние приглашения</h3>{invites.filter(x=>(x.invite_type||'normal')===mode).map(x=><div key={x.id} style={{padding:'10px 0',borderTop:'1px solid #343b4b',fontSize:13}}><div>{x.email}</div><div style={{opacity:.7}}>{x.redeemed_at?'Использован':x.revoked_at?'Отозван':new Date(x.expires_at)<new Date()?'Истёк':'Активен'} · до {new Date(x.expires_at).toLocaleString('ru-RU')}</div>{!x.redeemed_at&&!x.revoked_at&&new Date(x.expires_at)>new Date()&&<button style={{...btn,background:'#663b48',marginTop:5}} disabled={busy} onClick={()=>void revoke(x.id)}>Отозвать</button>}</div>)}</>:
 <form onSubmit={e=>{e.preventDefault();void register()}}><p>Введите код администратора и придумайте пароль. Email уже закреплён за кодом.</p><input style={field} autoCapitalize="characters" autoComplete="off" placeholder="Код приглашения" required value={code} onChange={e=>setCode(e.target.value)}/><input style={field} type="password" autoComplete="new-password" placeholder="Пароль (от 8 символов)" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)}/><input style={field} type="password" autoComplete="new-password" placeholder="Повторите пароль" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)}/><button style={btn} type="submit" disabled={busy}>Создать аккаунт</button></form>}
 {error&&<p role="alert" style={{color:'#ff9c9c'}}>{error}</p>}
 </div></div>}
 </>;
}
