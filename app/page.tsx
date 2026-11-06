'use client';

import ConnectNotificationSettings from '../components/ConnectNotificationSettings';
import { STICKER_PACKS, stickerFromBody, stickerBody, stickerUrl, type StickerPackId } from '../lib/stickers';
import { loadWallpaper, saveWallpaper, clearWallpaper } from '../lib/wallpaper';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';
import type { FormEvent, TouchEvent, KeyboardEvent as ReactKeyboardEvent, CSSProperties } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
// On the alternate DuckDNS domain, send Supabase HTTP traffic through Vercel.
// Keep the original Supabase URL for Realtime WebSockets and the primary domain.
const useSupabaseProxy = typeof window !== 'undefined' && window.location.hostname === 'connect-chat.duckdns.org';
const supabaseFetch: typeof fetch = (input, init) => {
  const original = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const proxied = useSupabaseProxy && original.startsWith(supabaseUrl + '/')
    ? window.location.origin + '/supabase/' + original.slice(supabaseUrl.length + 1)
    : original;
  // Preserve headers, method and body when the SDK passes a Request object.
  return fetch(input instanceof Request ? new Request(proxied, input) : proxied, init);
};
// Signed media URLs are used directly by <img>, <audio>, <video> and fetch().
// The SDK custom fetch cannot intercept those browser requests, so route them
// through the same-origin Vercel proxy on the DuckDNS domain as well.
function mediaUrl(url: string): string {
  if (!useSupabaseProxy || !url) return url;
  try {
    const parsed = new URL(url);
    const base = new URL(supabaseUrl);
    const storageHost = base.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co');
    if (parsed.hostname === base.hostname) {
      return window.location.origin + '/supabase' + parsed.pathname + parsed.search + parsed.hash;
    }
    if (parsed.hostname === storageHost) {
      return window.location.origin + '/supabase-storage' + parsed.pathname + parsed.search + parsed.hash;
    }
  } catch { /* Preserve unexpected URLs without breaking rendering. */ }
  return url;
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
      global: { fetch: supabaseFetch },
    })
  : null;

type AlbumItem = {path:string;name:string;kind:'image'|'video'};
const ALBUM_PREFIX = '[[connect-album:';
function parseAlbum(body:string):AlbumItem[] {
  const text=forwardedMessage(body).text;
  if(!text.startsWith(ALBUM_PREFIX)||!text.endsWith(']]'))return [];
  try {const v:unknown=JSON.parse(text.slice(ALBUM_PREFIX.length,-2));
    return Array.isArray(v)&&v.length>0&&v.length<=20&&v.every(x=>x&&typeof x.path==='string'&&typeof x.name==='string'&&(x.kind==='image'||x.kind==='video'))?v as AlbumItem[]:[];
  }catch{return []}
}
const MESSAGE_COLUMNS = 'id,conversation_id,sender_id,body,created_at,edited_at,deleted_at,reply_to,attachment_path,attachment_name,attachment_type,attachment_size,attachment_kind';
type Tab = 'chats' | 'contacts' | 'settings';
type SettingsPage = 'home' | 'appearance' | 'notifications' | 'stickers' | 'members' | 'data' | 'privacy' | 'about';
type CustomPack = {id:string;name:string;emoji:string;owner_id:string;is_public:boolean;created_at:string};
type CustomSticker = {id:string;pack_id:string;name:string;storage_path:string;position:number};
type Profile = { id: string; display_name: string; is_blocked: boolean; bio: string; avatar_path: string | null; last_seen_at: string | null; online_until: string | null };
type Conversation = { id: string; user_a: string; user_b: string; created_at: string };
type Message = {
  id: string; conversation_id: string; sender_id: string; body: string; created_at: string;
  edited_at: string | null; deleted_at: string | null; reply_to: string | null;
  attachment_path: string | null; attachment_name: string | null; attachment_type: string | null;
  attachment_size: number | null; attachment_kind: 'image' | 'video' | 'audio' | 'file' | null;
};
type Gesture = { id: string; x: number; y: number; dx: number; dy: number; timer: number | null; opened: boolean };
type IconName = 'chats' | 'contacts' | 'settings' | 'back' | 'search' | 'write' | 'send' | 'reply' |
  'edit' | 'copy' | 'trash' | 'close' | 'check' | 'moon' | 'sun' | 'logout' | 'shield' | 'info' | 'chevron' | 'arrow' | 'message' | 'camera' | 'user' | 'plus' | 'mic' | 'stop' | 'file' | 'play' | 'dots' | 'forward';

function Icon({ name, size = 22, stroke = 1.9 }: { name: IconName; size?: number; stroke?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, React.ReactNode> = {
    chats: <><path d="M20 11.4a7.5 7.5 0 0 1-7.9 7.5 8.2 8.2 0 0 1-3.3-.7L4 20l1.2-4.5A7.6 7.6 0 1 1 20 11.4Z"/></>,
    contacts: <><circle cx="12" cy="8" r="3.5"/><path d="M4.8 20v-1.4a7.2 7.2 0 0 1 14.4 0V20"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9.5 2.8-.5 2a8 8 0 0 0-1.8 1L5.3 5l-2 3.5 1.6 1.5a7.9 7.9 0 0 0 0 2.1l-1.6 1.5 2 3.5 1.9-.8a8 8 0 0 0 1.8 1l.5 2h5l.5-2a8 8 0 0 0 1.8-1l1.9.8 2-3.5-1.6-1.5a7.9 7.9 0 0 0 0-2.1l1.6-1.5-2-3.5-1.9.8a8 8 0 0 0-1.8-1l-.5-2z"/></>,
    back: <path d="m14.7 5-7 7 7 7"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 5 5"/></>,
    write: <><path d="M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="m12 12 8-8a2.1 2.1 0 0 0-3-3l-8 8-.8 3.8z"/></>,
    send: <><path d="m3.2 3.7 17.5 8.3-17.5 8.3 2.6-8.3z"/><path d="M5.8 12H20"/></>,
    reply: <><path d="M9.5 9 4 14l5.5 5"/><path d="M4 14h9c5 0 7 2 7 6"/></>,
    edit: <><path d="M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="m12 12 8-8a2.1 2.1 0 0 0-3-3l-8 8-.8 3.8z"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v6m4-6v6"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    check: <path d="m4 12 5.5 5.5L20 6"/>,
    moon: <path d="M20.4 15.8A8.7 8.7 0 0 1 8.2 3.6 8.7 8.7 0 1 0 20.4 15.8Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M13 8l4 4-4 4m4-4H9"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 11 2 2 4-4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    arrow: <path d="m5 12 14 0m-6-6 6 6-6 6"/>,
    camera: <><rect x="2" y="6" width="20" height="15" rx="3"/><circle cx="12" cy="13" r="4"/><path d="M7 6 9 3h6l2 3"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    plus: <path d="M12 4v16M4 12h16"/>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5m-4 0h8"/></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="3"/>,
    file: <><path d="M6 2h8l5 5v15H6zM14 2v5h5"/></>,
    play: <path d="m8 5 11 7-11 7z"/>,
    dots: <><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></>,
    forward: <><path d="M13 5l7 7-7 7M20 12H9a5 5 0 0 0-5 5v2"/></>,
    message: <><path d="M20 11.4a7.5 7.5 0 0 1-7.9 7.5 8.2 8.2 0 0 1-3.3-.7L4 20l1.2-4.5A7.6 7.6 0 1 1 20 11.4Z"/><path d="M8 11h8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

const avatarColors = ['#2369b1', '#985ab2', '#b56e48', '#327e89', '#6c73b7', '#599467'];
function Avatar({ name, id, size = 'md', url }: { name: string; id?: string; size?: 'sm' | 'md' | 'lg'; url?: string }) {
  let seed = 0; for (const char of id || name) seed += char.charCodeAt(0);
  const color = avatarColors[seed % avatarColors.length];
  return <span className={'person-avatar avatar-' + size} style={{ background: `linear-gradient(140deg,${color},#1b283d)` }} aria-hidden="true">{url ? <img src={url} alt="" loading="lazy"/> : (Array.from(name.trim())[0]?.toLocaleUpperCase('ru-RU') || '?')}</span>;
}
function timeLabel(iso: string) { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function listTimeLabel(iso: string) {
  const date = new Date(iso); const today = new Date();
  if (date.toDateString() === today.toDateString()) return timeLabel(iso);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function dayKey(iso:string){const d=new Date(iso);return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;}
function dayLabel(iso:string){
  const d=new Date(iso),now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
  if(dayKey(iso)===dayKey(now.toISOString()))return 'Сегодня';
  if(dayKey(iso)===dayKey(yesterday.toISOString()))return 'Вчера';
  return d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',...(d.getFullYear()!==now.getFullYear()?{year:'numeric' as const}:{})});
}
function formatPresence(p:{last_seen_at:string|null;online_until:string|null}|undefined,now:number){
  if(!p?.last_seen_at)return 'Не был(а) в сети';
  if(p.online_until && new Date(p.online_until).getTime()>now)return 'В сети';
  return 'Был(а) '+dayLabel(p.last_seen_at).toLocaleLowerCase('ru-RU')+' в '+timeLabel(p.last_seen_at);
}
function MessageChecks({delivered,read}:{delivered:boolean;read:boolean}){
  return <span className={'delivery-checks'+(read?' is-read':'')} aria-label={read?'Прочитано':delivered?'Доставлено':'Отправлено'}>
    <svg viewBox="0 0 22 16" width="19" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m2 8 4 4 7-8"/>{delivered&&<path d="m8 8 4 4 8-9"/>}</svg>
  </span>;
}
// Forwarding metadata is encoded in the body for compatibility with the current database schema.
const FORWARD_PREFIX = '[[connect-forward:';
function forwardedMessage(body: string): { from: string | null; text: string } {
  if (!body.startsWith(FORWARD_PREFIX)) return { from: null, text: body };
  const end = body.indexOf(']]\n', FORWARD_PREFIX.length);
  if (end < 0) return { from: null, text: body };
  try {
    const from = decodeURIComponent(body.slice(FORWARD_PREFIX.length, end));
    if (!from || from.length > 100) return { from: null, text: body };
    return { from, text: body.slice(end + 3) };
  } catch { return { from: null, text: body }; }
}
function forwardBody(from: string, body: string): string {
  return `${FORWARD_PREFIX}${encodeURIComponent(from.slice(0, 60))}]]\n${forwardedMessage(body).text}`;
}

function messagePreview(m?: Message, selfId?: string) {
  if (!m) return 'Начните переписку';
  return (m.sender_id === selfId ? 'Вы: ' : '') + (m.deleted_at ? 'Нет сообщений' : (parseAlbum(m.body).length ? `🖼 Альбом (${parseAlbum(m.body).length})` : stickerFromBody(forwardedMessage(m.body).text) ? 'Стикер' : forwardedMessage(m.body).text || ({image:'📷 Фото',video:'🎬 Видео',audio:'🎤 Голосовое сообщение',file:'📎 Файл'}[m.attachment_kind || 'file'])).replace(/\s+/g, ' '));
}


function voiceTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function VoicePlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [bars, setBars] = useState<number[]>(Array(43).fill(0.28));
  const [error, setError] = useState(false);
  const seeking = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let context: AudioContext | null = null;
    // Read actual audio samples to build the waveform, rather than decorative random bars.
    void (async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error('Audio unavailable');
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        context = new AudioContext();
        const decoded = await context.decodeAudioData(bytes);
        if (cancelled) return;
        const samples = decoded.getChannelData(0);
        const count = 43;
        const result = Array.from({ length: count }, (_, i) => {
          const start = Math.floor(i * samples.length / count);
          const end = Math.max(start + 1, Math.floor((i + 1) * samples.length / count));
          const stride = Math.max(1, Math.floor((end - start) / 140));
          let peak = 0;
          for (let j = start; j < end; j += stride) peak = Math.max(peak, Math.abs(samples[j] || 0));
          return peak;
        });
        const max = Math.max(0.001, ...result);
        setBars(result.map(value => Math.max(0.14, Math.min(1, Math.pow(value / max, 0.72)))));
        setDuration(current => current || decoded.duration);
      } catch { /* Browser may reject decoding; playback remains available. */ }
      finally { if (context) void context.close().catch(() => {}); }
    })();
    return () => { cancelled = true; controller.abort(); if (context) void context.close().catch(() => {}); };
  }, [src]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    // Only one voice message should play at a time.
    document.querySelectorAll<HTMLAudioElement>('audio[data-connect-voice]').forEach(other => {
      if (other !== audio) other.pause();
    });
    try { setError(false); await audio.play(); } catch { setError(true); }
  }
  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = fraction * audio.duration;
    setPosition(audio.currentTime);
  }
  function changeSpeed() {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  return <div className="voice-player" onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()} onContextMenu={e => e.stopPropagation()}>
    <audio ref={audioRef} data-connect-voice src={src} preload="metadata"
      onLoadedMetadata={e => { const d=e.currentTarget.duration; if(Number.isFinite(d))setDuration(d); }}
      onDurationChange={e => { const d=e.currentTarget.duration; if(Number.isFinite(d))setDuration(d); }}
      onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onEnded={() => {setPlaying(false);setPosition(0);}} onError={() => setError(true)}/>
    <button type="button" className="voice-play" onClick={e => {e.stopPropagation();void toggle();}} aria-label={playing ? 'Пауза' : 'Воспроизвести голосовое'}>
      {playing ? <span className="voice-pause-icon"/> : <Icon name="play" size={21}/>}
    </button>
    <div className="voice-content">
      <div className="voice-wave" role="slider" tabIndex={0} aria-label="Перемотка голосового сообщения" aria-valuemin={0} aria-valuemax={Math.max(0,Math.round(duration))} aria-valuenow={Math.round(position)}
        onPointerDown={e => {e.stopPropagation();seeking.current=true;e.currentTarget.setPointerCapture(e.pointerId);seek(e);}}
        onPointerMove={e => {if(seeking.current)seek(e);}}
        onPointerUp={e => {seeking.current=false;e.stopPropagation();}}
        onPointerCancel={() => {seeking.current=false;}}
        onKeyDown={e => {const audio=audioRef.current;if(!audio)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();audio.currentTime=Math.max(0,Math.min(duration,audio.currentTime+(e.key==='ArrowRight'?5:-5)));}}}>
        {bars.map((height,i) => <span key={i} className={'voice-bar'+(i / bars.length <= progress ? ' listened' : '')} style={{height:`${Math.round(4+height*22)}px`}}/>)}
      </div>
      <div className="voice-bottom"><span>{error ? 'Не удалось воспроизвести' : `${voiceTime(playing || position > 0 ? position : duration)}${playing || position > 0 ? ' / '+voiceTime(duration) : ''}`}</span><button type="button" className="voice-speed" onClick={e=>{e.stopPropagation();changeSpeed();}} aria-label="Скорость воспроизведения">{speed}×</button></div>
    </div>
  </div>;
}

