'use client';
import { useEffect,useRef,useState } from 'react';
import { getHotChatPoster,isNativeMediaRuntime,rememberChatPoster } from '../../lib/chat-media-presentation';
import { cachedChatPoster,connectUpdateVideoFrame,preserveVisibleChatFrame,syncVideoThumbnailSize } from '../../lib/chat/media-preview';
import { timeLabel } from '../../lib/chat/model';
import { mediaCacheOwner } from '../../lib/media-cache';
import { browserSupabase } from '../../lib/supabase-browser';
import { MessageChecks } from './Primitives';
const supabase=browserSupabase();


function VideoThumbnail({src,path}:{src:string;path?:string}) {
  const [poster,setPoster]=useState<string|null>(null);
  const [uploadedPoster,setUploadedPoster]=useState<string|null>(()=>path?getHotChatPoster(mediaCacheOwner(),path):null);
  const [failed,setFailed]=useState(false);
  const [posterChecked,setPosterChecked]=useState(false),[near,setNear]=useState(false);
  const frameRef=useRef<HTMLSpanElement|null>(null);
  const videoRef=useRef<HTMLVideoElement|null>(null);
  useEffect(()=>{const frame=frameRef.current;if(!frame)return;const io=new IntersectionObserver(items=>setNear(Boolean(items[0]?.isIntersecting)),{root:frame.closest('.message-scroll'),rootMargin:'120px'});io.observe(frame);return()=>io.disconnect();},[]);
  useEffect(()=>{setPoster(null);setFailed(false)},[src]);
  useEffect(() => {
    setUploadedPoster(path?getHotChatPoster(mediaCacheOwner(),path):null);setPosterChecked(false);
    if (!path || !/__vid_\d{1,5}x\d{1,5}$/.test(path) || !supabase) {setPosterChecked(true);return;}
    if(!near)return;
    let cancelled = false;
    void cachedChatPoster(path).then(url=>{if(!cancelled){if(url)rememberChatPoster(mediaCacheOwner(),path,url);setUploadedPoster(url);setPosterChecked(true);}})
      .catch(()=>{if(!cancelled)setPosterChecked(true);});
    return () => {cancelled = true;};
  }, [path,near]);
  function capture(video:HTMLVideoElement){
    if(!video.videoWidth||!video.videoHeight)return;
    if(!isNativeMediaRuntime()&&path){
      preserveVisibleChatFrame(video,path,url=>{setPoster(url);setUploadedPoster(url);});
      return;
    }
    try{
      const canvas=document.createElement('canvas');
      const scale=Math.min(1,480/video.videoWidth,480/video.videoHeight);
      canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
      canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
      canvas.getContext('2d')?.drawImage(video,0,0,canvas.width,canvas.height);
      const url=canvas.toDataURL('image/jpeg',.78);
      if(url.length>100){setPoster(url);if(path)rememberChatPoster(mediaCacheOwner(),path,url);}
    }catch{setFailed(true)}
  }
  return <span ref={frameRef} className={isNativeMediaRuntime()?"connect-video-preview":"connect-video-preview connect-pwa-frame-fit"}>
    {(uploadedPoster || poster) && <img src={uploadedPoster || poster || ''} alt="Предпросмотр видео" onError={()=>{setUploadedPoster(null);setPosterChecked(true);}}/>}
    {near&&posterChecked&&!uploadedPoster&&!poster&&<video ref={videoRef} src={src} playsInline muted preload="metadata"
      onLoadedMetadata={e=>{const v=e.currentTarget;if(path)connectUpdateVideoFrame(v,path);else syncVideoThumbnailSize(v);try{v.currentTime=path && Number.isFinite(v.duration) && v.duration>.3 ? Math.min(1.2,Math.max(.3,v.duration*.12),v.duration*.8) : Math.min(.2,Math.max(0,(Number.isFinite(v.duration)?v.duration:1)-.01))}catch{setFailed(true)}}}
      onSeeked={e=>{if(path)connectUpdateVideoFrame(e.currentTarget,path);else syncVideoThumbnailSize(e.currentTarget);capture(e.currentTarget)}}
      onLoadedData={e=>{if(path)connectUpdateVideoFrame(e.currentTarget,path);else syncVideoThumbnailSize(e.currentTarget);if(!poster)capture(e.currentTarget)}}
      onError={()=>setFailed(true)}
      style={poster?{visibility:'hidden'}:undefined}/>}
    {failed&&!poster&&<span className="connect-video-fallback">Видео</span>}
  </span>;
}


