'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
 const [latest,setLatest]=useState<Record<string,Message>>({});
 const [unread,setUnread]=useState<Record<string,number>>({});
 const [typing,setTyping]=useState(false);
 const lastTypingSent=useRef(0);
 const lastKeypress=useRef(0);
 const messageListRef=useRef<HTMLDivElement|null>(null);
 const previousLastMessage=useRef('');
 const bottomRef=useRef<HTMLDivElement|null>(null);
 const activeChatRef=useRef<string|null>(null);
 useEffect(()=>{activeChatRef.current=activeChat;},[activeChat]);
 const markRead=useCallback(async(id:string,at:string)=>{if(!user||!supabase)return;
  const storageKey='connect-read-'+user.id;
  let saved:Record<string,string>={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
  if(saved[id]&&saved[id]>=at)return;
  saved[id]=at;try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{}
  setUnread(prev=>({...prev,[id]:0}));
  const {error}=await supabase.from('conversation_user_state').upsert({conversation_id:id,user_id:user.id,last_read_at:at},{onConflict:'conversation_id,user_id'});
  if(error)console.error('Read receipt:',error.message);
 },[user]);
 const updateTyping=useCallback(async(id:string,isTyping:boolean)=>{if(!user||!supabase)return;
  const {error}=await supabase.from('conversation_user_state').upsert({conversation_id:id,user_id:user.id,typing_until:isTyping?new Date(Date.now()+6000).toISOString():null},{onConflict:'conversation_id,user_id'});
  if(error)console.error('Typing:',error.message);
 },[user]);
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
 useEffect(()=>{if(!supabase||!user)return;let live=true;
  const refresh=async()=>{if(!live||document.visibilityState==='hidden')return;
   const {data,error}=await supabase!.from('messages').select('id,conversation_id,sender_id,body,created_at').order('created_at',{ascending:false}).limit(1000);
   if(!live)return;
   if(error){setNotice(error.message);return;}
   const items=(data||[]) as Message[];
   const newest:Record<string,Message>={};const counts:Record<string,number>={};
   let saved:Record<string,string>={};
   const {data:states,error:stateError}=await supabase!.from('conversation_user_state').select('conversation_id,user_id,last_read_at,typing_until');
   if(stateError){setNotice(stateError.message);return;}
   for(const st of states||[]){if(st.user_id===user.id)saved[st.conversation_id]=st.last_read_at;}
   const current=activeChatRef.current;
   setTyping(Boolean(current&&(states||[]).some(st=>st.conversation_id===current&&st.user_id!==user.id&&st.typing_until&&new Date(st.typing_until).getTime()>Date.now())));
   for(const m of items){if(!newest[m.conversation_id])newest[m.conversation_id]=m;
    if(m.sender_id!==user.id && m.created_at>(saved[m.conversation_id]||'') && m.conversation_id!==activeChatRef.current)counts[m.conversation_id]=(counts[m.conversation_id]||0)+1;}
   setLatest(newest);setUnread(counts);
  };
  void refresh();const timer=window.setInterval(()=>{void refresh();},3000);
  const visible=()=>{if(document.visibilityState==='visible'){void refresh();void loadDirectory();}};
  document.addEventListener('visibilitychange',visible);
  return()=>{live=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[user,loadDirectory]);
 const loadMessages=useCallback(async(id:string)=>{if(!supabase)return;const {data,error}=await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(500);if(error)setNotice(error.message);else setMessages((data||[]) as Message[]);},[]);
 useEffect(()=>{if(!activeChat||!supabase||!user)return;let live=true;setMessages([]);
  previousLastMessage.current='';
  void supabase.from('conversation_user_state').upsert({conversation_id:activeChat,user_id:user.id},{onConflict:'conversation_id,user_id',ignoreDuplicates:true});
  const refresh=async()=>{if(!live||document.visibilityState==='hidden')return;
   const {data,error}=await supabase!.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id',activeChat).order('created_at',{ascending:true}).limit(500);
   if(live&&data){setMessages(data as Message[]);const last=(data as Message[]).at(-1);if(last)markRead(activeChat,last.created_at);}
   if(live&&error)setNotice(error.message);
  };
  void refresh();
  const channel=supabase.channel('chat-'+activeChat).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:'conversation_id=eq.'+activeChat},payload=>{if(!live)return;const m=payload.new as Message;setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m].sort((a,b)=>a.created_at.localeCompare(b.created_at)));markRead(activeChat,m.created_at);}).subscribe(status=>{if(status==='SUBSCRIBED')void refresh();});
  // Fallback for mobile browsers where the Realtime WebSocket may be suspended or blocked.
  const interval=window.setInterval(()=>{void refresh();},3000);
  const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
  document.addEventListener('visibilitychange',onVisible);
  return()=>{live=false;window.clearInterval(interval);document.removeEventListener('visibilitychange',onVisible);void supabase.removeChannel(channel);};
 },[activeChat,markRead,user?.id]);
 useEffect(()=>{if(!activeChat||!messages.length)return;const last=messages[messages.length-1];
  if(last.id===previousLastMessage.current)return;
  previousLastMessage.current=last.id;void markRead(activeChat,last.created_at);
  const list=messageListRef.current;if(!list)return;
  const nearBottom=list.scrollHeight-list.scrollTop-list.clientHeight<180;
  if(nearBottom||last.sender_id===user?.id||list.scrollTop===0){requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;});}
 },[activeChat,messages,markRead,user?.id]);
 const contacts=profiles.filter(p=>!p.is_blocked&&p.id!==user?.id);
 const chatList=conversations.map(c=>({...c,other:profiles.find(p=>p.id===(c.user_a===user?.id?c.user_b:c.user_a)),last:latest[c.id],count:unread[c.id]||0})).sort((a,b)=>(b.last?.created_at||b.created_at).localeCompare(a.last?.created_at||a.created_at));
 const selected=chatList.find(c=>c.id===activeChat);
 function changeDraft(value:string){setDraft(value);if(!activeChat)return;const now=Date.now();lastKeypress.current=now;
  if(value.trim()&&now-lastTypingSent.current>1500){lastTypingSent.current=now;void updateTyping(activeChat,true);}
  if(!value.trim())void updateTyping(activeChat,false);
 }
 useEffect(()=>{if(!activeChat||!user)return;const id=activeChat;
  const timer=window.setInterval(()=>{if(Date.now()-lastKeypress.current<3500&&lastKeypress.current>0)void updateTyping(id,true);else if(lastKeypress.current>0){lastKeypress.current=0;void updateTyping(id,false);}},2000);
  return()=>{window.clearInterval(timer);lastKeypress.current=0;void updateTyping(id,false);};
 },[activeChat,user?.id,updateTyping]);
 async function openContact(p:Profile){if(!supabase||!user||busy)return;setBusy(true);setNotice('');
  let c=conversations.find(c=>(c.user_a===user.id&&c.user_b===p.id)||(c.user_b===user.id&&c.user_a===p.id));
  if(!c){const [a,b]=[user.id,p.id].sort();const {data,error}=await supabase.from('conversations').upsert({user_a:a,user_b:b},{onConflict:'user_a,user_b'}).select('id,user_a,user_b,created_at').single();if(error){setNotice('Не удалось создать чат: '+error.message);setBusy(false);return;}c=data as Conversation;setConversations(prev=>[c!,...prev.filter(x=>x.id!==c!.id)]);}
  setActiveChat(c.id);setTab('Чаты');setBusy(false);
 }
 async function sendMessage(e:React.FormEvent){e.preventDefault();if(!supabase||!user||!activeChat||!draft.trim()||busy)return;const body=draft.trim();setBusy(true);setNotice('');const {data,error}=await supabase.from('messages').insert({conversation_id:activeChat,sender_id:user.id,body}).select('id,conversation_id,sender_id,body,created_at').single();setBusy(false);if(error){setNotice('Сообщение не отправлено: '+error.message);return;}setDraft('');lastKeypress.current=0;void updateTyping(activeChat,false);const m=data as Message;setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);setLatest(prev=>({...prev,[activeChat]:m}));}
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error)setNotice('Не удалось войти: '+error.message);}
 async function savePassword(e:React.FormEvent){e.preventDefault();if(!supabase)return;if(newPassword.length<8){setNotice('Пароль должен содержать не менее 8 символов.');return;}setBusy(true);const {error}=await supabase.auth.updateUser({password:newPassword});setBusy(false);if(error){setNotice(error.message);return;}setSetup(false);setNewPassword('');setNotice('Пароль установлен. Добро пожаловать в Connect!');if(typeof window!=='undefined')window.history.replaceState({},'',window.location.pathname);}
 async function logout(){await supabase?.auth.signOut();setProfiles([]);setConversations([]);setMessages([]);setActiveChat(null);setLatest({});setUnread({});setTyping(false);setPassword('');setNotice('');}
 return <div className={theme}><style>{'.chat-screen{height:100dvh;min-height:0;overflow:hidden;display:flex;flex-direction:column;padding-bottom:0}.chat-section{display:flex;flex:1;min-height:0;flex-direction:column}.chat-section h2{flex-shrink:0}.chat-section .message-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-bottom:16px;-webkit-overflow-scrolling:touch}.chat-section .composer{position:static;transform:none;width:100%;flex-shrink:0;margin:0 -22px;padding:12px 22px max(16px,env(safe-area-inset-bottom));width:calc(100% + 44px)}.typing-hint{font-size:13px;color:#4891ff;margin:0 0 10px;padding-left:8px}.chat-preview{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}.chat-preview strong,.chat-preview small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chat-preview small{color:var(--muted);font-size:13px}.chat-meta{display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-size:12px;color:var(--muted)}.unread-count{background:#007aff;color:white;border-radius:999px;min-width:23px;padding:3px 6px;text-align:center;font-weight:600}.contact-row{width:100%;display:flex;justify-content:space-between;align-items:center;text-align:left;background:var(--surface);color:var(--fg);border:0;border-radius:14px;padding:18px;margin:10px 0;font:inherit;cursor:pointer}.contact-row span{color:#4891ff;font-size:14px}.contact-row:disabled{opacity:.6}.back{border:0;background:none;color:#4891ff;font:inherit;padding:20px 0 0;cursor:pointer}.muted{color:var(--muted)}.message-list{display:flex;flex-direction:column;gap:10px;padding:12px 0 95px;min-height:50vh}.bubble{max-width:83%;padding:12px 14px;border-radius:17px;overflow-wrap:anywhere;white-space:pre-wrap}.bubble small{display:block;text-align:right;font-size:11px;opacity:.65;margin-top:5px}.mine{background:#007aff;color:white;align-self:flex-end;border-bottom-right-radius:5px}.theirs{background:var(--surface);color:var(--fg);align-self:flex-start;border-bottom-left-radius:5px}.composer{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:min(540px,100%);display:flex;gap:8px;padding:12px 20px max(16px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border)}.composer input{flex:1;min-width:0;background:var(--surface);color:var(--fg);border:0;border-radius:22px;padding:13px 16px;font:inherit}.composer button{background:#007aff;color:white;border:0;border-radius:50%;width:44px;height:44px;font-size:22px}.composer button:disabled{opacity:.45}'}</style><main className={activeChat?"screen chat-screen":"screen"}><header><div className="brand"><span className="logo">●</span><h1>Connect</h1></div><span className="version">0.5.1</span></header>
 {!supabase?<div className="panel"><h2>Подключение не настроено</h2><p>Добавьте переменные Supabase в Vercel.</p></div>:loading?<div className="empty">Загрузка…</div>:
 setup&&user?<form className="panel auth" onSubmit={savePassword}><h2>Создать пароль</h2><p>Установите пароль для входа в Connect.</p><input className="search" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Новый пароль (от 8 символов)"/><button className="primary" disabled={busy}>Сохранить пароль</button></form>:
 !user?<form className="panel auth" onSubmit={login}><h2>Вход в Connect</h2><p>Вход только для приглашённых пользователей.</p><input className="search" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><input className="search" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль"/><button className="primary" disabled={busy}>Войти</button></form>:
 <>{activeChat&&selected?<section className="chat-section"><button className="back" onClick={()=>setActiveChat(null)}>← К чатам</button><h2>{selected.other?.display_name||'Собеседник'}</h2>{typing&&<p className="typing-hint">печатает…</p>}<div className="message-list" ref={messageListRef}>{messages.length===0?<p className="muted">Пока нет сообщений. Начните разговор.</p>:messages.map(m=><div key={m.id} className={'bubble '+(m.sender_id===user.id?'mine':'theirs')}><div>{m.body}</div><small>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</small></div>)}</div><form className="composer" onSubmit={sendMessage}><input aria-label="Сообщение" value={draft} maxLength={10000} onChange={e=>changeDraft(e.target.value)} placeholder="Сообщение…"/><button disabled={busy||!draft.trim()}>➤</button></form></section>:
 <>{tab==='Чаты'&&<><h2>Чаты</h2>{chatList.length===0?<div className="empty"><div className="symbol">◉</div><h2>Пока нет переписок</h2><p>Откройте «Контакты», чтобы начать диалог.</p></div>:chatList.map(c=><button className="contact-row" key={c.id} onClick={()=>setActiveChat(c.id)}><div className="chat-preview"><strong>{c.other?.display_name||'Собеседник'}</strong><small>{c.last?(c.last.sender_id===user.id?'Вы: ':'')+c.last.body:'Пока нет сообщений'}</small></div><div className="chat-meta"><span>{c.last?new Date(c.last.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):''}</span>{c.count>0&&<span className="unread-count">{c.count>99?'99+':c.count}</span>}</div></button>)}</>}
 {tab==='Контакты'&&<><h2>Контакты</h2>{contacts.length===0?<div className="empty">Других участников пока нет. Пригласите пользователя через Supabase.</div>:contacts.map(p=><button className="contact-row" disabled={busy} key={p.id} onClick={()=>void openContact(p)}>{p.display_name}<span>Написать ›</span></button>)}</>}
 {tab==='Настройки'&&<><h2>Настройки</h2><div className="panel"><strong>Профиль</strong><p>{user.email}</p><button className="primary" onClick={logout}>Выйти</button></div><div className="panel"><strong>Оформление</strong><div className="choices"><button className={theme==='dark'?'selected':''} onClick={()=>setTheme('dark')}>Тёмная</button><button className={theme==='light'?'selected':''} onClick={()=>setTheme('light')}>Светлая</button></div></div></>}</>}
 </>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 </main>{user&&!setup&&!activeChat&&<nav aria-label="Основная навигация">{(['Чаты','Контакты','Настройки'] as const).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>}</div>;
}
