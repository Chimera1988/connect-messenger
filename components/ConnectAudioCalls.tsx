'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

type Status = 'ringing' | 'active' | 'ended' | 'declined' | 'missed' | 'busy' | 'failed';
type CallRow = {
  id: string; conversation_id: string; caller_id: string; callee_id: string;
  status: Status; offer: RTCSessionDescriptionInit; answer: RTCSessionDescriptionInit | null;
  created_at: string; answered_at: string | null; ended_at: string | null;
};
type IceRow = { id: number; call_id: string; sender_id: string; candidate: RTCIceCandidateInit };
type Phase = 'idle' | 'preparing' | 'ringing' | 'incoming' | 'connecting' | 'active';

type Props = {
  client: SupabaseClient | null;
  userId: string | null;
  conversationId: string | null;
  peerId: string | null;
  peerName: string;
};

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const RING_TIMEOUT_MS = 50000;
const isLive = (s: Status) => s === 'ringing' || s === 'active';
const friendlyError = (e: unknown) => e instanceof Error ? e.message : 'Неизвестная ошибка';
const initials = (name: string) => name.trim().slice(0, 1).toLocaleUpperCase('ru-RU') || '☎';

function Glyph({ name }: { name: 'call' | 'end' | 'mic' | 'muted' | 'speaker' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths = {
    call: <path d="M5 3.8c-1.6 1-1.3 4.8 1.2 8.6 2.4 3.8 5.9 6.7 8.7 6.4 1.1-.1 3-1.4 3.3-2.7l.2-2.3c0-.7-.5-1.4-1.3-1.6l-3.2-.9a1.4 1.4 0 0 0-1.5.6l-1.2 1.4c-2.3-1-4.5-3.2-5.5-5.5l1.4-1.2c.5-.4.7-1 .5-1.6l-.9-3.2A1.7 1.7 0 0 0 7.7 3z"/>,
    end: <><path d="M3.5 12c4.4-4.3 12.6-4.3 17 0"/><path d="M5.4 10.4 3 14.2m15.6-3.8 2.4 3.8"/></>,
    mic: <><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></>,
    muted: <><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8M3 3l18 18"/></>,
    speaker: <><path d="M4 9v6h4l5 4V5L8 9zM17 9a5 5 0 0 1 0 6M19 6a9 9 0 0 1 0 12"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

export default function ConnectAudioCalls({ client, userId, conversationId, peerId, peerName }: Props) {
  const [header, setHeader] = useState<Element | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [shown, setShown] = useState<CallRow | null>(null);
  const [shownName, setShownName] = useState('');
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const callRef = useRef<CallRow | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const iceChannelRef = useRef<RealtimeChannel | null>(null);
  const localIceRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteIceRef = useRef<RTCIceCandidateInit[]>([]);
  const knownIceRef = useRef<Set<number>>(new Set());
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const answerPendingRef = useRef(false);
  const enteredRef = useRef(false);

  useEffect(() => {
    // React mounts the chat header in a sibling branch of this component.
    // A portal adds a real accessible button without moving any chat logic.
    const id = requestAnimationFrame(() => setHeader(document.querySelector('.chat-view .chat-header')));
    return () => cancelAnimationFrame(id);
  }, [conversationId, userId]);

  async function getIceServers(): Promise<RTCIceServer[]> {
    if (!client) return STUN;
    try {
      const { data } = await client.auth.getSession();
      if (!data.session?.access_token) return STUN;
      const response = await fetch('/api/calls/ice', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
        cache: 'no-store',
      });
      if (!response.ok) return STUN;
      const body = await response.json();
      return Array.isArray(body.iceServers) && body.iceServers.length ? body.iceServers as RTCIceServer[] : STUN;
    } catch { return STUN; }
  }

  async function sendIce(candidate: RTCIceCandidateInit) {
    const call = callRef.current;
    if (!call || !client || !userId) { localIceRef.current.push(candidate); return; }
    if (!isLive(call.status)) return;
    const { error: iceError } = await client.from('connect_call_ice').insert({
      call_id: call.id, sender_id: userId, candidate,
    });
    if (iceError) console.warn('Connect call ICE was not delivered:', iceError.message);
  }

  async function flushLocalIce() {
    const queued = localIceRef.current.splice(0);
    for (const candidate of queued) await sendIce(candidate);
  }

  async function flushRemoteIce() {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    const queued = remoteIceRef.current.splice(0);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch { /* A stale candidate can be ignored. */ }
    }
  }

  async function receiveIce(ice: IceRow) {
    if (!userId || ice.sender_id === userId || !callRef.current || ice.call_id !== callRef.current.id) return;
    if (knownIceRef.current.has(ice.id)) return;
    knownIceRef.current.add(ice.id);
    const pc = pcRef.current;
    if (!pc?.remoteDescription) { remoteIceRef.current.push(ice.candidate); return; }
    try { await pc.addIceCandidate(ice.candidate); }
    catch { /* A withdrawn candidate is non-fatal. */ }
  }

  function watchIce(callId: string) {
    if (!client) return;
    if (iceChannelRef.current) void client.removeChannel(iceChannelRef.current);
    knownIceRef.current = new Set();
    const channel = client.channel(`connect-call-ice-${callId}-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'connect_call_ice', filter: `call_id=eq.${callId}` },
        payload => { void receiveIce(payload.new as IceRow); })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          void client.from('connect_call_ice').select('id,call_id,sender_id,candidate')
            .eq('call_id', callId).order('id', { ascending: true }).limit(250)
            .then(({ data }) => { for (const row of data || []) void receiveIce(row as IceRow); });
        }
      });
    iceChannelRef.current = channel;
  }

  function cleanup() {
    generationRef.current++;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
    if (iceChannelRef.current && client) void client.removeChannel(iceChannelRef.current);
    iceChannelRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; }
    callRef.current = null;
    localIceRef.current = [];
    remoteIceRef.current = [];
    knownIceRef.current = new Set();
    answerPendingRef.current = false;
    enteredRef.current = false;
    setShown(null); setPhase('idle'); setElapsed(0); setMuted(false);
  }

  async function finish(reason: 'hangup' | 'decline' | 'missed' | 'failed' | 'busy' = 'hangup') {
    const current = callRef.current;
    cleanup();
    if (current && client) {
      const { error: rpcError } = await client.rpc('connect_finish_audio_call', {
        p_call_id: current.id, p_reason: reason,
      });
      if (rpcError) console.warn('Connect call state:', rpcError.message);
    }
  }

  async function createPeer(): Promise<RTCPeerConnection> {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      throw new Error('Для звонков нужен современный браузер с доступом к микрофону и HTTPS.');
    }
    const iceServers = await getIceServers();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    }, video: false });
    streamRef.current = stream;
    const pc = new RTCPeerConnection({ iceServers, bundlePolicy: 'max-bundle' });
    pcRef.current = pc;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.onicecandidate = event => { if (event.candidate) void sendIce(event.candidate.toJSON()); };
    pc.ontrack = event => {
      const audio = remoteAudioRef.current;
      if (!audio) return;
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      void audio.play().catch(() => setError('Нажмите «Звук», чтобы включить собеседника.'));
    };
    pc.onconnectionstatechange = () => {
      if (pc !== pcRef.current) return;
      if (pc.connectionState === 'connected') { enteredRef.current = true; setPhase('active'); setError(''); }
      if (pc.connectionState === 'failed') { setToast('Связь прервалась. Для некоторых сетей необходим TURN-сервер.'); void finish('failed'); }
    };
    return pc;
  }

  async function onUpdatedCall(next: CallRow) {
    const current = callRef.current;
    if (!current || current.id !== next.id) return;
    callRef.current = next;
    setShown(next);
    if (!isLive(next.status)) {
      if (next.status === 'missed' && next.callee_id === userId) setToast(`Пропущенный звонок: ${shownName || 'собеседник'}`);
      else if (next.status === 'declined') setToast('Звонок отклонён');
      else if (next.status === 'busy') setToast('Собеседник занят');
      cleanup();
      return;
    }
    if (next.status === 'active' && next.caller_id === userId && next.answer && pcRef.current && !answerPendingRef.current) {
      const pc = pcRef.current;
      if (pc.remoteDescription) return;
      answerPendingRef.current = true;
      try { await pc.setRemoteDescription(next.answer); await flushRemoteIce(); setPhase('connecting'); }
      catch (e) { setError(`Не удалось установить соединение: ${friendlyError(e)}`); void finish('failed'); }
      finally { answerPendingRef.current = false; }
    }
  }

  function presentIncoming(row: CallRow) {
    if (!userId || row.callee_id !== userId || callRef.current) return;
    if (row.status !== 'ringing' || Date.now() - Date.parse(row.created_at) > 59000) return;
    callRef.current = row; setShown(row); setShownName('Собеседник'); setPhase('incoming'); setError('');
    if (client) {
      void client.from('profiles').select('display_name').eq('id', row.caller_id).maybeSingle()
        .then(({ data }) => { if (callRef.current?.id === row.id && data?.display_name) setShownName(data.display_name); });
    }
    ringTimeoutRef.current = setTimeout(() => {
      if (callRef.current?.id === row.id && callRef.current?.status === 'ringing') cleanup();
    }, Math.max(1000, RING_TIMEOUT_MS - (Date.now() - Date.parse(row.created_at))));
  }

  useEffect(() => {
    if (!client || !userId) { cleanup(); return; }
    let active = true;
    const inbox = client.channel(`connect-calls-inbox-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'connect_calls', filter: `callee_id=eq.${userId}` },
        payload => { if (active) presentIncoming(payload.new as CallRow); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'connect_calls', filter: `caller_id=eq.${userId}` },
        payload => { if (active) void onUpdatedCall(payload.new as CallRow); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'connect_calls', filter: `callee_id=eq.${userId}` },
        payload => { if (active) void onUpdatedCall(payload.new as CallRow); })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refreshIncoming(); });
    async function refreshIncoming() {
      // A re-render can clear the session: guard inside the async callback too.
      if (!active || !client || !userId) return;
      const { data } = await client.from('connect_calls').select('*')
        .eq('callee_id', userId).eq('status', 'ringing')
        .gte('created_at', new Date(Date.now() - 59000).toISOString())
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (active && data) presentIncoming(data as CallRow);
      // An unanswered call is still visible after reopening the PWA.
      if (active && !data && !callRef.current) {
        const { data: lastMissed } = await client.from('connect_calls')
          .select('id').eq('callee_id', userId).eq('status', 'missed')
          .gte('created_at', new Date(Date.now() - 86400000).toISOString())
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (lastMissed?.id) {
          const key = 'connect-last-missed-audio-call:' + userId;
          try {
            if (localStorage.getItem(key) !== lastMissed.id) {
              localStorage.setItem(key, lastMissed.id);
              setToast('Пропущенный аудиозвонок');
            }
          } catch { /* Private browsing: show without persistent deduplication. */ }
        }
      }
      const existing = callRef.current;
      if (active && existing) {
        const { data: fresh } = await client.from('connect_calls').select('*').eq('id', existing.id).maybeSingle();
        if (fresh) void onUpdatedCall(fresh as CallRow);
      }
    }
    function visible() { if (document.visibilityState === 'visible') void refreshIncoming(); }
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visible);
      void client.removeChannel(inbox);
      cleanup();
    };
    // Subscription lifetime depends only on user identity, never on selected chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId]);

  useEffect(() => {
    if (phase !== 'active') return;
    const started = Date.parse(shown?.answered_at || '') || Date.now();
    const id = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000))), 1000);
    return () => clearInterval(id);
  }, [phase, shown?.answered_at]);

  async function startOutgoing() {
    if (!client || !userId || !conversationId || !peerId || callRef.current || phase !== 'idle') return;
    const generation = ++generationRef.current;
    setShownName(peerName); setError(''); setToast(''); setPhase('preparing');
    try {
      const pc = await createPeer();
      if (generation !== generationRef.current) { pc.close(); streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; return; }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const { data, error: rpcError } = await client.rpc('connect_start_audio_call', {
        p_conversation_id: conversationId, p_offer: pc.localDescription?.toJSON(),
      });
      if (rpcError || !data) throw new Error(rpcError?.message || 'Не удалось начать звонок');
      const row = data as CallRow;
      if (generation !== generationRef.current) {
        await client.rpc('connect_finish_audio_call', { p_call_id: row.id, p_reason: 'hangup' });
        return;
      }
      callRef.current = row; setShown(row); setPhase('ringing');
      watchIce(row.id); await flushLocalIce();
      ringTimeoutRef.current = setTimeout(() => {
        if (callRef.current?.id === row.id && callRef.current?.status === 'ringing') {
          setToast('Нет ответа'); void finish('missed');
        }
      }, RING_TIMEOUT_MS);
      // Catch an answer that arrived before the caller's subscription was ready.
      const { data: latest } = await client.from('connect_calls').select('*').eq('id', row.id).maybeSingle();
      if (latest) void onUpdatedCall(latest as CallRow);
    } catch (e) {
      const msg = friendlyError(e);
      cleanup(); setToast(msg.includes('duplicate key') ? 'В этом чате уже идёт звонок' : `Звонок не начат: ${msg}`);
    }
  }

  async function acceptIncoming() {
    const row = callRef.current;
    if (!row || !client || row.status !== 'ringing' || phase !== 'incoming') return;
    const generation = generationRef.current;
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    setError(''); setPhase('connecting');
    try {
      const pc = await createPeer();
      if (generation !== generationRef.current) { pc.close(); streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; return; }
      watchIce(row.id);
      await pc.setRemoteDescription(row.offer);
      await flushRemoteIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const { data, error: rpcError } = await client.rpc('connect_answer_audio_call', {
        p_call_id: row.id, p_answer: pc.localDescription?.toJSON(),
      });
      if (rpcError || !data) throw new Error(rpcError?.message || 'Звонок уже завершён');
      callRef.current = data as CallRow; setShown(data as CallRow);
      await flushLocalIce();
    } catch (e) {
      setToast(`Не удалось принять звонок: ${friendlyError(e)}`);
      void finish('failed');
    }
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  }
  function enableRemoteAudio() {
    void remoteAudioRef.current?.play().then(() => setError('')).catch(() => setError('Не удалось включить звук. Проверьте настройки Safari.'));
  }

  const calling = phase !== 'idle';
  const incoming = phase === 'incoming';
  const phaseTitle: Record<Phase, string> = {
    idle: '', preparing: 'Подключаем микрофон…', ringing: 'Вызываем…', incoming: 'Входящий аудиозвонок',
    connecting: 'Соединяем…', active: `Разговор · ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
  };

  return <>
    {header && userId && conversationId && peerId && createPortal(
      <button className="connect-call-trigger" type="button" aria-label={`Позвонить: ${peerName}`}
        disabled={calling} onClick={() => void startOutgoing()}><Glyph name="call"/></button>, header,
    )}
    {calling && <div className="connect-call-backdrop" role="dialog" aria-modal="true" aria-label="Аудиозвонок Connect">
      <div className="connect-call-modal">
        <p className="connect-call-eyebrow">CONNECT · АУДИО</p>
        <div className="connect-call-avatar">{initials(shownName)}</div>
        <h2>{shownName || 'Собеседник'}</h2>
        <p className="connect-call-info" role="status">{phaseTitle[phase]}</p>
        <div className="connect-call-actions">
          {incoming && <button className="connect-call-action accept" type="button" onClick={() => void acceptIncoming()}>
            <span><Glyph name="call"/></span><span>Принять</span>
          </button>}
          {!incoming && (phase === 'active' || phase === 'connecting') && <button className={'connect-call-action' + (muted ? ' muted' : '')}
            type="button" onClick={toggleMute}><span><Glyph name={muted ? 'muted' : 'mic'}/></span><span>{muted ? 'Включить микрофон' : 'Выключить микрофон'}</span></button>}
          {!incoming && <button className="connect-call-action" type="button" onClick={enableRemoteAudio}>
            <span><Glyph name="speaker"/></span><span>Звук</span>
          </button>}
          <button className="connect-call-action hangup" type="button"
            onClick={() => void finish(incoming ? 'decline' : 'hangup')}>
            <span><Glyph name="end"/></span><span>{incoming ? 'Отклонить' : 'Завершить'}</span>
          </button>
        </div>
        {error && <p className="connect-call-error" role="alert">{error}</p>}
        <p className="connect-call-note">Звонки работают при открытой PWA. В фоне iPhone может отключить микрофон.</p>
      </div>
    </div>}
    <audio ref={remoteAudioRef} className="connect-call-audio" autoPlay/>
    {!calling && toast && <button className="connect-call-missed" type="button" onClick={() => setToast('')} role="status">{toast} · Закрыть</button>}
  </>;
}