// Keep decoder/network ownership outside render; only one visible inline video owns it.
type VisibleVideo={visible:boolean;paused:()=>boolean;activate:(active:boolean)=>void};

const visibleVideos=new Map<HTMLVideoElement,VisibleVideo>();

let preferredVideo:HTMLVideoElement|null=null;

let inlineVideoForeground=true;

if(typeof window!=='undefined')window.addEventListener('connect:native-lifecycle',event=>{inlineVideoForeground=(event as CustomEvent).detail==='active';reconcileVisibleVideos();});

function claimVisibleVideo(video:HTMLVideoElement){preferredVideo=video;reconcileVisibleVideos();}

function reconcileVisibleVideos(){
 const candidates=[...visibleVideos].filter(([,item])=>item.visible&&!item.paused()&&inlineVideoForeground&&document.visibilityState==='visible');
 candidates.sort(([a],[b])=>Number(b===preferredVideo)-Number(a===preferredVideo)||Math.abs(a.getBoundingClientRect().top-innerHeight/2)-Math.abs(b.getBoundingClientRect().top-innerHeight/2));
 const winner=candidates[0]?.[0];for(const[video,item]of visibleVideos)item.activate(video===winner);
}

function useVisibleVideo(ref:{current:HTMLVideoElement|null},src:string,userPaused:{current:boolean},muted:{current:boolean},onBeforeDetach?:(video:HTMLVideoElement)=>void){
  const onBeforeDetachRef=useRef(onBeforeDetach);
  onBeforeDetachRef.current=onBeforeDetach;
  const resumePosition=useRef(0);
 useEffect(()=>{
  const video=ref.current;if(!video)return;let attached=false;
  const resume=()=>{if(resumePosition.current>0&&Number.isFinite(video.duration))video.currentTime=Math.min(resumePosition.current,Math.max(0,video.duration-.05));};
  video.addEventListener('loadedmetadata',resume);
  const item:VisibleVideo={visible:false,paused:()=>userPaused.current,activate(active){
   if(active){video.muted=muted.current;if(!attached){attached=true;video.src=src;video.load();}if(video.paused)void video.play().catch(()=>{});}
   else if(attached){if(!isNativeMediaRuntime())onBeforeDetachRef.current?.(video);resumePosition.current=video.currentTime||resumePosition.current;attached=false;video.pause();video.removeAttribute('src');video.load();}
  }};
  visibleVideos.set(video,item);
  const observer=new IntersectionObserver(entries=>{item.visible=Boolean(entries[0]?.isIntersecting);reconcileVisibleVideos();},{root:video.closest('.message-scroll'),threshold:.35});
  observer.observe(video);document.addEventListener('visibilitychange',reconcileVisibleVideos);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',reconcileVisibleVideos);visibleVideos.delete(video);if(preferredVideo===video)preferredVideo=null;item.activate(false);video.removeEventListener('loadedmetadata',resume);reconcileVisibleVideos();};
 },[ref,src,userPaused,muted]);
}


// Connect inline autoplay video and separate audio controls v1
function ConnectSoundGlyph({muted}:{muted:boolean}) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9h4l4-3v12l-4-3H4z"/>
    {muted ? <path d="m16 9 5 6m0-6-5 6"/> : <><path d="M16 9c1.5 1.1 1.5 4.9 0 6"/><path d="M19 6c3.5 3 3.5 9 0 12"/></>}
  </svg>;
}