type CropState = { file: File; url: string };
function AvatarCropper({ url, onCancel, onSave, saving }: { url: string; onCancel: () => void; onSave: (blob: Blob) => void; saving: boolean }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const offsetRef = useRef(offset); offsetRef.current = offset;
  const clamp = (x: number, y: number, z: number) => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return { x: 0, y: 0 };
    const base = Math.max(280 / img.naturalWidth, 280 / img.naturalHeight);
    const boundX = Math.max(0, (img.naturalWidth * base * z - 280) / 2);
    const boundY = Math.max(0, (img.naturalHeight * base * z - 280) / 2);
    return { x: Math.max(-boundX, Math.min(boundX, x)), y: Math.max(-boundY, Math.min(boundY, y)) };
  };
  function changeZoom(z: number) {
    const next = Math.max(1, Math.min(4, z));
    setZoom(next); setOffset(prev => clamp(prev.x, prev.y, next));
  }
  function moveStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) dragRef.current = { x: e.clientX, y: e.clientY, ox: offsetRef.current.x, oy: offsetRef.current.y };
    if (pointers.current.size === 2) {
      const [a,b] = Array.from(pointers.current.values());
      pinchRef.current = { distance: Math.hypot(a.x-b.x,a.y-b.y), zoom: zoomRef.current };
      dragRef.current = null;
    }
  }
  function move(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchRef.current) {
      const [a,b] = Array.from(pointers.current.values());
      changeZoom(pinchRef.current.zoom * Math.hypot(a.x-b.x,a.y-b.y) / Math.max(1,pinchRef.current.distance));
    } else if (dragRef.current && pointers.current.size === 1) {
      const d = dragRef.current;
      setOffset(clamp(d.ox + e.clientX-d.x, d.oy + e.clientY-d.y, zoomRef.current));
    }
  }
  function moveEnd(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId); dragRef.current = null; pinchRef.current = null;
  }
  async function save() {
    const img = imgRef.current;
    if (!img?.naturalWidth || saving) return;
    try {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas недоступен');
      const base = Math.max(280/img.naturalWidth, 280/img.naturalHeight);
      const width = img.naturalWidth*base*zoom*512/280;
      const height = img.naturalHeight*base*zoom*512/280;
      ctx.fillStyle='#fff';ctx.fillRect(0,0,512,512);
      ctx.drawImage(img,(512-width)/2+offset.x*512/280,(512-height)/2+offset.y*512/280,width,height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve,'image/jpeg',.88));
      if (!blob) throw new Error('Не удалось обработать фото');
      onSave(blob);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка обработки фото'); }
  }
  return <div className="avatar-crop-overlay" role="dialog" aria-modal="true" aria-label="Редактор аватара">
    <div className="avatar-crop-panel">
      <header><button type="button" onClick={onCancel} disabled={saving}>Отмена</button><strong>Фото профиля</strong><button type="button" disabled={!ready || saving} onClick={()=>void save()}>{saving?'Сохраняю…':'Готово'}</button></header>
      <p>Переместите фотографию, чтобы выбрать нужную область</p>
      <div className="avatar-crop-stage" onPointerDown={moveStart} onPointerMove={move} onPointerUp={moveEnd} onPointerCancel={moveEnd}>
        <img ref={imgRef} src={url} alt="Выбранное фото" draggable={false} onLoad={()=>setReady(true)} onError={()=>setError('Не удалось открыть изображение')} style={ready?{width:`${(imgRef.current?.naturalWidth||280)*Math.max(280/(imgRef.current?.naturalWidth||280),280/(imgRef.current?.naturalHeight||280))*zoom}px`,height:`${(imgRef.current?.naturalHeight||280)*Math.max(280/(imgRef.current?.naturalWidth||280),280/(imgRef.current?.naturalHeight||280))*zoom}px`,transform:`translate(calc(-50% + ${offset.x}px),calc(-50% + ${offset.y}px))`}:undefined}/>
        <div className="avatar-crop-mask" aria-hidden="true"/>
        <div className="avatar-crop-ring" aria-hidden="true"/>
      </div>
      <div className="avatar-crop-zoom"><span>−</span><input aria-label="Увеличение" type="range" min="1" max="4" step=".01" value={zoom} onChange={e=>changeZoom(Number(e.target.value))}/><span>+</span></div>
      <small>Можно увеличивать двумя пальцами. Сохраняется только выбранная область.</small>
      {error && <p className="avatar-crop-error">{error}</p>}
    </div>
  </div>;
}

