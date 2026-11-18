'use client';
import { memo,useEffect,useRef,useState } from 'react';
import { isNativeMediaRuntime,prewarmChatWave,readChatWave } from '../../lib/chat-media-presentation';
import { refreshMediaUrl } from '../../lib/chat/media-preview';
import { timeLabel } from '../../lib/chat/model';
import { mediaCacheOwner,prefetchChatAudio,resolveCachedMedia } from '../../lib/media-cache';
import { Icon,MessageChecks } from './Primitives';



function voiceTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}


const voiceWaveformCache = new Map<string, {bars:number[];duration:number}>();

const VoicePlayer = memo(function VoicePlayer({ src, path, byteSize, sentAt, mine, delivered, read, fileName, onSave }: { src:string;path:string;byteSize?:number;sentAt:string;mine:boolean;delivered:boolean;read:boolean;fileName?:string;onSave?:()=>void }) {
  const waveOwner=mediaCacheOwner();
  const savedWave=readChatWave(waveOwner,path);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(()=>savedWave?.duration||0);
  const [position, setPosition] = useState(0);
  const [bars, setBars] = useState<number[]>(()=>savedWave?.bars||Array(43).fill(0.28));
  const [error, setError] = useState(false);
  const [buffering,setBuffering] = useState(false);
  const [playSrc,setPlaySrc] = useState(src||'');
  const seeking = useRef(false);
  useEffect(()=>{
    let current=true;
    setPlaySrc(src||'');setError(false);
    // Resolve a previously warmed IndexedDB copy before the user presses play.
    // Do not await anything inside the click handler: iOS needs user activation.
    if(waveOwner&&path){
      const identity='/storage/v1/object/sign/connect-attachments/'+path;
      void resolveCachedMedia(identity,waveOwner).then(local=>{
        if(current&&local.startsWith('blob:')&&(!audioRef.current||(audioRef.current.paused&&audioRef.current.currentTime===0)))setPlaySrc(local);
      }).catch(()=>{});
    }
    return()=>{current=false;};
  },[src,path,waveOwner]);
  const wavePointer=useRef<{x:number;y:number;started:number}|null>(null);

  // CONNECT_PWA_VOICE_WAVE_LAZY_RESTORE_20261116
  useEffect(() => {
    const syncWave=()=>{
      const saved=isNativeMediaRuntime()?voiceWaveformCache.get(path):readChatWave(waveOwner,path);
      if(saved){setBars(saved.bars);setDuration(saved.duration);return true;}
      return false;
    };
    if(syncWave())return;
    setBars(Array(43).fill(0.28));setDuration(0);
    // Only a small, visible audio item can trigger a waveform download.
    // Never walk the entire history or decode on chat mount.
    if(isNativeMediaRuntime()||!waveOwner||!path||!src||!byteSize||byteSize>2*1024*1024)return;
    let disposed=false;
    const updated=(event:Event)=>{
      const detail=(event as CustomEvent<{user:string;path:string}>).detail;
      if(!disposed&&detail?.user===waveOwner&&detail.path===path)syncWave();
    };
    window.addEventListener('connect:chat-wave',updated);
    const generate=async()=>{
      try{
        // Shares the existing bounded media-cache job with the audio prefetch;
        // no second full-object GET if it was already being cached.
        if(byteSize<=1024*1024)await prefetchChatAudio(src,waveOwner,byteSize);
        if(disposed)return;
        const identity='/storage/v1/object/sign/connect-attachments/'+path;
        const local=await resolveCachedMedia(identity,waveOwner).catch(()=>identity);
        if(disposed)return;
        await prewarmChatWave(waveOwner,path,local.startsWith('blob:')?local:src,byteSize);
        if(!disposed)syncWave();
      }catch{/* Waveform is optional; playback must remain available. */}
    };
    const node=audioRef.current?.parentElement;
    if(typeof IntersectionObserver==='undefined'||!node){void generate();return()=>{disposed=true;window.removeEventListener('connect:chat-wave',updated);};}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();void generate();}
    },{root:node.closest('.message-scroll'),rootMargin:'100px 0px'});
    observer.observe(node);
    return()=>{disposed=true;observer.disconnect();window.removeEventListener('connect:chat-wave',updated);};
  }, [src,path,waveOwner,byteSize]);

  async function toggle() {
    const audio=audioRef.current;
    if(!audio||buffering)return;
    if(!audio.paused){audio.pause();return;}
    document.querySelectorAll<HTMLAudioElement>('audio[data-connect-voice]').forEach(other=>{
      if(other!==audio)other.pause();
    });
    setError(false);
    setBuffering(true);
    try {
      const identity='/storage/v1/object/sign/connect-attachments/'+path;
      let current=playSrc||src||'';
      if(!current){
        const cached=await resolveCachedMedia(identity,waveOwner).catch(()=>identity);
        current=cached.startsWith('blob:')?cached:(await refreshMediaUrl(identity)||'');
        if(!current)throw new Error('Voice message URL is not ready');
        audio.src=current;setPlaySrc(current);
      }
      try {
        // For normal, already-signed files play() runs in the user click gesture.
        await audio.play();
      } catch(firstError) {
        if(!navigator.onLine||audio.error?.code===3||audio.error?.code===4)throw firstError;
        const renewed=await refreshMediaUrl(identity);
        if(!renewed||renewed===current)throw firstError;
        audio.src=renewed;setPlaySrc(renewed);audio.load();
        await audio.play();
      }
    } catch {setError(true);}
    finally {setBuffering(false);}
  }
  function seek(e: React.PointerEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = fraction * audio.duration;
    setPosition(audio.currentTime);
  }
  const progress = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  return <div className="voice-player">
    <audio ref={audioRef} data-connect-voice src={playSrc||undefined} preload="none"
      onLoadedMetadata={e => { setError(false); const d=e.currentTarget.duration; if(Number.isFinite(d))setDuration(d); }}
      onDurationChange={e => { const d=e.currentTarget.duration; if(Number.isFinite(d))setDuration(d); }}
      onTimeUpdate={e => setPosition(e.currentTarget.currentTime)}
      onPlay={() => {setPlaying(true);setError(false);setBuffering(false);}} onPause={() => setPlaying(false)}
      onEnded={() => {setPlaying(false);setPosition(0);}} onError={() => {setError(true);setBuffering(false);}}/>
    <button type="button" className="voice-play" onClick={e => {e.stopPropagation();void toggle();}} aria-label={playing ? 'Пауза' : 'Воспроизвести голосовое'} disabled={buffering}>
      {playing ? <span className="voice-pause-icon"/> : <Icon name="play" size={21}/>}
    </button>
    <div className="voice-content connect-voice-v4-content">
      <div className={'connect-voice-v4-top'+(fileName?' has-file':'')}>
        {fileName&&<div className="voice-file-name" title={fileName}>{fileName}</div>}
        <div className="voice-wave" role="slider" tabIndex={0} aria-label="Перемотка голосового сообщения" aria-valuemin={0} aria-valuemax={Math.max(0,Math.round(duration))} aria-valuenow={Math.round(position)}
        onPointerDown={e => {e.stopPropagation();seeking.current=false;wavePointer.current={x:e.clientX,y:e.clientY,started:performance.now()};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e => {const p=wavePointer.current;if(!p)return;if(Math.abs(e.clientY-p.y)>Math.abs(e.clientX-p.x)+8){wavePointer.current=null;seeking.current=false;return;}if(Math.abs(e.clientX-p.x)>8)seeking.current=true;if(seeking.current)seek(e);}}
        onPointerUp={e => {const p=wavePointer.current;if(p&&(seeking.current||performance.now()-p.started<480))seek(e);wavePointer.current=null;seeking.current=false;e.stopPropagation();}}
        onPointerCancel={() => {wavePointer.current=null;seeking.current=false;}}
        onKeyDown={e => {const audio=audioRef.current;if(!audio)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();audio.currentTime=Math.max(0,Math.min(duration,audio.currentTime+(e.key==='ArrowRight'?5:-5)));}}}>
        {bars.map((height,i) => <span key={i} className={'voice-bar'+(i / bars.length <= progress ? ' listened' : '')} style={{height:`${Math.round(4+height*22)}px`}}/>)}
        </div>
      </div>
      <div className="voice-bottom connect-voice-v4-bottom"><span>{buffering ? 'Загружаю аудио…' : error ? 'Не удалось воспроизвести' : `${voiceTime(playing || position > 0 ? position : duration)}${playing || position > 0 ? ' / '+voiceTime(duration) : ''}`}</span>{onSave&&<button className="voice-save" type="button" onClick={e=>{e.stopPropagation();onSave();}}>Сохранить</button>}<span className="voice-message-meta">{timeLabel(sentAt)}{mine && <MessageChecks delivered={delivered} read={read}/>}</span></div>
    </div>
  </div>;
});
export { VoicePlayer,voiceTime,voiceWaveformCache };