function ConnectInlineAutoplayVideo({src,path,onOpen}:{src:string;path:string;onOpen:()=>void}) {
  const ref=useRef<HTMLVideoElement|null>(null);
  const soundRef=useRef(true);
  const [muted,setMuted]=useState(true);
  const [poster,setPoster]=useState<string|null>(()=>getHotChatPoster(mediaCacheOwner(),path));
  const [error,setError]=useState(false);
  const [frameReady,setFrameReady]=useState(false);
  const firstFrameStored=useRef(false);
  const freezeFrame=(video:HTMLVideoElement)=>{preserveVisibleChatFrame(video,path,setPoster);};

  useEffect(()=>{
    setPoster(getHotChatPoster(mediaCacheOwner(),path));setError(false);setFrameReady(false);firstFrameStored.current=false;
    if(!supabase || !/__vid_\d{1,5}x\d{1,5}$/.test(path))return;
    let cancelled=false;
    void cachedChatPoster(path).then(url=>{if(!cancelled&&url)setPoster(previous=>previous?.startsWith('data:')?previous:url);}).catch(()=>{});
    return()=>{cancelled=true;};
  },[path]);

  const userPaused=useRef(false);
  useVisibleVideo(ref,src,userPaused,soundRef,freezeFrame);

  return <div className={isNativeMediaRuntime()?"connect-inline-autoplay-video":"connect-inline-autoplay-video connect-pwa-frame-fit"}>
    <button type="button" className="connect-inline-autoplay-video-open" aria-label="Открыть видео на весь экран"
      onClick={event=>{event.stopPropagation();onOpen();}}>
      {!isNativeMediaRuntime()&&(poster?<img className="connect-inline-video-still" src={poster} alt="" aria-hidden="true"/>:<span className="connect-inline-video-still-fallback" aria-hidden="true">▶</span>)}
      <video ref={ref} poster={poster||undefined} muted={muted} loop playsInline preload="none" crossOrigin={isNativeMediaRuntime()?undefined:'anonymous'}
        style={isNativeMediaRuntime()?undefined:{opacity:frameReady?1:0}}
        onLoadedMetadata={event=>connectUpdateVideoFrame(event.currentTarget,path)}
        onEmptied={()=>{if(!isNativeMediaRuntime())setFrameReady(false);}}
        onTimeUpdate={event=>{if(isNativeMediaRuntime())return;const video=event.currentTarget;if(video.currentTime>.12){setFrameReady(true);if(!firstFrameStored.current){firstFrameStored.current=preserveVisibleChatFrame(video,path,setPoster);}}}}
        onError={()=>setError(true)}/>
      {error&&<span className="connect-inline-video-error">Видео недоступно</span>}
    </button>
    <button type="button" className="connect-inline-video-sound" aria-label={muted?'Включить звук':'Выключить звук'}
      title={muted?'Включить звук':'Выключить звук'}
      onClick={event=>{
        event.stopPropagation();const video=ref.current;if(!video)return;
        const next=!video.muted;
        soundRef.current=next;video.muted=next;setMuted(next);
        if(!next){userPaused.current=false;claimVisibleVideo(video);}
      }}><ConnectSoundGlyph muted={muted}/></button>
  </div>;
}