function PendingAttachment({file,onRemove}:{file:File;onRemove:()=>void}){
  const [url,setUrl]=useState('');
  useEffect(()=>{if(!file.type.startsWith('image/')&&!file.type.startsWith('video/'))return;
    const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);
  },[file]);
  return <div className="connect-album-preview">
    {url?(file.type.startsWith('image/')?<img src={url} alt={file.name}/>:<video src={url} muted playsInline preload="metadata"/>):<span className="connect-file-placeholder">📎</span>}
    <span className="connect-album-filename" title={file.name}>{file.name}</span>
    <button type="button" onClick={onRemove} aria-label={`Убрать ${file.name}`}>×</button>
  </div>;
}

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [tab, setTab] = useState<Tab>('chats');
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('home');
  const [accent, setAccent] = useState('#087dff');
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const wallpaperInput = useRef<HTMLInputElement | null>(null);
  const [stickerPicker, setStickerPicker] = useState(false);
  const [stickerPack, setStickerPack] = useState<StickerPackId>('speed');
  const [enabledPacks, setEnabledPacks] = useState<StickerPackId[]>(STICKER_PACKS.map(p=>p.id));
  const [stickerFavorites, setStickerFavorites] = useState<string[]>([]);
  const [stickerRecent, setStickerRecent] = useState<string[]>([]);
  const [customPacks,setCustomPacks] = useState<CustomPack[]>([]);
  const [customStickers,setCustomStickers] = useState<CustomSticker[]>([]);
  const [customStickerUrls,setCustomStickerUrls] = useState<Record<string,string>>({});
  const [customPack,setCustomPack] = useState<string>('');
  const [packName,setPackName] = useState('');
  const [packEmoji,setPackEmoji] = useState('🎨');
  const [packPublic,setPackPublic] = useState(false);
  const [inviteEmail,setInviteEmail] = useState('');
  const [inviteLink,setInviteLink] = useState('');
  const [admin,setAdmin] = useState(false);
  const stickerFileInput=useRef<HTMLInputElement|null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState(''); const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string,string>>({});
  const [profileView, setProfileView] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [clearedChats, setClearedChats] = useState<Record<string,string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [latest, setLatest] = useState<Record<string, Message>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typing, setTyping] = useState(false);
  const [peerRecording, setPeerRecording] = useState(false);
  const [peerStates, setPeerStates] = useState<Record<string,{delivered:string|null;read:string|null}>>({});
  const [presence, setPresence] = useState<Record<string,{last_seen_at:string|null;online_until:string|null}>>({});
  const [clock, setClock] = useState(Date.now());
  const [draft, setDraft] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string,string>>({});
  const [mediaViewer, setMediaViewer] = useState<{url:string;path:string;name:string;kind:'image'|'video'} | null>(null);
  const mediaTouchStart = useRef<{x:number;y:number}|null>(null);
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [pendingFiles,setPendingFiles]=useState<File[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const attachmentInput = useRef<HTMLInputElement | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const recordingStream = useRef<MediaStream | null>(null);
  const recordInterval = useRef<number | null>(null);
  const recordingChat = useRef<string | null>(null);
  const recordingStarted = useRef(0);
  const recordingFinalizing = useRef(false);
  const recordingSend = useRef<((send:boolean)=>void)|null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [chatActions, setChatActions] = useState(false);
  const [listActions, setListActions] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [searchPosition, setSearchPosition] = useState(0);
  const [forwardIds, setForwardIds] = useState<string[]>([]);
  const [hiddenMessages, setHiddenMessages] = useState<string[]>([]);
  const listHold = useRef<{timer:number|null,x:number,y:number,opened:boolean}|null>(null);
  const [menuTop, setMenuTop] = useState(150);
  const [menuSide, setMenuSide] = useState<'left'|'right'>('left');
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [search, setSearch] = useState('');
  const [frame, setFrame] = useState<{ height: number; top: number } | null>(null);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const activeChatRef = useRef<string | null>(null);
  const readCache = useRef<Record<string, string>>({});
  const deliveredCache = useRef<Record<string, string>>({});
  const lastKeypress = useRef(0); const lastTypingSent = useRef(0);
  const previousLast = useRef(''); const stickToBottom = useRef(true);
  const invited = typeof window !== 'undefined' && /type=(invite|recovery)/.test(window.location.hash + window.location.search);

  useEffect(() => { try { if (localStorage.getItem('connect-theme') === 'light') setTheme('light'); } catch { /* Private browsing */ } }, []);
  useEffect(() => {
    try {
      const color = localStorage.getItem('connect-accent');
      if (color && /^#[0-9a-f]{6}$/i.test(color)) setAccent(color);
      const packs = JSON.parse(localStorage.getItem('connect-sticker-packs') || 'null');
      if (Array.isArray(packs)) setEnabledPacks(STICKER_PACKS.map(p=>p.id).filter(id=>packs.includes(id)));
      const favorites = JSON.parse(localStorage.getItem('connect-sticker-favorites') || '[]');
      if (Array.isArray(favorites)) setStickerFavorites(favorites.filter((x): x is string => typeof x === 'string').slice(0,100));
      const recent = JSON.parse(localStorage.getItem('connect-sticker-recent') || '[]');
      if (Array.isArray(recent)) setStickerRecent(recent.filter((x): x is string => typeof x === 'string').slice(0,30));
    } catch { /* storage unavailable */ }
    void loadWallpaper().then(setWallpaper).catch(()=>{});
  }, []);
  function changeAccent(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    setAccent(color); try { localStorage.setItem('connect-accent', color); } catch {}
  }
  function togglePack(id: StickerPackId) {
    setEnabledPacks(prev=>{const next=prev.includes(id)?prev.filter(x=>x!==id):[...prev,id];try{localStorage.setItem('connect-sticker-packs',JSON.stringify(next));}catch{}return next;});
  }
  function toggleFavorite(key: string) {
    setStickerFavorites(prev=>{const next=prev.includes(key)?prev.filter(x=>x!==key):[key,...prev].slice(0,100);try{localStorage.setItem('connect-sticker-favorites',JSON.stringify(next));}catch{}return next;});
  }
  async function changeWallpaper(file: File) {
    if (!file.type.startsWith('image/') || file.size>12*1024*1024) {setNotice('Выберите изображение до 12 МБ');return;}
    try { const url=await saveWallpaper(file);setWallpaper(url);setNotice('Фон чатов сохранён на этом устройстве'); }
    catch {setNotice('Не удалось сохранить фон. Попробуйте изображение поменьше');}
  }
  async function removeWallpaper() {await clearWallpaper();setWallpaper(null);}
  function clearLocalPreferences() {
    if (!window.confirm('Сбросить оформление, избранные стикеры и фон на этом устройстве? Переписки на сервере останутся.')) return;
    for (const key of ['connect-theme','connect-accent','connect-sticker-packs','connect-sticker-favorites','connect-sticker-recent']) try{localStorage.removeItem(key);}catch{}
    setTheme('dark');setAccent('#087dff');setEnabledPacks(STICKER_PACKS.map(p=>p.id));setStickerFavorites([]);setStickerRecent([]);
    void removeWallpaper();setNotice('Локальные настройки сброшены');
  }
  async function exportChats() {
    if (!supabase || !user || busy) return;
    setBusy(true);
    try {
      const ids=conversations.filter(c=>c.user_a===user.id||c.user_b===user.id).map(c=>c.id);
      if (!ids.length){setNotice('Нет переписок для экспорта');return;}
      const all:Message[]=[];
      for (let offset=0;offset<50000;offset+=500) {
        const {data,error}=await supabase.from('messages').select(MESSAGE_COLUMNS).in('conversation_id',ids).order('created_at',{ascending:true}).range(offset,offset+499);
        if (error) throw error;
        all.push(...(data||[]) as Message[]);
        if (!data || data.length<500) break;
      }
      const payload={exported_at:new Date().toISOString(),account_id:user.id,conversations,messages:all};
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='connect-chats-export.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      if(all.length>=50000)setNotice('Экспорт ограничен 50 000 сообщений');
    } catch {setNotice('Не удалось экспортировать переписки');}
    finally {setBusy(false);}
  }
  async function sendSticker(pack: StickerPackId, id: string) {
    if (!supabase || !user || !activeChat || busy) return;
    const body=stickerBody(pack,id);if (!stickerFromBody(body)) return;
    setBusy(true);setNotice('');
    const {data,error}=await supabase.from('messages').insert({conversation_id:activeChat,sender_id:user.id,body,reply_to:replyTo?.id||null}).select(MESSAGE_COLUMNS).single();
    setBusy(false);
    if (error || !data){setNotice('Не удалось отправить стикер: '+(error?.message||'Ошибка'));return;}
    setReplyTo(null);setStickerPicker(false);
    const key=pack+':'+id;
    setStickerRecent(prev=>{const next=[key,...prev.filter(x=>x!==key)].slice(0,30);try{localStorage.setItem('connect-sticker-recent',JSON.stringify(next));}catch{}return next;});
    const m=data as Message;setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);setLatest(prev=>({...prev,[activeChat]:m}));
    requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;});
  }
  function changeTheme(next: 'dark' | 'light') { setTheme(next); try { localStorage.setItem('connect-theme', next); } catch { /* no storage */ } }

  // The visual viewport shrinks when the iPhone keyboard appears. Keep the composer
  // inside it instead of moving the entire page (which caused the previous iOS bug).
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setFrame({ height: vv.height, top: vv.offsetTop });
    update(); vv.addEventListener('resize', update); vv.addEventListener('scroll', update);
    window.addEventListener('orientationchange', update);
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); window.removeEventListener('orientationchange', update); };
  }, []);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => {
    if (!user) { setClearedChats({}); return; }
    try { const raw=localStorage.getItem('connect-cleared-chats:'+user.id); setClearedChats(raw?JSON.parse(raw):{}); } catch { setClearedChats({}); }
  }, [user?.id]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setUser(data.session?.user || null); setLoading(false);
      if (error) setNotice(error.message);
      if (invited && data.session) setSetup(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      setUser(session?.user || null); setLoading(false);
      if (event === 'PASSWORD_RECOVERY' || (invited && session)) setSetup(true);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [invited]);

  async function authenticatedRequest(path:string,body?:object){
    if(!supabase)throw new Error('Нет соединения');
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error('Сначала войдите в аккаунт');
    const res=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const json=await res.json().catch(()=>({error:'Ошибка ответа сервера'}));
    if(!res.ok)throw new Error(json.error||'Ошибка сервера');
    return json;
  }
  const loadCustomStickers=useCallback(async()=>{
    if(!supabase||!user)return;
    const packs=await supabase.from('connect_sticker_packs').select('id,name,emoji,owner_id,is_public,created_at').order('created_at',{ascending:false});
    if(packs.error)return;
    const list=(packs.data||[]) as CustomPack[];
    setCustomPacks(list);
    if(!list.length){setCustomStickers([]);return;}
    const stickers=await supabase.from('connect_stickers').select('id,pack_id,name,storage_path,position').in('pack_id',list.map(p=>p.id)).order('position');
    if(!stickers.error){
      const items=(stickers.data||[]) as CustomSticker[];setCustomStickers(items);
      const urls:Record<string,string>={};
      await Promise.all(items.map(async st=>{const {data}=await supabase!.storage.from('connect-stickers').createSignedUrl(st.storage_path,3600);if(data?.signedUrl)urls[st.id]=mediaUrl(data.signedUrl)}));
      setCustomStickerUrls(urls);
    }
  },[user?.id]);
  useEffect(()=>{void loadCustomStickers()},[loadCustomStickers]);
  useEffect(()=>{if(user)void authenticatedRequest('/api/admin/invite').then(r=>setAdmin(Boolean(r.admin))).catch(()=>setAdmin(false));else setAdmin(false)},[user?.id]);
  async function createCustomPack(){
    if(!supabase||!user||!packName.trim()||busy)return;
    setBusy(true);
    const {error}=await supabase.from('connect_sticker_packs').insert({name:packName.trim().slice(0,60),emoji:packEmoji.slice(0,8)||'🎨',owner_id:user.id,is_public:packPublic});
    setBusy(false);if(error)setNotice('Не удалось создать набор: '+error.message);else{setPackName('');await loadCustomStickers();setNotice('Набор создан');}
  }
  async function uploadCustomStickers(files:FileList|null){
    if(!supabase||!user||!customPack||!files?.length||busy)return;
    const pack=customPacks.find(p=>p.id===customPack);
    if(!pack||pack.owner_id!==user.id)return;
    setBusy(true);
    try{
      for(const file of Array.from(files).slice(0,30)){
        if(!['image/png','image/webp','image/gif'].includes(file.type)||file.size>2*1024*1024)throw new Error('PNG, WebP или GIF до 2 МБ');
        const ext=file.type==='image/png'?'png':file.type==='image/gif'?'gif':'webp';
        const path=`${user.id}/${pack.id}/${crypto.randomUUID()}.${ext}`;
        const up=await supabase.storage.from('connect-stickers').upload(path,file,{contentType:file.type,upsert:false});
        if(up.error)throw up.error;
        const insert=await supabase.from('connect_stickers').insert({pack_id:pack.id,name:file.name.replace(/\.[^.]+$/,'').slice(0,60),storage_path:path});
        if(insert.error){await supabase.storage.from('connect-stickers').remove([path]);throw insert.error;}
      }
      await loadCustomStickers();setNotice('Стикеры добавлены');
    }catch(e){setNotice('Не удалось загрузить: '+(e instanceof Error?e.message:'Ошибка'));}
    finally{setBusy(false);if(stickerFileInput.current)stickerFileInput.current.value='';}
  }
  async function deleteCustomSticker(st:CustomSticker){
    if(!supabase||!user||!window.confirm('Удалить этот стикер из набора?'))return;
    const r=await supabase.from('connect_stickers').delete().eq('id',st.id);
    if(r.error){setNotice(r.error.message);return;}
    await supabase.storage.from('connect-stickers').remove([st.storage_path]);await loadCustomStickers();
  }
  async function deleteCustomPack(pack:CustomPack){
    if(!supabase||!window.confirm(`Удалить набор «${pack.name}»?`))return;
    const stickers=customStickers.filter(st=>st.pack_id===pack.id);
    const r=await supabase.from('connect_sticker_packs').delete().eq('id',pack.id);
    if(r.error){setNotice(r.error.message);return;}
    if(stickers.length)await supabase.storage.from('connect-stickers').remove(stickers.map(st=>st.storage_path));
    setCustomPack('');await loadCustomStickers();
  }
  function customStickerUrl(st:CustomSticker){return customStickerUrls[st.id]||''}
  async function sendCustomSticker(st:CustomSticker){
    if(!supabase||!user||!activeChat||busy)return;
    setBusy(true);
    const {error}=await supabase.from('messages').insert({conversation_id:activeChat,sender_id:user.id,body:`[[connect-custom-sticker:${st.id}]]`,reply_to:replyTo?.id||null});
    setBusy(false);if(error)setNotice(error.message);else{setStickerPicker(false);setReplyTo(null);}
  }
  async function inviteMember(){
    if(!inviteEmail.trim()||busy)return;
    setBusy(true);setInviteLink('');
    try{const r=await authenticatedRequest('/api/admin/invite',{email:inviteEmail.trim()});setInviteLink(r.link);setNotice('Ссылка создана. Отправьте её приглашённому.');}
    catch(e){setNotice(e instanceof Error?e.message:'Ошибка приглашения');}finally{setBusy(false);}
  }
  async function deleteMyAccount(){
    if(!user||busy)return;
    if(!window.confirm('Удалить аккаунт навсегда? Вы исчезнете из контактов, а отправленные сообщения сохранятся у собеседников под именем «Удалённый пользователь».'))return;
    const answer=window.prompt('Для подтверждения напишите УДАЛИТЬ');
    if(answer!=='УДАЛИТЬ')return;
    const pass=window.prompt('Введите текущий пароль для подтверждения');
    if(!pass)return;
    setBusy(true);
    try{await authenticatedRequest('/api/account/delete',{password:pass});await logout();setNotice('Аккаунт удалён');}
    catch(e){setNotice(e instanceof Error?e.message:'Не удалось удалить аккаунт');}
    finally{setBusy(false);}
  }
  const loadDirectory = useCallback(async () => {
    if (!supabase || !user) return;
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('id,display_name,is_blocked,bio,avatar_path,last_seen_at,online_until'),
      supabase.from('conversations').select('id,user_a,user_b,created_at').order('created_at', { ascending: false }),
    ]);
    if (p.error) setNotice(p.error.message); else {
      const directory = (p.data || []) as Profile[];
      setProfiles(directory);
      setPresence(Object.fromEntries(directory.map(p=>[p.id,{last_seen_at:p.last_seen_at,online_until:p.online_until}])));
      const urls: Record<string,string> = {};
      await Promise.all(directory.filter(x=>x.avatar_path).map(async x => {
        const { data } = await supabase.storage.from('connect-avatars').createSignedUrl(x.avatar_path!, 3600);
        if (data?.signedUrl) urls[x.id] = mediaUrl(data.signedUrl);
      }));
      setAvatarUrls(urls);
    }
    if (c.error) setNotice(c.error.message); else setConversations((c.data || []) as Conversation[]);
  }, [user?.id]);
  useEffect(() => { void loadDirectory(); }, [loadDirectory]);
  useEffect(()=>{
    if(!user)return;
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void loadDirectory()},60000);
    const refresh=()=>{if(document.visibilityState==='visible'){void loadDirectory();void loadCustomStickers()}};
    document.addEventListener('visibilitychange',refresh);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',refresh)};
  },[user?.id,loadDirectory,loadCustomStickers]);

  useEffect(()=>{
    if(!supabase || !user) return;
    let active=true;
    const pulse=async(online:boolean)=>{
      if(!active)return;
      const now=new Date();
      const {error}=await supabase.from('profiles').update({
        last_seen_at:now.toISOString(),
        online_until:online?new Date(now.getTime()+45000).toISOString():now.toISOString()
      }).eq('id',user.id);
      if(error) console.error('Presence:',error.message);
    };
    const onVisibility=()=>{void pulse(document.visibilityState==='visible');};
    void pulse(document.visibilityState==='visible');
    const interval=window.setInterval(()=>{setClock(Date.now());if(document.visibilityState==='visible')void pulse(true);},15000);
    document.addEventListener('visibilitychange',onVisibility);
    window.addEventListener('pagehide',()=>{ /* lease expires if browser is killed */ },{once:true});
    return()=>{active=false;window.clearInterval(interval);document.removeEventListener('visibilitychange',onVisibility);};
  },[user?.id]);

  const markDelivered = useCallback(async (id:string, iso:string)=>{
    if(!supabase || !user || document.visibilityState!=='visible')return;
    if(deliveredCache.current[id] && deliveredCache.current[id]>=iso)return;
    deliveredCache.current[id]=iso;
    const {error}=await supabase.from('conversation_user_state').upsert(
      {conversation_id:id,user_id:user.id,last_delivered_at:iso},
      {onConflict:'conversation_id,user_id'}
    );
    if(error){delete deliveredCache.current[id];console.error('Delivery:',error.message);}
  },[user?.id]);

  const markRead = useCallback(async (id: string, iso: string) => {
    if (!supabase || !user || document.visibilityState!=='visible') return;
    if (readCache.current[id] && readCache.current[id] >= iso) return;
    readCache.current[id] = iso;
    setUnread(prev => prev[id] ? { ...prev, [id]: 0 } : prev);
    const { error } = await supabase.from('conversation_user_state').upsert(
      { conversation_id: id, user_id: user.id, last_read_at: iso },
      { onConflict: 'conversation_id,user_id' },
    );
    if (error) console.error('Read receipt:', error.message);
  }, [user?.id]);

  const updateTyping = useCallback(async (id: string, value: boolean) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('conversation_user_state').upsert(
      { conversation_id: id, user_id: user.id, typing_until: value ? new Date(Date.now() + 6000).toISOString() : null },
      { onConflict: 'conversation_id,user_id' },
    );
    if (error) console.error('Typing:', error.message);
  }, [user?.id]);

  const updateRecording = useCallback(async (id:string, value:boolean) => {
    if (!supabase || !user) return;
    const {error}=await supabase.from('conversation_user_state').upsert({
      conversation_id:id,user_id:user.id,
      recording_until:value?new Date(Date.now()+8000).toISOString():null,
    },{onConflict:'conversation_id,user_id'});
    if(error) console.error('Recording indicator:',error.message);
  },[user?.id]);

  // Realtime has a 3s polling fallback for mobile Safari when WebSockets are suspended.
  useEffect(() => {
    if (!supabase || !user) return;
    let alive = true;
    const refresh = async () => {
      if (!alive || document.visibilityState === 'hidden') return;
      const [msgResult, statesResult] = await Promise.all([
        supabase.from('messages').select(MESSAGE_COLUMNS).order('created_at', { ascending: false }).limit(1000),
        supabase.from('conversation_user_state').select('conversation_id,user_id,last_read_at,last_delivered_at,typing_until,recording_until'),
      ]);
      if (!alive) return;
      if (msgResult.error || statesResult.error) { setNotice(msgResult.error?.message || statesResult.error?.message || 'Ошибка обновления'); return; }
      const recent = (msgResult.data || []) as Message[];
      const states = statesResult.data || [];
      setPeerStates(Object.fromEntries(states.filter(st=>st.user_id!==user.id).map(st=>[st.conversation_id,{delivered:st.last_delivered_at,read:st.last_read_at}])));
      const {data:seenProfiles}=await supabase.from('profiles').select('id,last_seen_at,online_until');
      if(alive && seenProfiles)setPresence(Object.fromEntries(seenProfiles.map(p=>[p.id,{last_seen_at:p.last_seen_at,online_until:p.online_until}])));
      const newest: Record<string, Message> = {}; const counts: Record<string, number> = {};
      const serverRead: Record<string, string> = {};
      for (const row of states) if (row.user_id === user.id) serverRead[row.conversation_id] = row.last_read_at;
      for (const [id, at] of Object.entries(serverRead)) if (!readCache.current[id] || readCache.current[id] < at) readCache.current[id] = at;
      const current = activeChatRef.current;
      setTyping(Boolean(current && states.some(st => st.conversation_id === current && st.user_id !== user.id && st.typing_until && new Date(st.typing_until).getTime() > Date.now())));
      setPeerRecording(Boolean(current && states.some(st => st.conversation_id === current && st.user_id !== user.id && st.recording_until && new Date(st.recording_until).getTime() > Date.now())));
      for (const m of recent) {
        if (!newest[m.conversation_id]) newest[m.conversation_id] = m;
        if (m.conversation_id !== current && m.sender_id !== user.id && m.created_at > (readCache.current[m.conversation_id] || '')) counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
      }
      setLatest(newest); setUnread(counts);
      const deliveredByChat:Record<string,string>={};
      for(const m of recent)if(m.sender_id!==user.id && (!deliveredByChat[m.conversation_id] || deliveredByChat[m.conversation_id]<m.created_at))deliveredByChat[m.conversation_id]=m.created_at;
      for(const [id,iso] of Object.entries(deliveredByChat))void markDelivered(id,iso);
    };
    void refresh(); const interval = window.setInterval(() => { void refresh(); }, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') { void refresh(); void loadDirectory(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [user?.id, loadDirectory, markDelivered]);

  useEffect(() => {
    if (!supabase || !activeChat || !user) return;
    let alive = true;
    setMessages([]); setTyping(false); setPeerRecording(false); setMenuMessage(null);
    previousLast.current = ''; stickToBottom.current = true;
    const id = activeChat;
    void supabase.from('conversation_user_state').upsert({ conversation_id: id, user_id: user.id }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
    const refresh = async () => {
      if (!alive || document.visibilityState === 'hidden') return;
      const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(500);
      if (!alive) return;
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as Message[]).reverse();
      setMessages(prev => prev.length === incoming.length && prev.every((m, i) =>
        m.id === incoming[i].id && m.body === incoming[i].body && m.edited_at === incoming[i].edited_at && m.deleted_at === incoming[i].deleted_at && m.attachment_path === incoming[i].attachment_path
      ) ? prev : incoming);
      const last = incoming.at(-1); if (last) void markRead(id, last.created_at);
    };
    void refresh();
    const channel = supabase.channel('connect-chat-' + id).on('postgres_changes', {
      event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + id,
    }, payload => {
      if (!alive || payload.eventType === 'DELETE') return;
      const m = payload.new as Message;
      if (!m?.id) return;
      setMessages(prev => {
        const exists = prev.some(x => x.id === m.id);
        return exists ? prev.map(x => x.id === m.id ? m : x) : [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      if (payload.eventType === 'INSERT') void markRead(id, m.created_at);
    }).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [activeChat, user?.id, markRead]);

  useEffect(() => {
    if (!activeChat || !messages.length) return;
    const last = messages[messages.length - 1];
    void markRead(activeChat, last.created_at);
    if (previousLast.current === last.id) return; // edits/deletions do not force a scroll
    const initial = previousLast.current === '';
    previousLast.current = last.id;
    const shouldScroll = initial || stickToBottom.current || last.sender_id === user?.id;
    if (shouldScroll) requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) { el.scrollTop = el.scrollHeight; stickToBottom.current = true; }
    });
  }, [activeChat, messages, user?.id, markRead]);
  function trackScroll() {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 110;
  }

  function changeDraft(value: string) {
    setDraft(value); if (!activeChat) return;
    const now = Date.now(); lastKeypress.current = now;
    if (value.trim() && now - lastTypingSent.current > 1500) { lastTypingSent.current = now; void updateTyping(activeChat, true); }
    if (!value.trim()) void updateTyping(activeChat, false);
  }
  useEffect(() => {
    if (!activeChat || !user) return;
    const id = activeChat;
    const interval = window.setInterval(() => {
      if (lastKeypress.current && Date.now() - lastKeypress.current < 3500) void updateTyping(id, true);
      else if (lastKeypress.current) { lastKeypress.current = 0; void updateTyping(id, false); }
    }, 2000);
    return () => { window.clearInterval(interval); lastKeypress.current = 0; void updateTyping(id, false); };
  }, [activeChat, user?.id, updateTyping]);

  const ownProfile = profiles.find(p=>p.id===user?.id);
  const viewedProfile = profiles.find(p=>p.id===profileView);
  function showProfile(id: string) {
    const p=profiles.find(x=>x.id===id); if(!p) return;
    setProfileView(id); setEditName(p.display_name); setEditBio(p.bio || ''); setMenuMessage(null);
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault(); if(!supabase || !user || !ownProfile || busy) return;
    const name=editName.trim();
    if(name.length<1 || name.length>60 || editBio.length>160){setNotice('Имя: 1–60 символов; о себе: до 160');return;}
    setBusy(true);
    const {error}=await supabase.from('profiles').update({display_name:name,bio:editBio.trim()}).eq('id',user.id);
    setBusy(false);
    if(error){setNotice('Не удалось сохранить: '+error.message);return;}
    setProfiles(prev=>prev.map(p=>p.id===user.id?{...p,display_name:name,bio:editBio.trim()}:p));
    setNotice('Профиль сохранён');
  }
  function selectAvatar(file?: File) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {setNotice('Выберите JPG, PNG или WebP');return;}
    const url = URL.createObjectURL(file);
    setCrop(prev=>{if(prev) URL.revokeObjectURL(prev.url);return {file,url};});
  }
  function closeCrop() {setCrop(prev=>{if(prev)URL.revokeObjectURL(prev.url);return null;});}
  async function uploadAvatar(file?: File) {
    if(!file || !supabase || !user || busy) return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>2*1024*1024){setNotice('Выберите JPG, PNG или WebP до 2 МБ');return;}
    setBusy(true);
    const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
    const path=`${user.id}/avatar-${Date.now()}.${ext}`;
    const uploaded=await supabase.storage.from('connect-avatars').upload(path,file,{contentType:file.type,upsert:false});
    if(uploaded.error){setBusy(false);setNotice('Ошибка загрузки: '+uploaded.error.message);return;}
    const updated=await supabase.from('profiles').update({avatar_path:path}).eq('id',user.id);
    if(updated.error){setBusy(false);setNotice('Не удалось сохранить аватар: '+updated.error.message);return;}
    const signed=await supabase.storage.from('connect-avatars').createSignedUrl(path,3600);
    if(signed.data?.signedUrl)setAvatarUrls(prev=>({...prev,[user.id]:mediaUrl(signed.data!.signedUrl)}));
    setProfiles(prev=>prev.map(p=>p.id===user.id?{...p,avatar_path:path}:p));
    setBusy(false);setNotice('Аватар обновлён'); closeCrop();
  }
  const contacts = profiles.filter(p => !p.is_blocked && p.id !== user?.id);
  const chats = conversations.filter(c => !clearedChats[c.id] || (latest[c.id] && latest[c.id].created_at > clearedChats[c.id])).map(c => ({
    ...c,
    other: profiles.find(p => p.id === (c.user_a === user?.id ? c.user_b : c.user_a)),
    last: latest[c.id], count: unread[c.id] || 0,
  })).sort((a, b) => (b.last?.created_at || b.created_at).localeCompare(a.last?.created_at || a.created_at));
  const visibleMessages=messages.filter(m=>!m.deleted_at && !hiddenMessages.includes(m.id) && (!activeChat || !clearedChats[activeChat] || m.created_at>clearedChats[activeChat]));
  const searchMatches=chatQuery.trim()?visibleMessages.filter(m=>m.body.toLocaleLowerCase('ru-RU').includes(chatQuery.trim().toLocaleLowerCase('ru-RU'))):[];
  function showMatch(index:number){if(!searchMatches.length)return;const i=(index+searchMatches.length)%searchMatches.length;setSearchPosition(i);requestAnimationFrame(()=>document.getElementById('msg-'+searchMatches[i].id)?.scrollIntoView({behavior:'smooth',block:'center'}));}
  function highlightMessage(body:string){if(!chatSearchOpen||!chatQuery.trim())return body;const i=body.toLocaleLowerCase('ru-RU').indexOf(chatQuery.trim().toLocaleLowerCase('ru-RU'));return i<0?body:<>{body.slice(0,i)}<mark className="chat-search-mark">{body.slice(i,i+chatQuery.trim().length)}</mark>{body.slice(i+chatQuery.trim().length)}</>;}
  useEffect(()=>{if(!user)return;try{setHiddenMessages(JSON.parse(localStorage.getItem('connect-hidden-messages:'+user.id)||'[]'));}catch{setHiddenMessages([])}},[user?.id]);
  function hideMessages(ids:string[]){if(!user)return;const next=Array.from(new Set([...hiddenMessages,...ids]));setHiddenMessages(next);try{localStorage.setItem('connect-hidden-messages:'+user.id,JSON.stringify(next))}catch{}setSelectedIds([]);setSelectionMode(false);setMenuMessage(null);}
  function beginForward(ids:string[]){setForwardIds(ids);setMenuMessage(null);setChatActions(false);}
  async function forwardTo(contact:Profile) {
    if (!supabase || !user || busy) return;
    const items = visibleMessages.filter(m => forwardIds.includes(m.id));
    if (!items.length) { setForwardIds([]); return; }
    setBusy(true);
    try {
      let chat = conversations.find(c => (c.user_a === user.id && c.user_b === contact.id) || (c.user_b === user.id && c.user_a === contact.id));
      if (!chat) {
        const [a,b] = [user.id, contact.id].sort();
        const {data,error} = await supabase.from('conversations').upsert({user_a:a,user_b:b},{onConflict:'user_a,user_b'}).select('id,user_a,user_b,created_at').single();
        if (error || !data) throw error || new Error('Не удалось открыть чат');
        chat = data as Conversation;
        setConversations(prev => [chat!, ...prev]);
      }
      let count = 0;
      for (const m of items) {
        const original = forwardedMessage(m.body);
        const senderName = original.from || profiles.find(p => p.id === m.sender_id)?.display_name || (m.sender_id === user.id ? ownProfile?.display_name : null) || 'Пользователь';
        let path: string | null = null;
        if (m.attachment_path) {
          // The DB constraint requires every attachment path to start with
          // the destination conversation ID and the forwarding user's ID.
          path = `${chat.id}/${user.id}/${crypto.randomUUID()}`;
          const bucket = supabase.storage.from('connect-attachments');
          const copied = await bucket.copy(m.attachment_path, path);
          if (copied.error) {
            // Some Storage policies allow signed downloads and uploads but not copy.
            // Use that path for small attachments; large files need server-side copy permission.
            if (!m.attachment_size || m.attachment_size > 6 * 1024 * 1024) throw new Error('Не удалось скопировать вложение: ' + copied.error.message);
            const downloaded = await bucket.download(m.attachment_path);
            if (downloaded.error || !downloaded.data) throw new Error('Не удалось прочитать вложение: ' + (downloaded.error?.message || 'Ошибка'));
            const uploaded = await bucket.upload(path, downloaded.data, {contentType:m.attachment_type || 'application/octet-stream', upsert:false});
            if (uploaded.error) throw new Error('Не удалось загрузить вложение: ' + uploaded.error.message);
          }
        }
        const {error} = await supabase.from('messages').insert({
          conversation_id:chat.id, sender_id:user.id,
          body:forwardBody(senderName, original.text),
          attachment_path:path, attachment_name:path ? m.attachment_name : null,
          attachment_type:path ? m.attachment_type : null,
          attachment_size:path ? m.attachment_size : null,
          attachment_kind:path ? m.attachment_kind : null,
        });
        if (error) {
          if (path) await supabase.storage.from('connect-attachments').remove([path]);
          throw error;
        }
        count++;
      }
      setForwardIds([]); setSelectedIds([]); setSelectionMode(false);
      enterChat(chat.id); setNotice('Переслано: ' + count);
    } catch (error) {
      setNotice('Не удалось переслать: ' + (error instanceof Error ? error.message : String(error)));
    } finally { setBusy(false); }
  }
  async function removeForEveryone(ids:string[]){if(!supabase||!user||busy)return;const own=visibleMessages.filter(m=>ids.includes(m.id)&&m.sender_id===user.id);if(!own.length){setNotice('Можно удалить у всех только свои сообщения');return;}if(!window.confirm('Удалить '+own.length+' сообщ. у обоих участников?'))return;setBusy(true);let failed='';for(const m of own){const r=await supabase.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',m.id).eq('sender_id',user.id);if(r.error){failed=r.error.message;break;}}setBusy(false);if(failed)setNotice('Не удалось удалить: '+failed);else{setMessages(prev=>prev.filter(m=>!own.some(x=>x.id===m.id)));setSelectedIds([]);setSelectionMode(false);setMenuMessage(null);}}
  function selectOne(id:string){setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
  function startSelection(ids:string[]=[]){setSelectionMode(true);setSelectedIds(ids);setChatActions(false);setMenuMessage(null);}
  function resetChatTools(){setSelectionMode(false);setSelectedIds([]);setChatActions(false);setChatSearchOpen(false);setChatQuery('');setForwardIds([]);}

  // A cleared conversation is hidden from the list, but must remain openable from Contacts.
  const selected = conversations.map(c => ({
    ...c,
    other: profiles.find(p => p.id === (c.user_a === user?.id ? c.user_b : c.user_a)),
    last: latest[c.id], count: unread[c.id] || 0,
  })).find(c => c.id === activeChat);
  const currentName = selected?.other?.display_name || 'Собеседник';
  const peerPresence = selected?.other ? presence[selected.other.id] : undefined;
  const peerStatus = peerRecording ? '🎙 Записывает голосовое сообщение…' : typing ? 'печатает…' : formatPresence(peerPresence,clock);
  const currentPeerState=activeChat?peerStates[activeChat]:undefined;
  const filteredChats = chats.filter(c => (c.other?.display_name || '').toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU')));
  useEffect(()=>{if(chatSearchOpen&&chatQuery.trim()&&searchMatches.length){const match=searchMatches[Math.min(searchPosition,searchMatches.length-1)];requestAnimationFrame(()=>document.getElementById('msg-'+match.id)?.scrollIntoView({behavior:'smooth',block:'center'}));}},[chatQuery,chatSearchOpen,searchMatches.length]);
  const filteredContacts = contacts.filter(p => p.display_name.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU')));
  const unreadTotal = Object.values(unread).reduce((sum, n) => sum + n, 0);

  function clearConversation(id: string) {
    if (!user || !window.confirm('Очистить переписку только на этом устройстве? У собеседника сообщения останутся.')) return;
    const next={...clearedChats,[id]:new Date().toISOString()};
    setClearedChats(next);
    try { localStorage.setItem('connect-cleared-chats:'+user.id,JSON.stringify(next)); } catch {}
    if (activeChat===id) exitChat();
    setNotice('Переписка скрыта на этом устройстве');
  }
  function enterChat(id: string) { resetChatTools(); setListActions(null); setActiveChat(id); setTab('chats'); setSearch(''); setReplyTo(null); setEditing(null); setDraft(''); setMenuMessage(null); }
  function exitChat() { resetChatTools(); setActiveChat(null); setReplyTo(null); setEditing(null); setDraft(''); setMenuMessage(null); setTyping(false); }
  function switchTab(t: Tab) { setSettingsPage('home'); setStickerPicker(false); setTab(t); setSearch(''); setNotice(''); setProfileView(null); }
  async function openContact(p: Profile) {
    if (!supabase || !user || busy) return;
    setBusy(true); setNotice('');
    let chat = conversations.find(c => (c.user_a === user.id && c.user_b === p.id) || (c.user_b === user.id && c.user_a === p.id));
    if (!chat) {
      const [a, b] = [user.id, p.id].sort();
      const { data, error } = await supabase.from('conversations').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b' }).select('id,user_a,user_b,created_at').single();
      if (error || !data) { setBusy(false); setNotice('Не удалось открыть чат: ' + (error?.message || 'Ошибка')); return; }
      chat = data as Conversation; setConversations(prev => [chat!, ...prev.filter(c => c.id !== chat!.id)]);
    }
    setBusy(false); enterChat(chat.id);
  }

  function startReply(m: Message) { setReplyTo(m); setEditing(null); setMenuMessage(null); inputRef.current?.focus(); }
  function startEdit(m: Message) { setEditing(m); setReplyTo(null); setDraft(m.body); setMenuMessage(null); inputRef.current?.focus(); }
  function cancelCompose() { setEditing(null); setReplyTo(null); setDraft(''); }
  async function copyText(m: Message) {
    try { await navigator.clipboard.writeText(m.body); setNotice('Текст скопирован'); }
    catch { setNotice('Не удалось скопировать текст'); }
    setMenuMessage(null);
  }
  async function deleteMessage(m: Message) {
    if (!supabase || !user || busy || m.sender_id !== user.id || m.deleted_at) return;
    setMenuMessage(null);
    if (!window.confirm('Удалить это сообщение у обоих участников?')) return;
    setBusy(true);
    const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id).eq('sender_id', user.id);
    setBusy(false);
    if (error) { setNotice('Не удалось удалить: ' + error.message); return; }
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, body: '', deleted_at: new Date().toISOString() } : x));
  }
  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user || !activeChat || !draft.trim() || busy) return;
    const body = draft.trim(); setBusy(true); setNotice('');
    if (editing) {
      const { error } = await supabase.from('messages').update({ body }).eq('id', editing.id).eq('sender_id', user.id);
      setBusy(false); if (error) { setNotice('Не удалось изменить: ' + error.message); return; }
      setMessages(prev => prev.map(m => m.id === editing.id ? { ...m, body, edited_at: new Date().toISOString() } : m));
      cancelCompose(); return;
    }
    const { data, error } = await supabase.from('messages').insert({ conversation_id: activeChat, sender_id: user.id, body, reply_to: replyTo?.id || null }).select(MESSAGE_COLUMNS).single();
    setBusy(false); if (error || !data) { setNotice('Не удалось отправить: ' + (error?.message || 'Ошибка')); return; }
    setDraft(''); setReplyTo(null); lastKeypress.current = 0; void updateTyping(activeChat, false);
    const m = data as Message;
    setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
    setLatest(prev => ({ ...prev, [activeChat]: m }));
    requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }


  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    const paths = Array.from(new Set(messages.filter(m=>!m.deleted_at).flatMap(m=>[...(m.attachment_path?[m.attachment_path]:[]),...parseAlbum(m.body).map(x=>x.path)])));
    const missing = paths.filter(path => !attachmentUrls[path]);
    if (!missing.length) return;
    void Promise.all(missing.map(async path => {
      const {data} = await supabase.storage.from('connect-attachments').createSignedUrl(path, 3600);
      return {path, url:data?.signedUrl ? mediaUrl(data.signedUrl) : undefined};
    })).then(rows => {
      if (cancelled) return;
      setAttachmentUrls(prev => {
        const next={...prev};
        rows.forEach(row => {if(row.url) next[row.path]=row.url;});
        return next;
      });
    });
    return () => {cancelled=true;};
  }, [messages, user?.id]);

  function isKeyboardSticker(m: Message): boolean {
    return m.attachment_kind === 'image' && /^sticker-\d+\.(png|webp|gif|jpe?g)$/i.test(m.attachment_name || '');
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    // iOS custom keyboard stickers may be delivered as image clipboard items.
    const clipboard = event.clipboardData;
    if (!clipboard || busy || recording || editing) return;
    const item = Array.from(clipboard.items || []).find(entry => entry.kind === 'file' && entry.type.startsWith('image/'));
    const pasted = item?.getAsFile() || Array.from(clipboard.files || []).find(file => file.type.startsWith('image/'));
    if (!pasted) return; // Keep normal text and Unicode emoji paste untouched.
    event.preventDefault();
    const ext = pasted.type === 'image/gif' ? 'gif' : pasted.type === 'image/webp' ? 'webp' : pasted.type === 'image/jpeg' ? 'jpg' : 'png';
    const image = new File([pasted], `sticker-${Date.now()}.${ext}`, { type: pasted.type || 'image/png' });
    void sendAttachment(image);
  }

  function chooseAttachments(list:FileList|null){
    const files=Array.from(list||[]);
    if(!files.length)return;
    setPendingFiles(prev=>[...prev,...files].slice(0,20));
    if(files.length+pendingFiles.length>20)setNotice('Можно выбрать не более 20 файлов за раз');
  }
  async function sendSelectedFiles(){
    if(!pendingFiles.length||busy)return;
    const files=[...pendingFiles];
    const media=files.filter(f=>f.type.startsWith('image/')||f.type.startsWith('video/'));
    const docs=files.filter(f=>!f.type.startsWith('image/')&&!f.type.startsWith('video/'));
    if(media.length&&docs.length){setNotice('Выберите отдельно медиа для альбома и документы');return}
    if(files.some(f=>f.size<1||f.size>100*1024*1024)){setNotice('Максимальный размер одного файла — 100 МБ');return}
    if(docs.length){
      for(const file of docs)await sendAttachment(file);
      setPendingFiles([]);
      return;
    }
    if(media.length===1){await sendAttachment(media[0]);setPendingFiles([]);return}
    await sendAlbum(media);
  }
  async function sendAlbum(files:File[]){
    if(!supabase||!user||!activeChat||busy||files.length<2)return;
    const client=supabase,uid=user.id,chatId=activeChat;
    setBusy(true);setUploadProgress(0);setNotice('');
    const items:AlbumItem[]=[];
    try{
      const {data:{session}}=await client.auth.getSession();
      if(!session)throw Error('Сессия завершена');
      for(let i=0;i<files.length;i++){
        const file=files[i],path=`${chatId}/${uid}/${crypto.randomUUID()}`;
        if(file.size<=6*1024*1024){
          const {error}=await client.storage.from('connect-attachments').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
          if(error)throw error;
        }else{
          await new Promise<void>((resolve,reject)=>{
            const upload=new tus.Upload(file,{
              endpoint:useSupabaseProxy?window.location.origin+'/supabase-storage/storage/v1/upload/resumable':`${supabaseUrl.replace('.supabase.co','.storage.supabase.co')}/storage/v1/upload/resumable`,
              retryDelays:[0,3000,5000,10000,20000],headers:{authorization:`Bearer ${session.access_token}`,'x-upsert':'false'},
              uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,
              metadata:{bucketName:'connect-attachments',objectName:path,contentType:file.type||'application/octet-stream'},chunkSize:6*1024*1024,
              onError:reject,onSuccess:()=>resolve(),onProgress:(done,total)=>setUploadProgress(Math.round(((i+done/total)/files.length)*100))
            });upload.start();
          });
        }
        items.push({path,name:file.name.slice(0,240),kind:file.type.startsWith('video/')?'video':'image'});
        setUploadProgress(Math.round((i+1)/files.length*100));
      }
      const {data,error}=await client.from('messages').insert({conversation_id:chatId,sender_id:uid,body:ALBUM_PREFIX+JSON.stringify(items)+']]',reply_to:replyTo?.id||null}).select(MESSAGE_COLUMNS).single();
      if(error||!data)throw error||Error('Не удалось создать альбом');
      const m=data as Message;
      setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);
      setLatest(prev=>({...prev,[chatId]:m}));
      setReplyTo(null);setPendingFiles([]);
      const urls=await Promise.all(items.map(async x=>({path:x.path,result:await client.storage.from('connect-attachments').createSignedUrl(x.path,3600)})));
      setAttachmentUrls(prev=>{const next={...prev};urls.forEach(x=>{if(x.result.data?.signedUrl)next[x.path]=mediaUrl(x.result.data.signedUrl)});return next});
      requestAnimationFrame(()=>{if(scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight});
    }catch(e){setNotice('Не удалось отправить альбом: '+(e instanceof Error?e.message:String(e)))}
    finally{setBusy(false);setUploadProgress(null)}
  }
  async function sendAttachment(file: File, kindOverride?: 'audio') {
    if (!supabase || !user || !activeChat || busy) return;
    if (file.size < 1 || file.size > 100*1024*1024) {setNotice('Максимальный размер файла — 100 МБ');return;}
    const chatId=activeChat;
    const kind = kindOverride || (file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':'file');
    const path=`${chatId}/${user.id}/${crypto.randomUUID()}`;
    setBusy(true);setUploadProgress(0);setNotice('');
    try {
      const {data:{session}}=await supabase.auth.getSession();
      if(!session) throw new Error('Сессия завершена. Войдите снова.');
      if (file.size <= 6*1024*1024) {
        const {error}=await supabase.storage.from('connect-attachments').upload(path,file,{contentType:file.type || 'application/octet-stream',upsert:false});
        if(error) throw error;
      } else {
        await new Promise<void>((resolve,reject)=>{
          const upload=new tus.Upload(file,{
            endpoint:useSupabaseProxy ? window.location.origin + '/supabase-storage/storage/v1/upload/resumable' : `${supabaseUrl.replace('.supabase.co','.storage.supabase.co')}/storage/v1/upload/resumable`,
            retryDelays:[0,3000,5000,10000,20000],
            headers:{authorization:`Bearer ${session.access_token}`,'x-upsert':'false'},
            uploadDataDuringCreation:true,
            removeFingerprintOnSuccess:true,
            metadata:{bucketName:'connect-attachments',objectName:path,contentType:file.type || 'application/octet-stream'},
            chunkSize:6*1024*1024,
            onError:reject,
            onSuccess:()=>resolve(),
            onProgress:(done,total)=>setUploadProgress(Math.round(done/total*100)),
          });
          upload.start();
        });
      }
      const {data,error}=await supabase.from('messages').insert({
        conversation_id:chatId,sender_id:user.id,body:'',reply_to:replyTo?.id || null,
        attachment_path:path,attachment_name:file.name.slice(0,240),attachment_type:file.type || 'application/octet-stream',
        attachment_size:file.size,attachment_kind:kind
      }).select(MESSAGE_COLUMNS).single();
      if(error || !data) throw error || new Error('Сообщение не создано');
      const m=data as Message;
      setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);
      setLatest(prev=>({...prev,[chatId]:m}));
      setReplyTo(null);
      const signed=await supabase.storage.from('connect-attachments').createSignedUrl(path,3600);
      if(signed.data?.signedUrl)setAttachmentUrls(prev=>({...prev,[path]:mediaUrl(signed.data!.signedUrl)}));
      requestAnimationFrame(()=>{const el=scrollRef.current;if(el)el.scrollTop=el.scrollHeight;});
    } catch(e) {
      setNotice('Не удалось отправить вложение: '+(e instanceof Error?e.message:String(e)));
    } finally {setBusy(false);setUploadProgress(null);}
  }
  async function beginRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined') {
      setNotice('Запись звука недоступна в этом браузере');return;
    }
    if (!activeChat || recordingFinalizing.current) return;
    let stream:MediaStream|null=null;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const formats=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'];
      const mime=formats.find(x=>MediaRecorder.isTypeSupported(x));
      const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      audioChunks.current=[];recordingStream.current=stream;mediaRecorder.current=recorder;
      recordingChat.current=activeChat;recordingStarted.current=Date.now();
      let failed=false;let sendOnStop=true;
      recorder.ondataavailable=e=>{if(e.data.size>0)audioChunks.current.push(e.data);};
      recorder.onerror=()=>{failed=true;setNotice('Ошибка записи аудио. Попробуйте ещё раз.');};
      recorder.onstop=()=>{
        const chunks=audioChunks.current;
        const durationMs=Date.now()-recordingStarted.current;
        const chat=recordingChat.current;
        const type=recorder.mimeType || mime || 'audio/webm';
        const blob=new Blob(chunks,{type});
        stream?.getTracks().forEach(track=>track.stop());
        recordingStream.current=null;mediaRecorder.current=null;recordingChat.current=null;
        recordingFinalizing.current=false;recordingSend.current=null;
        if(recordInterval.current!==null)window.clearInterval(recordInterval.current);
        recordInterval.current=null;setRecording(false);setRecordSeconds(0);
        if(chat)void updateRecording(chat,false);
        if(!sendOnStop)return;
        if(failed || blob.size<1000 || durationMs<700){
          setNotice('Голосовое не записалось полностью. Попробуйте ещё раз.');return;
        }
        const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
        void sendAttachment(new File([blob],`Голосовое-${Date.now()}.${ext}`,{type}),'audio');
      };
      recorder.start();setRecording(true);setRecordSeconds(0);
      void updateRecording(activeChat,true);
      recordInterval.current=window.setInterval(()=>{
        setRecordSeconds(Math.floor((Date.now()-recordingStarted.current)/1000));
        const chat=recordingChat.current;if(chat)void updateRecording(chat,true);
      },3000);
      recordingSend.current=(send:boolean)=>{sendOnStop=send;};
    } catch(e){
      stream?.getTracks().forEach(track=>track.stop());
      recordingFinalizing.current=false;
      setNotice('Не удалось включить микрофон: '+(e instanceof Error?e.message:String(e)));
    }
  }
  function finishRecording(send:boolean) {
    const recorder=mediaRecorder.current;
    if(!recorder || recorder.state==='inactive' || recordingFinalizing.current)return;
    recordingFinalizing.current=true;recordingSend.current?.(send);
    try{recorder.stop();}catch(e){
      recordingFinalizing.current=false;
      setNotice('Не удалось завершить запись: '+(e instanceof Error?e.message:String(e)));
    }
  }
  const gallery = visibleMessages.flatMap(m=>[...(m.attachment_path && (m.attachment_kind==='image'||m.attachment_kind==='video')?[{path:m.attachment_path,name:m.attachment_name || 'Медиа',kind:m.attachment_kind as 'image'|'video'}]:[]),...parseAlbum(m.body)]).filter(x=>Boolean(attachmentUrls[x.path])).map(x=>({...x,url:attachmentUrls[x.path]}));
  const galleryIndex = mediaViewer ? gallery.findIndex(item => item.path === mediaViewer.path) : -1;
  function stepGallery(delta:number) {
    if (!mediaViewer || galleryIndex < 0 || !gallery.length) return;
    const next = galleryIndex + delta;
    if (next >= 0 && next < gallery.length) setMediaViewer(gallery[next]);
  }
  useEffect(() => {
    if (!mediaViewer) return;
    const onKey = (event:KeyboardEvent) => {
      if (event.key === 'Escape') setMediaViewer(null);
      if (event.key === 'ArrowLeft') stepGallery(-1);
      if (event.key === 'ArrowRight') stepGallery(1);
    };
    window.addEventListener('keydown',onKey);
    return () => window.removeEventListener('keydown',onKey);
  },[mediaViewer,galleryIndex,gallery.length]);
  async function saveAttachment(path: string, name: string) {
    if (!supabase) return;
    setSavingMedia(true);
    try {
      const filename = (name || 'connect-file').replace(/[\\/\x00-\x1f]/g, '_');
      const {data, error} = await supabase.storage.from('connect-attachments').download(path);
      if (error || !data) throw error || new Error('Файл недоступен');
      const file = new File([data], filename, {type:data.type || 'application/octet-stream'});
      // Native share sheets can save media in installed Files/Gallery apps.
      if (navigator.canShare?.({files:[file]}) && navigator.share) {
        try { await navigator.share({files:[file],title:filename}); return; }
        catch (e) { if ((e as Error).name === 'AbortError') return; }
      }
      // Android WebView often ignores blob: downloads. Use a real HTTPS download URL.
      if (/Android/i.test(navigator.userAgent)) {
        const signed = await supabase.storage.from('connect-attachments').createSignedUrl(path,120,{download:filename});
        if (!signed.error && signed.data?.signedUrl) {
          const a=document.createElement('a');a.href=mediaUrl(signed.data.signedUrl);a.target='_blank';a.rel='noopener noreferrer';
          document.body.appendChild(a);a.click();a.remove();return;
        }
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href=url; a.download=filename;
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch (e) {
      // A signed URL with Content-Disposition=attachment is a fallback for
      // Android WebViews that do not handle blob: downloads.
      const {data,error} = await supabase.storage.from('connect-attachments').createSignedUrl(path,120,{download:name || 'connect-file'});
      if (!error && data?.signedUrl) window.open(mediaUrl(data.signedUrl),'_blank','noopener,noreferrer');
      else setNotice('Не удалось сохранить вложение: '+(e instanceof Error?e.message:String(e)));
    } finally { setSavingMedia(false); }
  }
  function openMenu(m: Message, element: HTMLElement) {
    if (m.deleted_at) return;
    const rect = element.getBoundingClientRect(); const root = shellRef.current?.getBoundingClientRect();
    const height = root?.height || window.innerHeight;
    const optionsHeight = m.sender_id === user?.id ? 360 : 270;
    setMenuTop(Math.min(Math.max(12, rect.top - (root?.top || 0) - 14), Math.max(12, height - optionsHeight - 12)));
    setMenuSide(m.sender_id === user?.id ? 'right' : 'left');
    setMenuMessage(m); setSwipe(null);
    try { if ('vibrate' in navigator) navigator.vibrate(9); } catch { /* iOS doesn't support vibration */ }
  }
  function clearGestureTimer() { if (gesture.current?.timer !== null && gesture.current?.timer !== undefined) window.clearTimeout(gesture.current.timer); if (gesture.current) gesture.current.timer = null; }
  function touchStart(e: TouchEvent<HTMLDivElement>, m: Message) {
    if (selectionMode) return;
    if (m.deleted_at || !e.touches[0]) return;
    clearGestureTimer(); const touch = e.touches[0]; const element = e.currentTarget;
    gesture.current = { id: m.id, x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, opened: false, timer: window.setTimeout(() => {
      if (gesture.current?.id === m.id) { gesture.current.opened = true; openMenu(m, element); }
    }, 480) };
  }
  function touchMove(e: TouchEvent<HTMLDivElement>, m: Message) {
    const g = gesture.current; if (!g || g.id !== m.id || !e.touches[0] || g.opened) return;
    g.dx = e.touches[0].clientX - g.x; g.dy = e.touches[0].clientY - g.y;
    if (Math.abs(g.dx) > 12 || Math.abs(g.dy) > 12) clearGestureTimer();
    if (g.dx > 0 && g.dx > Math.abs(g.dy) * 1.25) setSwipe({ id: m.id, offset: Math.min(76, Math.max(0, g.dx)) });
    else setSwipe(null);
  }
  function touchEnd(m: Message) {
    if (selectionMode) return;
    const g = gesture.current; if (!g || g.id !== m.id) return;
    clearGestureTimer(); gesture.current = null; setSwipe(null);
    if (!g.opened && g.dx > 58 && g.dx > Math.abs(g.dy) * 1.3 && !m.deleted_at) startReply(m);
  }
  function bubbleKey(e: ReactKeyboardEvent<HTMLDivElement>, m: Message) {
    if ((e.key === 'Enter' || e.key === ' ') && !m.deleted_at) { e.preventDefault(); openMenu(m, e.currentTarget); }
  }

  async function login(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setNotice('');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Сервер авторизации не отвечает (15 секунд). Проверьте соединение.')), 15000);
        }),
      ]);
      if (result.error) setNotice('Не удалось войти: ' + result.error.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка соединения с сервером');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      setBusy(false);
    }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    if (newPassword.length < 8) { setNotice('Пароль должен содержать не менее 8 символов'); return; }
    setBusy(true); const { error } = await supabase.auth.updateUser({ password: newPassword }); setBusy(false);
    if (error) { setNotice(error.message); return; }
    setSetup(false); setNewPassword(''); setNotice('Пароль установлен');
    window.history.replaceState({}, '', window.location.pathname);
  }
  async function logout() {
    await supabase?.auth.signOut(); exitChat(); setProfiles([]); setConversations([]); setMessages([]);
    setLatest({}); setUnread({}); readCache.current = {}; setPassword(''); setNotice('');
  }

  const keyboardOpen = frame ? window.innerHeight - frame.height - frame.top > 130 : false;
  const screenStyle: CSSProperties | undefined = frame ? { height: `${frame.height}px`, top: `${frame.top}px`, paddingBottom: keyboardOpen ? '0px' : undefined } : undefined;
  return <div className={'connect-app ' + theme + (keyboardOpen ? ' keyboard-open' : '')} ref={shellRef} style={{...screenStyle, '--accent':accent,'--accent2':accent} as CSSProperties}>
    {!supabase ? <div className="connection-error"><Icon name="info" size={32}/><h2>Подключение не настроено</h2><p>Проверьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в Vercel.</p></div>
      : loading ? <div className="loading-screen"><img src="/icon-192.png" alt=""/><p>Подключаем Connect…</p></div>
        : !user || setup ? <div className="login-screen">
          <div className="login-brand"><img src="/icon-192.png" alt=""/><h1>Connect</h1><p>Личные разговоры. Только свои.</p></div>
          <form className="login-form" onSubmit={setup ? savePassword : login}>
            <h2>{setup ? 'Создать пароль' : 'Вход в Connect'}</h2>
            {setup ? <input className="field" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Новый пароль (от 8 символов)"/>
              : <><input className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Электронная почта"/><input className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль"/></>}
            <button className="primary-action" disabled={busy} type="submit">{busy ? 'Подключение…' : setup ? 'Сохранить пароль' : 'Войти'}</button>
            <p className="login-hint">Вход доступен только участникам с учётной записью.</p>
          </form>
        </div>
          : profileView && viewedProfile ? <div className="profile-view">
            <header className="profile-top"><button className="icon-btn" type="button" onClick={()=>setProfileView(null)} aria-label="Назад"><Icon name="back" size={25}/></button><strong>{profileView===user.id?'Мой профиль':'Профиль'}</strong></header>
            <div className="profile-content">
              <div className="profile-hero">
                <Avatar size="lg" name={viewedProfile.display_name} id={viewedProfile.id} url={avatarUrls[viewedProfile.id]}/>
                <h2>{viewedProfile.display_name}</h2>
                <p>{viewedProfile.bio || 'Информация о себе не указана'}</p>
                {profileView===user.id && <><button type="button" className="avatar-change" disabled={busy} onClick={()=>avatarInput.current?.click()}><Icon name="camera" size={17}/> Изменить фото</button><input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{selectAvatar(e.target.files?.[0]);e.currentTarget.value='';}}/></>}
              </div>
              {profileView===user.id ? <form className="profile-edit" onSubmit={saveProfile}>
                <label>Имя<input maxLength={60} required value={editName} onChange={e=>setEditName(e.target.value)}/></label>
                <label>О себе<textarea maxLength={160} rows={3} value={editBio} onChange={e=>setEditBio(e.target.value)} placeholder="Расскажите немного о себе"/></label>
                <small>{editBio.length}/160 · Фото JPG, PNG или WebP до 2 МБ</small>
                <button type="submit" className="primary-action" disabled={busy}>Сохранить изменения</button>
              </form> : <div className="profile-about"><span>О себе</span><p>{viewedProfile.bio || 'Пока ничего не рассказал(а)'}</p></div>}
            </div>
          </div>
          : activeChat && selected ? <div className="chat-view">
            <header className="chat-header">
              <button type="button" className="icon-btn back-btn" onClick={exitChat} aria-label="Назад к чатам"><Icon name="back" size={28}/></button>
              <button type="button" className="chat-person-link" onClick={()=>selected.other && showProfile(selected.other.id)}>
                <Avatar name={currentName} id={selected.other?.id} url={selected.other ? avatarUrls[selected.other.id] : undefined}/>
                <span className="chat-header-person"><strong>{currentName}</strong><small className={typing || peerRecording ? 'typing-label' : ''}>{peerStatus}</small></span>
              </button>
              <button type="button" className="icon-btn chat-clear-btn" aria-label="Меню чата" onClick={()=>setChatActions(v=>!v)}><Icon name="dots" size={23}/></button>
              {chatActions&&<div className="chat-actions-menu"><button type="button" onClick={()=>{setChatSearchOpen(true);setChatActions(false);}}>Найти в чате</button><button type="button" onClick={()=>startSelection()}>Выбрать сообщения</button><button type="button" className="destructive" onClick={()=>{setChatActions(false);clearConversation(activeChat);}}>Удалить переписку</button></div>}
            </header>
            {chatSearchOpen&&<div className="chat-search-bar"><Icon name="search" size={18}/><input autoFocus placeholder="Поиск по чату" value={chatQuery} onChange={e=>{setChatQuery(e.target.value);setSearchPosition(0)}}/><small>{searchMatches.length?`${searchPosition+1}/${searchMatches.length}`:'0'}</small><button type="button" onClick={()=>showMatch(searchPosition-1)}>↑</button><button type="button" onClick={()=>showMatch(searchPosition+1)}>↓</button><button type="button" onClick={()=>{setChatSearchOpen(false);setChatQuery('')}} aria-label="Закрыть поиск"><Icon name="close" size={17}/></button></div>}
            {selectionMode&&<div className="selection-toolbar"><button type="button" onClick={()=>{setSelectionMode(false);setSelectedIds([])}}>Отмена</button><strong>Выбрано: {selectedIds.length}</strong><button type="button" disabled={!selectedIds.length} onClick={()=>beginForward(selectedIds)}>Переслать</button><button type="button" disabled={!selectedIds.length} onClick={()=>hideMessages(selectedIds)}>У себя</button><button type="button" disabled={!selectedIds.length||selectedIds.some(id=>visibleMessages.find(m=>m.id===id)?.sender_id!==user.id)} onClick={()=>void removeForEveryone(selectedIds)}>У всех</button></div>}
            <div className={"message-scroll"+(wallpaper?" has-wallpaper":"")} style={wallpaper?{backgroundImage:`linear-gradient(#00000018,#00000018),url(${wallpaper})`}:undefined} ref={scrollRef} onScroll={trackScroll} aria-label="История сообщений">
              <div className="message-stream">
                {visibleMessages.length === 0 ? <div className="empty-chat"><Icon name="message" size={32}/><span>Напишите первое сообщение</span></div> : visibleMessages.map((m,index) => {
                  const mine = m.sender_id === user.id;
                  const replied = m.reply_to ? visibleMessages.find(x => x.id === m.reply_to) : undefined;
                  return <div key={m.id} id={"msg-"+m.id} className="message-day-group">
                    {(index===0 || dayKey(visibleMessages[index-1].created_at)!==dayKey(m.created_at)) && <div className="date-separator"><span>{dayLabel(m.created_at)}</span></div>}
                    <div className={'message-row ' + (mine ? 'outgoing' : 'incoming') + (selectedIds.includes(m.id)?' is-selected':'')}>
                    {selectionMode&&<input className="message-select-check" type="checkbox" aria-label="Выбрать сообщение" checked={selectedIds.includes(m.id)} onChange={()=>selectOne(m.id)}/>}
                    {swipe?.id === m.id && <span className="swipe-reply-icon"><Icon name="reply" size={22}/></span>}
                    <div className={'bubble ' + (mine ? 'sent' : 'received') + (m.deleted_at ? ' removed' : '') + (!m.deleted_at && (stickerFromBody(forwardedMessage(m.body).text) || /^\[\[connect-custom-sticker:[0-9a-f-]{36}\]\]$/.test(forwardedMessage(m.body).text) || isKeyboardSticker(m) || (!m.attachment_path && /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(forwardedMessage(m.body).text.trim()))) ? ' sticker-bubble' : '') + (!m.deleted_at && !m.attachment_path && /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(forwardedMessage(m.body).text.trim()) ? ' emoji-only' : '') + (!m.deleted_at && (parseAlbum(m.body).length>0 || (m.attachment_path && (m.attachment_kind==='image'||m.attachment_kind==='video') && !isKeyboardSticker(m))) ? ' media-only' : '')}
                      style={{ transform: `translate3d(${swipe?.id === m.id ? swipe.offset : 0}px,0,0)` }}
                      onTouchStart={e => touchStart(e, m)} onTouchMove={e => touchMove(e, m)}
                      onTouchEnd={() => touchEnd(m)} onTouchCancel={() => { clearGestureTimer(); gesture.current = null; setSwipe(null); }}
                      onClick={()=>{if(selectionMode)selectOne(m.id)}}
                      onContextMenu={e => { e.preventDefault(); if(selectionMode)selectOne(m.id);else openMenu(m, e.currentTarget); }}
                      onKeyDown={e => bubbleKey(e, m)} tabIndex={m.deleted_at ? -1 : 0}
                      role={m.deleted_at ? undefined : 'button'} aria-label={m.deleted_at ? 'Сообщение удалено' : 'Удерживайте, чтобы открыть действия с сообщением'}>
                      {m.reply_to && <div className="quote-box"><strong>{replied?.sender_id === user.id ? 'Вы' : currentName}</strong><span>{!replied ? 'Исходное сообщение' : replied.deleted_at ? 'Сообщение удалено' : parseAlbum(replied.body).length ? `Альбом (${parseAlbum(replied.body).length})` : replied.body}</span></div>}
                      <div className="bubble-body">{m.deleted_at ? 'Сообщение удалено' : <>
                        {forwardedMessage(m.body).from && <div style={{fontSize:12,opacity:0.76,marginBottom:6,fontWeight:600}}>Переслано от {forwardedMessage(m.body).from}</div>}
                        {parseAlbum(m.body).length>0 && <div className="connect-album-grid">{parseAlbum(m.body).map((item,i)=><button type="button" key={item.path} className="connect-media-thumb" onClick={e=>{e.stopPropagation();if(attachmentUrls[item.path])setMediaViewer({...item,url:attachmentUrls[item.path]})}} aria-label={`Открыть файл ${i+1}`}>{attachmentUrls[item.path]?(item.kind==='image'?<img src={attachmentUrls[item.path]} alt={item.name} loading="lazy"/>:<><video src={attachmentUrls[item.path]} preload="metadata" playsInline/><span className="connect-media-play">▶</span></>):<span>Загрузка…</span>}</button>)}</div>}
                        {m.attachment_path && <div className={isKeyboardSticker(m) ? "attachment-preview keyboard-sticker-preview" : "attachment-preview"}>
                          {!attachmentUrls[m.attachment_path] ? <span>Загрузка вложения…</span>
                            : m.attachment_kind==='image' ? <button type="button" className="connect-media-thumb" onClick={e=>{e.stopPropagation();setMediaViewer({url:attachmentUrls[m.attachment_path!],path:m.attachment_path!,name:m.attachment_name || 'Фото.jpg',kind:'image'})}} aria-label="Открыть фото"><img src={attachmentUrls[m.attachment_path]} alt={m.attachment_name || 'Фото'} loading="lazy"/></button>
                            : m.attachment_kind==='video' ? <button type="button" className="connect-media-thumb" onClick={e=>{e.stopPropagation();setMediaViewer({url:attachmentUrls[m.attachment_path!],path:m.attachment_path!,name:m.attachment_name || 'Видео.mp4',kind:'video'})}} aria-label="Открыть видео"><video playsInline preload="metadata" src={attachmentUrls[m.attachment_path]}/><span className="connect-media-play">▶</span></button>
                            : m.attachment_kind==='audio' ? <div className="connect-audio-download"><VoicePlayer src={attachmentUrls[m.attachment_path]}/><button type="button" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Аудио')}}>Сохранить</button></div>
                            : <button type="button" className="attachment-file" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Файл')}}><Icon name="file" size={23}/><span>{m.attachment_name || 'Файл'}<small>{m.attachment_size ? (m.attachment_size/1048576).toFixed(1)+' МБ' : ''} · Скачать</small></span></button>}
                        </div>}
                        {/^\[\[connect-custom-sticker:([0-9a-f-]{36})\]\]$/.test(forwardedMessage(m.body).text) ? (()=>{const id=forwardedMessage(m.body).text.match(/^\[\[connect-custom-sticker:([0-9a-f-]{36})\]\]$/)?.[1];const st=customStickers.find(x=>x.id===id);return st?<img className="sent-sticker" src={customStickerUrl(st)} alt={st.name} loading="lazy"/>:<span>Стикер недоступен</span>})() : stickerFromBody(forwardedMessage(m.body).text) ? <img className="sent-sticker" src={stickerUrl(stickerFromBody(forwardedMessage(m.body).text)!)} alt="Стикер" loading="lazy"/> : (parseAlbum(m.body).length ? null : forwardedMessage(m.body).text ? highlightMessage(forwardedMessage(m.body).text) : null)}
                      </>}</div>
                      <div className="bubble-meta">{m.edited_at && !m.deleted_at && <span>изменено · </span>}{timeLabel(m.created_at)}{mine && <MessageChecks delivered={Boolean(currentPeerState?.delivered && currentPeerState.delivered>=m.created_at || currentPeerState?.read && currentPeerState.read>=m.created_at)} read={Boolean(currentPeerState?.read && currentPeerState.read>=m.created_at)}/>}</div>
                    </div>
                  </div>
                  </div>;
                })}
              </div>
            </div>
            <form className="chat-composer" onSubmit={sendMessage}>
              {(replyTo || editing) && <div className="compose-context"><div className="context-stripe"/><div className="compose-context-text"><strong>{editing ? 'Редактирование' : `Ответ: ${replyTo?.sender_id === user.id ? 'Вы' : currentName}`}</strong><span>{editing?.body || replyTo?.body}</span></div><button type="button" className="icon-btn dismiss-context" onClick={cancelCompose} aria-label="Отменить"><Icon name="close" size={20}/></button></div>}
              {pendingFiles.length>0 && <div className="connect-album-compose">
                <div className="connect-album-heading"><strong>Выбрано: {pendingFiles.length}</strong><button type="button" onClick={()=>setPendingFiles([])}>Отмена</button></div>
                <div className="connect-album-previews">{pendingFiles.map((file,i)=><PendingAttachment key={i} file={file} onRemove={()=>setPendingFiles(prev=>prev.filter((_,j)=>j!==i))}/>)}</div>
                <button className="connect-album-send" type="button" disabled={busy} onClick={()=>void sendSelectedFiles()}>{busy?'Отправляем…':pendingFiles.length>1?'Отправить выбранное':'Отправить файл'}</button>
              </div>}
              {uploadProgress!==null && <div className="upload-status">Отправка файла: {uploadProgress}%<progress max={100} value={uploadProgress}/></div>}
              {recording && <div className="recording-status"><span>● Запись {Math.floor(recordSeconds/60)}:{String(recordSeconds%60).padStart(2,'0')}</span><button type="button" onClick={()=>finishRecording(false)}>Отмена</button><button type="button" onClick={()=>finishRecording(true)}>Отправить</button></div>}
              <input ref={attachmentInput} type="file" multiple hidden onChange={e=>{chooseAttachments(e.currentTarget.files);e.currentTarget.value='';}}/>
              {stickerPicker && <div className="sticker-picker">
                <div className="sticker-picker-tabs">
                  {STICKER_PACKS.filter(p=>enabledPacks.includes(p.id)).map(p=><button key={p.id} type="button" className={stickerPack===p.id?'active':''} onClick={()=>{setStickerPack(p.id);setCustomPack('')}}>{p.emoji} {p.name}</button>)}
                  {customPacks.map(p=><button key={p.id} type="button" className={customPack===p.id?'active':''} onClick={()=>{setCustomPack(p.id);setStickerPack('speed')}}>{p.emoji} {p.name}</button>)}
                  <button type="button" className={stickerPack==='favorites'?'active':''} onClick={()=>{setStickerPack('favorites');setCustomPack('')}}>⭐</button>
                  <button type="button" className={stickerPack==='recent'?'active':''} onClick={()=>{setStickerPack('recent');setCustomPack('')}}>🕒</button>
                </div>
                <div className="sticker-grid">{customPack?customStickers.filter(st=>st.pack_id===customPack).map(st=><button key={st.id} type="button" className="sticker-choice" onClick={()=>void sendCustomSticker(st)} disabled={busy}><img src={customStickerUrl(st)} alt={st.name}/></button>):(stickerPack==='favorites'?stickerFavorites:stickerPack==='recent'?stickerRecent:STICKER_PACKS.find(p=>p.id===stickerPack)?.stickers.map(st=>stickerPack+':'+st.id)||[]).map(key=>{const [pack,id]=key.split(':');const found=STICKER_PACKS.find(p=>p.id===pack)?.stickers.find(st=>st.id===id);if(!found)return null;return <div key={key} className="sticker-choice"><button type="button" onClick={()=>void sendSticker(pack as StickerPackId,id)} disabled={busy} aria-label={'Отправить '+found.name}><img src={stickerUrl({pack,id})} alt={found.name}/></button><button type="button" className="sticker-fav" onClick={()=>toggleFavorite(key)} aria-label="В избранное">{stickerFavorites.includes(key)?'★':'☆'}</button></div>;})}</div>
              </div>}
              <div className="compose-line"><button type="button" className="composer-extra" onClick={()=>setStickerPicker(x=>!x)} aria-label="Стикеры">☺</button><button className="composer-extra" type="button" disabled={busy || recording || Boolean(editing)} onClick={()=>attachmentInput.current?.click()} aria-label="Прикрепить фото, видео или файл"><Icon name="plus" size={23}/></button><input ref={inputRef} type="text" autoComplete="off" enterKeyHint="send" aria-label="Сообщение" maxLength={10000} value={draft} onChange={e => changeDraft(e.target.value)} onPaste={handleComposerPaste} placeholder={editing ? 'Изменить сообщение…' : 'Сообщение…'}/><button className="send-button" type="submit" disabled={busy || !draft.trim()} aria-label={editing ? 'Сохранить' : 'Отправить'}><Icon name={editing ? 'check' : 'send'} size={23}/></button>{!draft.trim() && !editing && <button className="composer-extra" type="button" disabled={busy} onClick={()=>recording?finishRecording(true):void beginRecording()} aria-label="Записать голосовое"><Icon name={recording?'stop':'mic'} size={22}/></button>}</div>
            </form>
          </div>
            : <><div className="main-view">
              {tab === 'chats' && <>
                <header className="home-header"><div className="home-brand"><img src="/icon-192.png" alt=""/><h1>Connect</h1></div><button type="button" className="icon-btn new-chat" aria-label="Начать новый чат" onClick={() => switchTab('contacts')}><Icon name="write" size={24}/></button></header>
                <div className="section-heading"><h2>Чаты</h2>{unreadTotal > 0 && <span className="heading-count">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}</div>
                <div className="search-field"><Icon name="search" size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по чатам" aria-label="Поиск по чатам"/></div>
                <div className="scroll-content chat-rows">
                  {filteredChats.length === 0 ? <div className="empty-state"><Icon name="chats" size={38}/><strong>{search ? 'Ничего не найдено' : 'Пока нет переписок'}</strong><span>{search ? 'Попробуйте другое имя' : 'Откройте «Контакты» и начните разговор'}</span></div>
                    : filteredChats.map(c => <div className="dialog-entry" key={c.id}><button type="button" className="dialog-row" key={c.id}
                    onTouchStart={e=>{const t=e.touches[0];if(!t)return;const state={timer:null as number|null,x:t.clientX,y:t.clientY,opened:false};state.timer=window.setTimeout(()=>{state.opened=true;setListActions(c.id)},480);listHold.current=state}}
                    onTouchMove={e=>{const t=e.touches[0],h=listHold.current;if(h&&t&&(Math.abs(t.clientX-h.x)>12||Math.abs(t.clientY-h.y)>12)){if(h.timer!==null)clearTimeout(h.timer);h.timer=null}}}
                    onTouchEnd={()=>{if(listHold.current?.timer!==null&&listHold.current?.timer!==undefined)clearTimeout(listHold.current.timer);}}
                    onContextMenu={e=>{e.preventDefault();setListActions(c.id)}}
                    onClick={() => {if(listHold.current?.opened){listHold.current=null;return;}enterChat(c.id)}}><Avatar name={c.other?.display_name || 'Собеседник'} id={c.other?.id} url={c.other ? avatarUrls[c.other.id] : undefined}/><div className="dialog-summary"><strong>{c.other?.display_name || 'Собеседник'}</strong><span>{messagePreview(c.last, user.id)}</span></div><div className="dialog-meta"><time>{listTimeLabel(c.last?.created_at || c.created_at)}</time>{c.count > 0 && <span className="unread-pill">{c.count > 99 ? '99+' : c.count}</span>}</div></button>{listActions===c.id&&<div className="list-chat-popover"><button type="button" onClick={()=>{setListActions(null);clearConversation(c.id)}}>Удалить переписку</button><button type="button" onClick={()=>setListActions(null)}>Отмена</button></div>}</div>)}
                </div>
              </>}
              {tab === 'contacts' && <>
                <header className="simple-header"><h1>Контакты</h1><span className="subtle-counter">{contacts.length}</span></header>
                <div className="search-field"><Icon name="search" size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск контактов" aria-label="Поиск контактов"/></div>
                <div className="section-caption">МОИ КОНТАКТЫ</div>
                <div className="scroll-content contact-rows">
                  {filteredContacts.length === 0 ? <div className="empty-state"><Icon name="contacts" size={38}/><strong>{search ? 'Контакт не найден' : 'Контактов пока нет'}</strong><span>{search ? 'Попробуйте другое имя' : 'Контакты появятся после приглашения участников'}</span></div>
                    : filteredContacts.map(p => <button type="button" className="contact-row" key={p.id} disabled={busy} onClick={() => void openContact(p)}><Avatar name={p.display_name} id={p.id} url={avatarUrls[p.id]}/><span className="contact-text"><strong>{p.display_name}</strong><small>{p.bio || "Открыть переписку"}</small></span><Icon name="chevron" size={19}/></button>)}
                </div>
              </>}
              {tab === 'settings' && <>
                <header className="simple-header">{settingsPage!=='home' && <button type="button" className="icon-btn" onClick={()=>setSettingsPage('home')} aria-label="Назад"><Icon name="back" size={24}/></button>}<h1>{({home:'Настройки',appearance:'Оформление',notifications:'Уведомления',stickers:'Стикеры',members:'Участники',data:'Данные',privacy:'Приватность',about:'О приложении'} as Record<SettingsPage,string>)[settingsPage]}</h1></header>
                <div className="scroll-content settings-content">
                  {settingsPage==='home' && <>
                    <button type="button" className="settings-profile" onClick={()=>showProfile(user.id)}><Avatar size="lg" name={ownProfile?.display_name||'Мой профиль'} id={user.id} url={avatarUrls[user.id]}/><div><strong>{ownProfile?.display_name||'Мой профиль'}</strong><span>{ownProfile?.bio||user.email}</span></div><Icon name="chevron" size={19}/></button>
                    <div className="settings-group settings-menu">
                      {([{id:'appearance',icon:'sun',title:'Оформление',subtitle:'Тема, цвет и фон чатов'},{id:'stickers',icon:'message',title:'Стикеры',subtitle:'Наборы и избранное'},...(admin?[{id:'members' as SettingsPage,icon:'contacts' as IconName,title:'Управление участниками',subtitle:'Приглашения в Connect'}]:[]),{id:'notifications',icon:'info',title:'Уведомления',subtitle:'Звуки и push-уведомления'},{id:'data',icon:'file',title:'Данные и хранилище',subtitle:'Экспорт и очистка'},{id:'privacy',icon:'shield',title:'Приватность',subtitle:'Безопасность переписок'},{id:'about',icon:'info',title:'О приложении',subtitle:'Версия и разработчики'}] as {id:SettingsPage;icon:IconName;title:string;subtitle:string}[]).map((item,i)=><div key={item.id}>{i>0&&<div className="setting-divider"/>}<button type="button" className="settings-menu-row" onClick={()=>setSettingsPage(item.id)}><span className="setting-icon"><Icon name={item.icon} size={19}/></span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><Icon name="chevron" size={19}/></button></div>)}
                    </div><button type="button" className="logout-button" onClick={()=>void logout()}><Icon name="logout" size={20}/> Выйти из аккаунта</button>
                  </>}
                  {settingsPage==='appearance' && <>
                    <h3>Тема приложения</h3><div className="settings-group"><div className="settings-theme"><span className="setting-icon"><Icon name={theme==='dark'?'moon':'sun'} size={19}/></span><div><strong>Режим отображения</strong><small>На этом устройстве</small></div></div><div className="theme-buttons"><button type="button" className={theme==='dark'?'current':''} onClick={()=>changeTheme('dark')}>Тёмная</button><button type="button" className={theme==='light'?'current':''} onClick={()=>changeTheme('light')}>Светлая</button></div></div>
                    <h3>Цветовая схема</h3><div className="settings-group"><div className="accent-options">{['#087dff','#8055dc','#dc477e','#198f78','#b46b26','#cc4545','#60748b'].map(c=><button type="button" key={c} className={accent===c?'selected':''} style={{background:c}} aria-label={'Цвет '+c} onClick={()=>changeAccent(c)}>{accent===c?'✓':''}</button>)}<label className="accent-custom" title="Свой цвет">＋<input type="color" aria-label="Свой цвет" value={accent} onChange={e=>changeAccent(e.target.value)}/></label></div><p className="settings-hint">Цвет кнопок, ссылок и исходящих сообщений</p></div>
                    <h3>Фон переписок</h3><div className="settings-group wallpaper-settings"><input type="file" ref={wallpaperInput} hidden accept="image/*" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void changeWallpaper(file);}}/>{wallpaper&&<img className="wallpaper-preview" src={wallpaper} alt="Выбранный фон"/>}<button type="button" className="settings-action" onClick={()=>wallpaperInput.current?.click()}>Выбрать изображение</button>{wallpaper&&<button type="button" className="settings-action secondary" onClick={()=>void removeWallpaper()}>Удалить фон</button>}<p className="settings-hint">Фон хранится только на этом устройстве. До 12 МБ.</p></div>
                  </>}
                  {settingsPage==='notifications' && <div className="settings-group"><ConnectNotificationSettings supabase={supabase!} userId={user.id}/></div>}
                  {settingsPage==='stickers' && <><p className="settings-hint">Общие наборы доступны всем пользователям. Выбирайте, какие показывать в чате.</p><div className="settings-group">{STICKER_PACKS.map((p,i)=><div key={p.id}>{i>0&&<div className="setting-divider"/>}<label className="sticker-pack-setting"><span className="sticker-pack-emoji">{p.emoji}</span><span><strong>{p.name}</strong><small>{p.description} · {p.stickers.length} шт.</small></span><input type="checkbox" checked={enabledPacks.includes(p.id)} onChange={()=>togglePack(p.id)}/></label></div>)}</div><h3>Мои наборы</h3><div className="settings-group data-settings"><input className="field" placeholder="Название нового набора" maxLength={60} value={packName} onChange={e=>setPackName(e.target.value)}/><label className="settings-hint">Эмодзи набора <input className="field" style={{maxWidth:75}} value={packEmoji} onChange={e=>setPackEmoji(e.target.value)}/></label><label className="settings-hint"><input type="checkbox" checked={packPublic} onChange={e=>setPackPublic(e.target.checked)}/> Доступен всем участникам Connect</label><button type="button" className="settings-action" disabled={busy||!packName.trim()} onClick={()=>void createCustomPack()}>Создать набор</button></div>
                    {customPacks.filter(p=>p.owner_id===user.id).map(p=><div key={p.id} className="settings-group data-settings"><strong>{p.emoji} {p.name} · {customStickers.filter(st=>st.pack_id===p.id).length} шт.</strong><small>{p.is_public?'Общий набор':'Личный набор'}</small><div className="connect-custom-grid">{customStickers.filter(st=>st.pack_id===p.id).map(st=><button key={st.id} type="button" onClick={()=>void deleteCustomSticker(st)} title="Удалить стикер"><img src={customStickerUrl(st)} alt={st.name}/></button>)}</div><button className="settings-action" type="button" onClick={()=>{setCustomPack(p.id);setTimeout(()=>document.getElementById('connect-sticker-upload')?.click(),0)}}>Добавить стикеры</button><button className="settings-action secondary" type="button" onClick={()=>void deleteCustomPack(p)}>Удалить набор</button>{customPack===p.id&&<input id="connect-sticker-upload" type="file" accept="image/png,image/webp,image/gif" multiple hidden onChange={e=>void uploadCustomStickers(e.target.files)}/>}</div>)}
                    <p className="settings-hint">В чате нажмите ☺ рядом с полем сообщения. Есть избранное и недавно отправленные.</p></>}
                  {settingsPage==='members' && admin && <div className="settings-group data-settings"><strong>Приглашения</strong><p className="settings-hint">Создавайте одноразовые коды для новых участников. Код действует 24 часа.</p><button type="button" className="settings-action" onClick={()=>window.dispatchEvent(new Event('connect:open-invitations'))}>Коды приглашений</button></div>}
                  {settingsPage==='data' && <><div className="settings-group data-settings"><strong>Локальные данные</strong><p className="settings-hint">Сбросит тему, цвет, фон и настройки стикеров на этом устройстве. Переписки, файлы и голосовые на сервере останутся.</p><button type="button" className="settings-action secondary" onClick={clearLocalPreferences}>Очистить локальные настройки</button></div><div className="settings-group data-settings"><strong>Экспорт переписки</strong><p className="settings-hint">Экспорт всех доступных переписок в JSON (до 50 000 сообщений). Файлы вложений в архив не входят.</p><button type="button" className="settings-action" disabled={busy||conversations.length===0} onClick={()=>void exportChats()}>Экспортировать переписки</button></div></>}
                  {settingsPage==='privacy' && <><div className="settings-group data-settings"><strong>Личные переписки</strong><p className="settings-hint">Сообщения доступны участникам диалога в рамках настроенных правил доступа. Это не означает сквозное шифрование.</p></div><div className="settings-group data-settings"><strong>Удаление аккаунта</strong><p className="settings-hint">Учётная запись и личные данные будут удалены. Отправленные сообщения останутся у собеседников от имени «Удалённый пользователь».</p><button type="button" className="settings-action secondary" disabled={busy} onClick={()=>void deleteMyAccount()}>Удалить аккаунт навсегда</button></div></>}
                  {settingsPage==='about' && <div className="settings-group data-settings"><strong>Connect Messenger</strong><p>Версия 1.5</p><p><strong>Разработчики: Алина и Кирилл</strong></p><p className="settings-hint">Мессенджер для личного общения.</p></div>}
                </div>
              </>}
            </div><nav className="bottom-nav" aria-label="Основная навигация">
              {([{ id: 'chats' as const, label: 'Чаты', icon: 'chats' as const }, { id: 'contacts' as const, label: 'Контакты', icon: 'contacts' as const }, { id: 'settings' as const, label: 'Настройки', icon: 'settings' as const }]).map(item => <button type="button" key={item.id} className={'nav-tab' + (tab === item.id ? ' selected' : '')} onClick={() => switchTab(item.id)}><span className="nav-symbol"><Icon name={item.icon} size={24}/>{item.id === 'chats' && unreadTotal > 0 && <em className="nav-dot"/>}</span><small>{item.label}</small></button>)}
            </nav></>}
    {crop && <AvatarCropper url={crop.url} saving={busy} onCancel={closeCrop} onSave={blob=>void uploadAvatar(new File([blob],'avatar.jpg',{type:'image/jpeg'}))}/>}
    {notice && <button type="button" className="notice-toast"  role="status" onClick={() => setNotice('')}>{notice} <Icon name="close" size={16}/></button>}
    {forwardIds.length>0&&<div className="forward-overlay"><div className="forward-dialog"><header><strong>Переслать сообщения</strong><button type="button" onClick={()=>setForwardIds([])}><Icon name="close" size={21}/></button></header><p>Выберите получателя · {forwardIds.length} сообщ.</p><div className="forward-contacts">{contacts.map(p=><button type="button" key={p.id} disabled={busy} onClick={()=>void forwardTo(p)}><Avatar name={p.display_name} id={p.id} url={avatarUrls[p.id]}/><span>{p.display_name}</span><Icon name="chevron" size={18}/></button>)}</div></div></div>}
    {mediaViewer && <div className="connect-media-overlay" role="dialog" aria-modal="true" aria-label="Просмотр вложения" onClick={()=>setMediaViewer(null)}>
      <div className="connect-media-toolbar" onClick={e=>e.stopPropagation()}>
        <button type="button" onClick={()=>setMediaViewer(null)} aria-label="Закрыть">✕</button>
        <span>{mediaViewer.name}{galleryIndex>=0 && gallery.length>1 ? ` · ${galleryIndex+1} из ${gallery.length}` : ''}</span>
        <button type="button" disabled={savingMedia} onClick={()=>void saveAttachment(mediaViewer.path,mediaViewer.name)}>{savingMedia?'Сохранение…':'Сохранить'}</button>
      </div>
      <div className="connect-media-gallery" onClick={e=>e.stopPropagation()} onTouchStart={e=>{mediaTouchStart.current={x:e.touches[0].clientX,y:e.touches[0].clientY}}} onTouchEnd={e=>{const start=mediaTouchStart.current;mediaTouchStart.current=null;if(!start)return;const dx=e.changedTouches[0].clientX-start.x;const dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>65 && Math.abs(dx)>Math.abs(dy)*1.5)stepGallery(dx<0?1:-1)}}>
        {galleryIndex>0 && <button type="button" className="connect-gallery-arrow prev" aria-label="Предыдущее вложение" onClick={()=>stepGallery(-1)}>‹</button>}
        <div className="connect-media-stage" key={mediaViewer.path}>
          {mediaViewer.kind==='image' ? <img src={mediaViewer.url} alt={mediaViewer.name} draggable={false}/> : <video src={mediaViewer.url} controls playsInline autoPlay/>}
        </div>
        {galleryIndex>=0 && galleryIndex<gallery.length-1 && <button type="button" className="connect-gallery-arrow next" aria-label="Следующее вложение" onClick={()=>stepGallery(1)}>›</button>}
      </div>
    </div>}
    {menuMessage && <div className="context-overlay" role="presentation"><button className="context-backdrop" aria-label="Закрыть меню" type="button" onClick={() => setMenuMessage(null)}/><div className={"floating-menu menu-"+menuSide} role="dialog" aria-modal="true" aria-label="Действия с сообщением" style={{ top: `${menuTop}px` }}>
      <button type="button" onClick={() => beginForward([menuMessage.id])}><Icon name="forward" size={22}/>Переслать</button>
      <button type="button" onClick={() => startSelection([menuMessage.id])}><Icon name="check" size={22}/>Выбрать</button>
      <button type="button" onClick={() => {hideMessages([menuMessage.id])}}><Icon name="trash" size={22}/>Удалить у себя</button>
      <button type="button" onClick={() => startReply(menuMessage)}><Icon name="reply" size={23}/>Ответить</button>
      {menuMessage.sender_id === user?.id && <button type="button" onClick={() => startEdit(menuMessage)}><Icon name="edit" size={22}/>Редактировать</button>}
      <button type="button" onClick={() => void copyText(menuMessage)}><Icon name="copy" size={22}/>Скопировать текст</button>
      {menuMessage.sender_id === user?.id && <><div className="menu-separator"/><button type="button" className="destructive" onClick={() => void removeForEveryone([menuMessage.id])}><Icon name="trash" size={22}/>Удалить у всех</button></>}
    </div></div>}
  </div>;
}
