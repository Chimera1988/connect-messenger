'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL||'';
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
const supabase=url&&key?createClient(url,key,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
type Tab='Чаты'|'Контакты'|'Настройки';
type Profile={id:string;display_name:string;is_blocked:boolean};
type Conversation={id:string;user_a:string;user_b:string;created_at:string};
type Message={id:string;conversation_id:string;sender_id:string;body:string;created_at:string};
export default function Home(){
 const [tab,setTab]=useState<Tab>('Чаты');const [theme,setTheme]=useState<'dark'|'light'>('dark');
 const [user,setUser]=useState<User|null>(null);const [loading,setLoading]=useState(true);
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [newPassword,setNewPassword]=useState('');
 const [setup,setSetup]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 const [profiles,setProfiles]=useState<Profile[]>([]);const [conversations,setConversations]=useState<Conversation[]>([]);
 const [activeChat,setActiveChat]=useState<string|null>(null);const [messages,setMessages]=useState<Message[]>([]);const [draft,setDraft]=useState('');
 const invited=useMemo(()=>typeof window!=='undefined'&&/type=(invite|recovery)/.test(window.location.hash+window.location.search),[]);
 useEffect(()=>{if(!supabase){setLoading(false);return;}let active=true;
  supabase.auth.getSession().then(({data,error})=>{if(!active)return;setUser(data.session?.user??null);setLoading(false);if(error)setNotice(error.message);if(invited&&data.session)setSetup(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{setUser(session?.user??null);setLoading(false);if(event==='PASSWORD_RECOVERY'||(invited&&session))setSetup(true);});
  return()=>{active=false;subscription.unsubscribe();};},[invited]);
 const loadDirectory=useCallback(async()=>{if(!supabase||!user)return;
  const [p,c]=await Promise.all([supabase.from('profiles').select('id,display_name,is_blocked'),supabase.from('conversations').select('id,user_a,user_b,created_at').order('created_at',{ascending:false})]);
  if(p.error)setNotice(p.error.message);else setProfiles((p.data||[]) as Profile[]);
  if(c.error)setNotice(c.error.message);else setConversations((c.data||[]) as Conversation[]);
 },[user]);
 useEffect(()=>{void loadDirectory();},[loadDirectory]);
 const loadMessages=useCallback(async(id:string)=>{if(!supabase)return;const {data,error}=await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(500);if(error)setNotice(error.message);else setMessages((data||[]) as Message[]);},[]);
 useEffect(()=>{if(!activeChat||!supabase)return;let live=true;setMessages([]);void loadMessages(activeChat);
  const channel=supabase.channel('chat-'+activeChat).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+activeChat},payload=>{if(!live)return;const m=payload.new as Message;setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m].sort((a,b)=>a.created_at.localeCompare(b.created_at)));}).subscribe();
  return()=>{live=false;void supabase.removeChannel(channel);};},[activeChat,loadMessages]);
 const contacts=profiles.filter(p=>!p.is_blocked&&p.id!==user?.id);
 const chatList=conversations.map(c=>({...c,other:profiles.find(p=>p.id===(c.user_a===user?.id?c.user_b:c.user_a))}));
 const selected=chatList.find(c=>c.id===activeChat);
 async function openContact(p:Profile){if(!supabase||!user||busy)return;setBusy(true);setNotice('');
  let c=conversations.find(c=>(c.user_a===user.id&&c.user_b===p.id)||(c.user_b===user.id&&c.user_a===p.id));
  if(!c){const [a,b]=[user.id,p.id].sort();const {data,error}=await supabase.from('conversations').upsert({user_a:a,user_b:b},{onConflict:'user_a,user_b'}).select('id,user_a,user_b,created_at').single();if(error){setNotice('Не удалось создать чат: '+error.message);setBusy(false);return;}c=data as Conversation;setConversations(prev=>[c!,...prev.filter(x=>x.id!==c!.id)]);}
  setActiveChat(c.id);setTab('Чаты');setBusy(false);
 }
 async function sendMessage(e:React.FormEvent){e.preventDefault();if(!supabase||!user||!activeChat||!draft.trim()||busy)return;const body=draft.trim();setBusy(true);setNotice('');const {data,error}=await supabase.from('messages').insert({conversation_id:activeChat,sender_id:user.id,body}).select('id,conversation_id,sender_id,body,created_at').single();setBusy(false);if(error){setNotice('Сообщение не отправлено: '+error.message);return;}setDraft('');const m=data as Message;setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);}
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error)setNotice('Не удалось войти: '+error.message);}
 async function savePassword(e:React.FormEvent){e.preventDefault();if(!supabase)return;if(newPassword.length<8){setNotice('Пароль должен содержать не менее 8 символов.');return;}setBusy(true);const {error}=await supabase.auth.updateUser({password:newPassword});setBusy(false);if(error){setNotice(error.message);return;}setSetup(false);setNewPassword('');setNotice('Пароль установлен. Добро пожаловать в Connect!');if(typeof window!=='undefined')window.history.replaceState({},'',window.location.pathname);}
 async function logout(){await supabase?.auth.signOut();setProfiles([]);setConversations([]);setMessages([]);setActiveChat(null);setPassword('');setNotice('');}
 return <div className={theme}><style>{'.contact-row{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;background:var(--surface);color:var(--fg);border:0;border-radius:14px;padding:18px;margin:10px 0;font:inherit;cursor:pointer}.contact-row span{color:#4891ff;font-size:14px}.contact-row:disabled{opacity:.6}.back{border:0;background:none;color:#4891ff;font:inherit;padding:20px 0 0;cursor:pointer}.muted{color:var(--muted)}.message-list{display:flex;flex-direction:column;gap:10px;padding:12px 0 95px;min-height:50vh}.bubble{max-width:83%;padding:12px 14px;border-radius:17px;overflow-wrap:anywhere;white-space:pre-wrap}.bubble small{display:block;text-align:right;font-size:11px;opacity:.65;margin-top:5px}.mine{background:#007aff;color:white;align-self:flex-end;border-bottom-right-radius:5px}.theirs{background:var(--surface);color:var(--fg);align-self:flex-start;border-bottom-left-radius:5px}.composer{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:min(540px,100%);display:flex;gap:8px;padding:12px 20px max(16px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border)}.composer input{flex:1;min-width:0;background:var(--surface);color:var(--fg);border:0;border-radius:22px;padding:13px 16px;font:inherit}.composer button{background:#007aff;color:white;border:0;border-radius:50%;width:44px;height:44px;font-size:22px}.composer button:disabled{opacity:.45}'}</style><main className="screen"><header><div className="brand"><span className="logo">●</span><h1>Connect</h1></div><span className="version">0.3</span></header>
 {!supabase?<div className="panel"><h2>Подключение не настроено</h2><p>Добавьте переменные Supabase в Vercel.</p></div>:loading?<div className="empty">Загрузка…</div>:
 setup&&user?<form className="panel auth" onSubmit={savePassword}><h2>Создать пароль</h2><p>Установите пароль для входа в Connect.</p><input className="search" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Новый пароль (от 8 символов)"/><button className="primary" disabled={busy}>Сохранить пароль</button></form>:
 !user?<form className="panel auth" onSubmit={login}><h2>Вход в Connect</h2><p>Вход только для приглашённых пользователей.</p><input className="search" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><input className="search" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль"/><button className="primary" disabled={busy}>Войти</button></form>:
 <>{activeChat&&selected?<section><button className="back" onClick={()=>setActiveChat(null)}>← К чатам</button><h2>{selected.other?.display_name||'Собеседник'}</h2><div className="message-list">{messages.length===0?<p className="muted">Пока нет сообщений. Начните разговор.</p>:messages.map(m=><div key={m.id} className={'bubble '+(m.sender_id===user.id?'mine':'theirs')}><div>{m.body}</div><small>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small></div>)}</div><form className="composer" onSubmit={sendMessage}><input aria-label="Сообщение" value={draft} maxLength={10000} onChange={e=>setDraft(e.target.value)} placeholder="Сообщение…"/><button disabled={busy||!draft.trim()}>➤</button></form></section>:
 <>{tab==='Чаты'&&<><h2>Чаты</h2>{chatList.length===0?<div className="empty"><div className="symbol">◉</div><h2>Пока нет переписок</h2><p>Откройте «Контакты», чтобы начать диалог.</p></div>:chatList.map(c=><button className="contact-row" key={c.id} onClick={()=>setActiveChat(c.id)}>{c.other?.display_name||'Собеседник'} <span>›</span></button>)}</>}
 {tab==='Контакты'&&<><h2>Контакты</h2>{contacts.length===0?<div className="empty">Других участников пока нет. Пригласите пользователя через Supabase.</div>:contacts.map(p=><button className="contact-row" disabled={busy} key={p.id} onClick={()=>void openContact(p)}>{p.display_name}<span>Написать ›</span></button>)}</>}
 {tab==='Настройки'&&<><h2>Настройки</h2><div className="panel"><strong>Профиль</strong><p>{user.email}</p><button className="primary" onClick={logout}>Выйти</button></div><div className="panel"><strong>Оформление</strong><div className="choices"><button className={theme==='dark'?'selected':''} onClick={()=>setTheme('dark')}>Тёмная</button><button className={theme==='light'?'selected':''} onClick={()=>setTheme('light')}>Светлая</button></div></div></>}</>}
 </>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 </main>{user&&!setup&&!activeChat&&<nav aria-label="Основная навигация">{(['Чаты','Контакты','Настройки'] as const).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>}</div>;
}
