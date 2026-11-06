'use client';
import {useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
type Sound='soft'|'bright'|'gentle'|'silent';
type Prefs={enabled:boolean,sound:Sound,vibrate:boolean};
const defaults:Prefs={enabled:true,sound:'soft',vibrate:true};
const labels:Record<Sound,string>={soft:'Мягкий (по умолчанию)',bright:'Яркий',gentle:'Нежный',silent:'Без звука'};
declare global {interface Window {ConnectAndroid?:{register:(token:string)=>void;setPreferences:(json:string)=>void}}}
function play(sound:Sound){if(sound==='silent')return;const Audio=window.AudioContext;if(!Audio)return;const ctx=new Audio();const notes=sound==='bright'?[880,1175]:sound==='gentle'?[523,659]:[740,988];notes.forEach((freq,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.13;o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.08,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+.24);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.25)});setTimeout(()=>void ctx.close(),850)}
function vapidBytes(value:string){const pad='='.repeat((4-value.length%4)%4);return Uint8Array.from(atob((value+pad).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
function valid(p:any):p is Prefs{return p&&typeof p.enabled==='boolean'&&typeof p.vibrate==='boolean'&&['soft','bright','gentle','silent'].includes(p.sound)}
export default function ConnectNotificationSettings({supabase,userId}:{supabase:SupabaseClient,userId:string}){
 const [prefs,setPrefs]=useState<Prefs>(defaults),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const latest=useRef(defaults),revision=useRef(0),queue=useRef<Promise<void>>(Promise.resolve());
 const storageKey='connect-notification-prefs-'+userId;
 function apply(p:Prefs){latest.current=p;setPrefs(p);try{localStorage.setItem(storageKey,JSON.stringify(p))}catch{}window.ConnectAndroid?.setPreferences(JSON.stringify(p))}
 useEffect(()=>{let live=true;revision.current=0;queue.current=Promise.resolve();let local:Prefs|undefined;try{const raw=localStorage.getItem(storageKey);const parsed=raw?JSON.parse(raw):null;if(valid(parsed))local=parsed}catch{}if(local)apply(local);else apply(defaults);
  const startedAt=revision.current;
  void supabase.from('notification_preferences').select('enabled,sound,vibrate').eq('user_id',userId).maybeSingle().then(({data,error})=>{if(!live||revision.current!==startedAt)return;if(error){setStatus('Не удалось загрузить настройки с сервера');return}if(valid(data))apply(data);else if(local){void persist(local)}});
  return()=>{live=false};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[supabase,userId]);
 async function persist(next:Prefs){const {error}=await supabase.from('notification_preferences').upsert({user_id:userId,...next,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error}
 function save(next:Prefs){revision.current++;const version=revision.current;apply(next);setStatus('Сохраняем…');queue.current=queue.current.catch(()=>{}).then(async()=>{try{await persist(next);if(revision.current===version)setStatus('Настройки сохранены')}catch(e){if(revision.current===version)setStatus('Не удалось сохранить на сервере. Повторите изменение.');console.error('Connect notification preferences:',e)}})}
 async function activate(){
  if(busy)return;
  setBusy(true);
  try {
    // iOS must receive the permission prompt directly from the button gesture.
    // Do not await getSession() or register a service worker first.
    if (!window.ConnectAndroid) {
      if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))
        throw Error('Web Push недоступен. На iPhone откройте Connect с экрана «Домой».');
      if(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)throw Error('VAPID ещё не настроен');
      if(Notification.permission!=='granted' && await Notification.requestPermission()!=='granted')
        throw Error('Разрешение на уведомления не предоставлено');
    }
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw Error('Войдите в аккаунт');
    if(window.ConnectAndroid){window.ConnectAndroid.setPreferences(JSON.stringify(latest.current));window.ConnectAndroid.register(session.access_token);setStatus('Android: ожидаем подтверждения регистрации');return}
    const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
    const reg=await navigator.serviceWorker.register('/sw.js');
    let sub=await reg.pushManager.getSubscription();
    const bytes=vapidBytes(key);
    const oldKey=sub?.options.applicationServerKey;
    const matches=oldKey&&new Uint8Array(oldKey).length===bytes.length&&new Uint8Array(oldKey).every((v,i)=>v===bytes[i]);
    if(sub&&!matches){await sub.unsubscribe();sub=null}
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    const response=await fetch('/api/push/register',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({platform:'web',endpoint:sub.endpoint,subscription:sub.toJSON()})});
    if(!response.ok){const detail=await response.json().catch(()=>({}));throw Error(detail.error||'Не удалось зарегистрировать устройство')}
    setStatus('Уведомления подключены. Входящие звонки будут показываться при закрытой PWA.');
  }catch(e){setStatus(e instanceof Error?e.message:'Ошибка подключения')}
  finally{setBusy(false)}
 }
 return <section className="connect-notifications" aria-label="Звуки и уведомления">
 <label><input type="checkbox" checked={prefs.enabled} onChange={e=>save({...latest.current,enabled:e.target.checked})}/> Уведомления включены</label>
 <div><label htmlFor="connect-sound">Сигнал для всех чатов</label><select id="connect-sound" value={prefs.sound} onChange={e=>save({...latest.current,sound:e.target.value as Sound})}>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select><button type="button" onClick={()=>play(prefs.sound)}>Прослушать</button></div>
 <label><input type="checkbox" checked={prefs.vibrate} onChange={e=>save({...latest.current,vibrate:e.target.checked})}/> Вибрация (где поддерживается)</label>
 <button type="button" disabled={busy} onClick={()=>void activate()}>{busy?'Подключаем…':'Подключить уведомления'}</button><p role="status">{status}</p><small>iPhone: при закрытой PWA используются системные push-уведомления. Чтобы принять звонок, нажмите на уведомление и откройте Connect. Android: выбранный сигнал действует, если звук разрешён в настройках канала уведомлений Android.</small>
 </section>;
}
