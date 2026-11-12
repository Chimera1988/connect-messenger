"use client";

import { useRef, useState, type SyntheticEvent, type CSSProperties } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// Transcripts are private to the current in-memory session; never persisted to Supabase.
const inMemory = new Map<string, string>();
type Phase = 'closed' | 'checking' | 'consent' | 'loading' | 'ready' | 'error';

export default function ConnectTranscript({ client, messageId, compact = false }: {
  client: SupabaseClient; messageId: string; compact?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('closed');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  function positionPanel() {
    const button = toggleRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const viewport = button.closest('.message-scroll')?.getBoundingClientRect();
    const above = rect.top - (viewport?.top ?? 0);
    const below = (viewport?.bottom ?? window.innerHeight) - rect.bottom;
    const openAbove = above >= 185 || above > below;
    const width = Math.min(285, window.innerWidth - 24);
    const left = Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10)) - rect.left;
    setPanelStyle({ width, left, right: 'auto', top: openAbove ? 'auto' : 'calc(100% + 7px)',
      bottom: openAbove ? 'calc(100% + 7px)' : 'auto' });
  }
  const stopTouch = (e: SyntheticEvent) => e.stopPropagation();

  async function toggleTranscript() {
    if (phase !== 'closed') { setPhase('closed'); return; }
    // Update the UI immediately on tap, before any async authentication calls.
    positionPanel();
    setPhase('checking');
    setError('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) { setError('Войди в Connect, чтобы расшифровать запись.'); setPhase('error'); return; }
      const cached = inMemory.get(`${session.user.id}:${messageId}`);
      if (cached !== undefined) { setText(cached); setPhase('ready'); return; }
      // Explicit consent for each recording. No window.confirm() (unreliable on iOS PWA).
      setPhase('consent');
    } catch {
      setError('Не удалось проверить авторизацию.');
      setPhase('error');
    }
  }

  async function transcribe() {
    setPhase('loading');
    setError('');
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Войди в Connect, чтобы получить расшифровку.');
      const response = await fetch('/api/transcribe', {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      });
      const data: { text?: unknown; error?: unknown } = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : `Ошибка распознавания (${response.status}).`);
      if (typeof data.text !== 'string') throw new Error('Сервис вернул неверный ответ.');
      const result = data.text.trim().slice(0, 30000);
      const cacheKey = `${session.user.id}:${messageId}`;
      inMemory.set(cacheKey, result);
      if (inMemory.size > 100) inMemory.delete(inMemory.keys().next().value!);
      setText(result);
      setPhase('ready');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось распознать запись.');
      setPhase('error');
    }
  }

  return <div className={'connect-transcript' + (compact ? ' is-compact' : '')}
    onClick={stopTouch} onTouchStart={stopTouch} onTouchMove={stopTouch}
    onTouchEnd={stopTouch} onTouchCancel={stopTouch} onPointerDown={stopTouch}
    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}>
    <button ref={toggleRef} type="button" className="connect-transcript-toggle" disabled={phase === 'loading'}
      aria-expanded={phase !== 'closed'} aria-label={phase === 'closed' ? 'Расшифровать запись в текст' : 'Скрыть расшифровку'}
      title={phase === 'closed' ? 'Расшифровать в текст' : 'Скрыть расшифровку'}
      onClick={e => { e.stopPropagation(); void toggleTranscript(); }}>
      <svg className="connect-arrow-t-icon" viewBox="0 0 24 24" width="19" height="19" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4.5 4.5v8.5a4 4 0 0 0 4 4h10"/>
        <path d="m14.5 12.5 4.5 4.5-4.5 4.5"/>
      </svg><span>Т</span>
    </button>
    {phase !== 'closed' && <div className="connect-transcript-result" role="status" aria-live="polite" style={panelStyle}>
      {phase === 'checking' ? 'Проверяем доступ…' :
       phase === 'consent' ? <>
         <span>Для расшифровки Connect отправит эту запись в Cloudflare Workers AI. Продолжить?</span>
         <div className="connect-transcript-actions">
           <button type="button" className="connect-transcript-approve" onClick={e => { e.stopPropagation(); void transcribe(); }}>Расшифровать</button>
           <button type="button" onClick={e => { e.stopPropagation(); setPhase('closed'); }}>Отмена</button>
         </div>
       </> :
       phase === 'loading' ? 'Распознаём речь…' :
       phase === 'error' ? <span className="connect-transcript-error">{error}</span> :
       text || 'В записи не обнаружена речь.'}
    </div>}
  </div>;
}
