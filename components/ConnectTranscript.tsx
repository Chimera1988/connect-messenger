'use client';

import {useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

// Transcript stays in session memory only; no Supabase transcripts and no localStorage.
// Sending to the speech provider requires an explicit, per-recording confirmation.
const inMemory = new Map<string,string>();

export default function ConnectTranscript({client,messageId,compact=false}:{client:SupabaseClient;messageId:string;compact?:boolean}) {
  const [opened,setOpened] = useState(false);
  const [pending,setPending] = useState(false);
  const [text,setText] = useState('');
  const [error,setError] = useState('');
  async function toggleTranscript() {
    if(opened){setOpened(false);return;}
    setOpened(true);
    if(text || pending)return;
    setError('');
    if(!window.confirm('Чтобы расшифровать запись, Connect отправит аудио в сервис распознавания речи. Продолжить?')){setOpened(false);return;}
    const {data:{session}}=await client.auth.getSession();
    if(!session){setError('Войди в аккаунт, чтобы получить расшифровку.');return;}
    const cacheKey=`${session.user.id}:${messageId}`;
    const cached=inMemory.get(cacheKey);
    if(cached!==undefined){setText(cached);return;}
    setPending(true);
    try{
      const response=await fetch('/api/transcribe',{
        method:'POST',cache:'no-store',credentials:'same-origin',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({messageId}),
      });
      const data=await response.json().catch(()=>({error:'Не удалось получить расшифровку'}));
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Не удалось распознать запись.');
      const transcript=typeof data.text==='string'?data.text.trim():'';
      inMemory.set(cacheKey,transcript);
      if(inMemory.size>100)inMemory.delete(inMemory.keys().next().value!);
      setText(transcript);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось распознать запись');}
    finally{setPending(false);}
  }
  return <div className={'connect-transcript'+(compact?' is-compact':'')} onClick={e=>e.stopPropagation()}>
    <button type="button" className="connect-transcript-toggle" disabled={pending}
      aria-expanded={opened} aria-label={opened?'Скрыть расшифровку':'Расшифровать запись в текст'}
      title={opened?'Скрыть текст':'Расшифровать в текст'}
      onClick={e=>{e.stopPropagation();void toggleTranscript();}}><svg className="connect-arrow-t-icon" viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 4.5v8.5a4 4 0 0 0 4 4h10"/><path d="m14.5 12.5 4.5 4.5-4.5 4.5"/></svg><span>Т</span></button>
    {opened && <div className="connect-transcript-result" role="status" onClick={e=>e.stopPropagation()}>
      {pending?'Распознавание речи…':error?<span className="connect-transcript-error">{error}</span>:text || 'В записи не обнаружена речь.'}
    </div>}
  </div>;
}
