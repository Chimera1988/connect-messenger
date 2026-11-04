'use client';
import {useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
type Sound='soft'|'bright'|'gentle'|'silent';
const sounds:Record<Sound,string>={soft:'Мягкий (по умолчанию)',bright:'Яркий',gentle:'Нежный',silent:'Без звука'};
function tone(sound:Sound){
  if(sound==='silent')return;
  const AudioContextCtor=window.AudioContext;
  if(!AudioContextCtor)return;
  const ctx=new AudioContextCtor();
  const notes=sound==='bright'?[880,1175]:sound==='gentle'?[523,659]:[740,988];
  notes.forEach((hz,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=hz;gain.gain.setValueAtTime(0.0001,ctx.currentTime+i*.13);gain.gain.exponentialRampToValueAtTime(.085,ctx.currentTime+i*.13+.012);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+i*.13+.24);osc.connect(gain).connect(ctx.destination);osc.start(ctx.currentTime+i*.13);osc.stop(ctx.currentTime+i*.13+.25);});
  setTimeout(()=>void ctx.close(),900);
}
function base64ToUint8Array(base64:string){const padding='='.repeat((4-base64.length%4)%4);const raw=atob((base64+padding).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export default function ConnectNotificationSettings({supabase,userId}:{supabase:SupabaseClient,userId:string}){
  const [enabled,setEnabled]=useState(true),[sound,setSound]=useState<Sound>('soft'),[vibrate,setVibrate]=useState(true),[message,setMessage]=useState('');
  useEffect(()=>{let active=true;void supabase.from('notification_preferences').select('enabled,sound,vibrate').eq('user_id',userId).maybeSingle().then(({data})=>{if(active&&data){setEnabled(data.enabled);setSound(data.sound as Sound);setVibrate(data.vibrate);}});return()=>{active=false;};},[supabase,userId]);
  async function save(next:{enabled:boolean,sound:Sound,vibrate:boolean}){const {error}=await supabase.from('notification_preferences').upsert({user_id:userId,...next,updated_at:new Date().toISOString()},{onConflict:'user_id'});setMessage(error?'Не удалось сохранить настройки':'Настройки сохранены');}
  async function activate(){
    if(!('serviceWorker'in navigator)||!('PushManager'in window)){setMessage('Web Push недоступен в этом браузере');return;}
    if(!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY){setMessage('VAPID ключ ещё не настроен');return;}
    const permission=await Notification.requestPermission();if(permission!=='granted'){setMessage('Разрешение на уведомления не предоставлено');return;}
    try{
      const registration=await navigator.serviceWorker.register('/sw.js');
      const subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)});
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw Error('Не выполнен вход');
      const response=await fetch('/api/push/register',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({platform:'web',endpoint:subscription.endpoint,subscription:subscription.toJSON()})});
      if(!response.ok)throw Error('Не удалось зарегистрировать устройство');
      setMessage('Уведомления подключены');
    }catch(e){setMessage(e instanceof Error?e.message:'Ошибка подключения');}
  }
  return <section aria-label="Звуки и уведомления"><h3>Звуки и уведомления</h3>
    <label><input type="checkbox" checked={enabled} onChange={e=>{setEnabled(e.target.checked);void save({enabled:e.target.checked,sound,vibrate});}}/> Уведомления включены</label>
    <div><label htmlFor="connect-sound">Сигнал сообщений</label> <select id="connect-sound" value={sound} onChange={e=>{const s=e.target.value as Sound;setSound(s);void save({enabled,sound:s,vibrate});}}>{Object.entries(sounds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select> <button type="button" onClick={()=>tone(sound)}>Прослушать</button></div>
    <label><input type="checkbox" checked={vibrate} onChange={e=>{setVibrate(e.target.checked);void save({enabled,sound,vibrate:e.target.checked});}}/> Вибрация (где поддерживается)</label>
    <div><button type="button" onClick={()=>void activate()}>Подключить уведомления PWA</button></div>
    <p role="status">{message}</p><small>На iPhone фоновые уведомления используют системный звук. Для iOS 16.4+ установите PWA на экран «Домой».</small>
  </section>;
}