// Connect video-note sound control v3: round progress and mute below the circle
function VideoNoteBubble({src,name,path,sentAt,mine,delivered,read}:{src:string;name:string;path:string;sentAt:string;mine:boolean;delivered:boolean;read:boolean}) {
  const [poster,setPoster] = useState<string|undefined>(()=>getHotChatPoster(mediaCacheOwner(),path)||undefined);
  const [videoFrameReady,setVideoFrameReady]=useState(false);
  const firstFrameStored=useRef(false);
  useEffect(()=>{
    let alive=true;
    setPoster(getHotChatPoster(mediaCacheOwner(),path)||undefined);firstFrameStored.current=false;
    if(supabase)void cachedChatPoster(path).then(url=>{if(alive&&url)setPoster(url);}).catch(()=>{});
    return()=>{alive=false;};
  },[path]);
  const ref=useRef<HTMLVideoElement|null>(null);
  const [muted,setMuted]=useState(true);
  const [duration,setDuration]=useState(0);
  const [expanded,setExpanded]=useState(false);
  const [progress,setProgress]=useState(0);
  const userPaused=useRef(false),mutedRef=useRef(true);
  const freezeFrame=(video:HTMLVideoElement)=>{preserveVisibleChatFrame(video,path,setPoster,true);};
  useVisibleVideo(ref,src,userPaused,mutedRef,freezeFrame);
  const circumference=2*Math.PI*47;
  const toggleNote=(event:React.MouseEvent)=>{
    event.stopPropagation();
    const video=ref.current;
    if(!video)return;
    if(!expanded){
      setExpanded(true);
      userPaused.current=false;
      claimVisibleVideo(video);
      void video.play().catch(()=>{});
      return;
    }
    userPaused.current=!video.paused;
    if(!userPaused.current)claimVisibleVideo(video);else reconcileVisibleVideos();
  };
  const closeNote=(event:React.MouseEvent)=>{
    event.stopPropagation();
    setExpanded(false);
    userPaused.current=true;
    ref.current?.pause();
  };
  return <div className={'connect-v4-video-note connect-v5-video-note'+(expanded?' is-expanded':'')+(!isNativeMediaRuntime()?' connect-pwa-frame-fit':'')}>
    <div className="connect-v5-note-stage">
      <div className="connect-v4-note-circle">
        {!isNativeMediaRuntime()&&(poster?<img className="connect-note-still" src={poster} alt="" aria-hidden="true"/>:<span className="connect-note-still connect-note-still-fallback" aria-hidden="true">▶</span>)}
        <video ref={ref} className="connect-v4-note-video" poster={poster} crossOrigin={isNativeMediaRuntime()?undefined:'anonymous'} muted={muted} playsInline loop preload="none" aria-label={name} style={isNativeMediaRuntime()?undefined:{opacity:videoFrameReady?1:0}}
          onLoadedData={()=>{/* Wait for a drawable frame instead of revealing iOS decoder black. */}}
          onEmptied={()=>{if(!isNativeMediaRuntime())setVideoFrameReady(false);}}
          onLoadedMetadata={event=>{const d=event.currentTarget.duration;if(Number.isFinite(d)&&d>0)setDuration(d);}}
          onTimeUpdate={event=>{const v=event.currentTarget,d=v.duration;if(Number.isFinite(d)&&d>0)setProgress(Math.max(0,Math.min(1,v.currentTime/d)));if(!isNativeMediaRuntime()&&v.currentTime>.12){setVideoFrameReady(true);if(!firstFrameStored.current)firstFrameStored.current=preserveVisibleChatFrame(v,path,setPoster,true);}}}
          onSeeked={event=>{const v=event.currentTarget,d=v.duration;if(Number.isFinite(d)&&d>0)setProgress(Math.max(0,Math.min(1,v.currentTime/d)));}}/>
        <button type="button" className="connect-v4-note-hit" aria-label={expanded?'Приостановить или воспроизвести видеокружок':'Увеличить и воспроизвести видеокружок'} onClick={toggleNote}/>
        <svg className="connect-v4-note-progress" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="connect-v4-note-track" cx="50" cy="50" r="47" fill="none" strokeWidth="1.0"/>
          <circle className="connect-v4-note-progress-fill" cx="50" cy="50" r="47" fill="none" strokeWidth="1.0"
            strokeDasharray={circumference} strokeDashoffset={circumference*(1-progress)}/>
        </svg>
        {duration>0&&<span className="connect-v4-note-length">{Math.floor(duration/60)}:{String(Math.floor(duration%60)).padStart(2,'0')}</span>}
      </div>
      {expanded&&<button type="button" className="connect-v4-note-close connect-v5-note-close" aria-label="Свернуть видеокружок" onClick={closeNote}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>
      </button>}
      <button type="button" className="connect-v4-note-sound connect-v5-note-sound" aria-label={muted?'Включить звук видеокружка':'Выключить звук видеокружка'}
        title={muted?'Включить звук':'Выключить звук'} onClick={event=>{
          event.stopPropagation();
          const video=ref.current;if(!video)return;
          const next=!video.muted;
          mutedRef.current=next;video.muted=next;setMuted(next);
          if(!next){userPaused.current=false;claimVisibleVideo(video);}
        }}><ConnectSoundGlyph muted={muted}/></button>
      <span className="connect-v4-note-time connect-v5-note-time">{timeLabel(sentAt)}{mine&&<MessageChecks delivered={delivered} read={read}/>}</span>
    </div>
  </div>;
}
export { claimVisibleVideo,ConnectInlineAutoplayVideo,ConnectSoundGlyph,inlineVideoForeground,preferredVideo,reconcileVisibleVideos,useVisibleVideo,VideoNoteBubble,VideoThumbnail,visibleVideos };
export type { VisibleVideo };
