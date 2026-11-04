'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase=url&&key?createClient(url,key,{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}):null;
type Tab='Чаты'|'Контакты'|'Настройки';
type Profile={id:string;display_name:string;is_blocked:boolean};
export default function Home(){
 const [tab,setTab]=useState<Tab>('Чаты'); const [theme,setTheme]=useState<'dark'|'light'>('dark');
 const [user,setUser]=useState<User|null>(null); const [loading,setLoading]=useState(true);
 const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [newPassword,setNewPassword]=useState('');
 const [setup,setSetup]=useState(false);const [busy,setBusy]=useState(false);const [notice,setNotice]=useState('');
 const [profiles,setProfiles]=useState<Profile[]>([]);
 const invited=useMemo(()=>typeof window!=='undefined'&&/type=(invite|recovery)/.test(window.location.hash+window.location.search),[]);
 useEffect(()=>{
  if(!supabase){setLoading(false);return;}
  let active=true;
  supabase.auth.getSession().then(({data,error})=>{if(!active)return;setUser(data.session?.user??null);setLoading(false);if(error)setNotice(error.message);if(invited&&data.session)setSetup(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
   setUser(session?.user??null);setLoading(false);
   if(event==='PASSWORD_RECOVERY'||(invited&&session))setSetup(true);
  });
  return()=>{active=false;subscription.unsubscribe();};
 },[invited]);
 useEffect(()=>{if(!supabase||!user)return;supabase.from('profiles').select('id,display_name,is_blocked').then(({data,error})=>{if(data)setProfiles(data as Profile[]);if(error)setNotice(error.message);});},[user]);
 async function login(e:React.FormEvent){e.preventDefault();if(!supabase)return;setBusy(true);setNotice('');const {error}=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(error)setNotice('Не удалось войти: '+error.message);}
 async function savePassword(e:React.FormEvent){e.preventDefault();if(!supabase)return;if(newPassword.length<8){setNotice('Пароль должен содержать не менее 8 символов.');return;}setBusy(true);const {error}=await supabase.auth.updateUser({password:newPassword});setBusy(false);if(error){setNotice(error.message);return;}setSetup(false);setNewPassword('');setNotice('Пароль установлен. Добро пожаловать в Connect!');if(typeof window!=='undefined')window.history.replaceState({},'',window.location.pathname);}
 async function logout(){await supabase?.auth.signOut();setProfiles([]);setPassword('');setNotice('');}
 return <div className={theme}><main className="screen"><header><div className="brand"><span className="logo">●</span><h1>Connect</h1></div><span className="version">0.2</span></header>
 {!supabase?<div className="panel"><h2>Подключение не настроено</h2><p>Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в Vercel и запустите повторное развёртывание.</p></div>:
 loading?<div className="empty">Загрузка…</div>:
 setup&&user?<form className="panel auth" onSubmit={savePassword}><h2>Создать пароль</h2><p>Установите пароль для входа в Connect.</p><input className="search" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Новый пароль (от 8 символов)"/><button className="primary" disabled={busy}>Сохранить пароль</button></form>:
 !user?<form className="panel auth" onSubmit={login}><h2>Вход в Connect</h2><p>Вход только для приглашённых пользователей.</p><input className="search" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email"/><input className="search" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль"/><button className="primary" disabled={busy}>Войти</button></form>:
 <>
 {tab==='Чаты'&&<><h2>Чаты</h2><div className="empty"><div className="symbol">◉</div><h2>Пока нет переписок</h2><p>Вы вошли в Connect. Личные диалоги подключим следующим обновлением.</p></div></>}
 {tab==='Контакты'&&<><h2>Контакты</h2>{profiles.filter(p=>!p.is_blocked&&p.id!==user.id).length===0?<div className="empty">Других участников пока нет.</div>:profiles.filter(p=>!p.is_blocked&&p.id!==user.id).map(p=><div className="panel" key={p.id}>{p.display_name}</div>)}</>}
 {tab==='Настройки'&&<><h2>Настройки</h2><div className="panel"><strong>Профиль</strong><p>{user.email}</p><button className="primary" onClick={logout}>Выйти</button></div><div className="panel"><strong>Оформление</strong><div className="choices"><button className={theme==='dark'?'selected':''} onClick={()=>setTheme('dark')}>Тёмная</button><button className={theme==='light'?'selected':''} onClick={()=>setTheme('light')}>Светлая</button></div></div></>}
 </>}
 {notice&&<p role="status" className="notice">{notice}</p>}
 </main>{user&&!setup&&<nav aria-label="Основная навигация">{(['Чаты','Контакты','Настройки'] as const).map(t=><button key={t} className={tab===t?'active':''} onClick={()=>setTab(t)}>{t}</button>)}</nav>}</div>;
}
