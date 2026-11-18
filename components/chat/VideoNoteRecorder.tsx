'use client';
import { useEffect,useRef,useState } from 'react';
import { isNativeMediaRuntime } from '../../lib/chat-media-presentation';


type VideoNotePhase = 'loading'|'ready'|'recording'|'review'|'error';

function VideoNoteRecorder({onClose,onSend,onRecordingChange}:{onClose:()=>void;onSend:(file:File)=>void;onRecordingChange:(recording:boolean)=>void}) {
  const live=useRef<HTMLVideoElement|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const timerRef=useRef<number|null>(null);
  const startRef=useRef(0);
  const previewRef=useRef<string|null>(null);
  const savedRef=useRef<File|null>(null);
  const flipPending=useRef(false);
  // Connect video-note orientation normalization v1
  const normalizedStreamRef=useRef<MediaStream|null>(null);
  const frameRequestRef=useRef<number|null>(null);
  const [phase,setPhase]=useState<VideoNotePhase>('loading');
  const [facing,setFacing]=useState<'user'|'environment'>('user');
  const [seconds,setSeconds]=useState(0);
  const [preview,setPreview]=useState<string|null>(null);
  const [error,setError]=useState('');
  function stopCamera(){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
  function clearClock(){if(timerRef.current!==null){window.clearInterval(timerRef.current);timerRef.current=null;}}
  function stopNormalizedFrames(){
    if(frameRequestRef.current!==null){window.cancelAnimationFrame(frameRequestRef.current);frameRequestRef.current=null;}
    normalizedStreamRef.current?.getTracks().forEach(track=>track.stop());
    normalizedStreamRef.current=null;
  }
  function normalizedRecordingStream(camera:MediaStream):MediaStream{
    const source=live.current;
    if(!source || !source.videoWidth || !source.videoHeight)throw Error('Камера ещё не готова, повторите запись');
    const canvas=document.createElement('canvas');
    canvas.width=480;canvas.height=480;
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)throw Error('Не удалось подготовить запись видео');
    // Preserve recording on older browsers that lack canvas.captureStream.
    if(typeof canvas.captureStream!=='function')return camera;
    const draw=()=>{
      if(source.readyState>=2&&source.videoWidth>0&&source.videoHeight>0){
        const crop=Math.min(source.videoWidth,source.videoHeight);
        const x=(source.videoWidth-crop)/2;
        const y=(source.videoHeight-crop)/2;
        context.drawImage(source,x,y,crop,crop,0,0,480,480);
      }
      frameRequestRef.current=window.requestAnimationFrame(draw);
    };
    draw();
    const pixels=canvas.captureStream(24);
    normalizedStreamRef.current=pixels;
    const track=pixels.getVideoTracks()[0];
    if(!track)throw Error('Не удалось получить видео для записи');
    return new MediaStream([track,...camera.getAudioTracks()]);
  }
  useEffect(()=>{
    let disposed=false;
    void (async()=>{
      try{
        if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Error('Запись видеокружков не поддерживается браузером');
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:480},height:{ideal:480}},audio:{echoCancellation:true,noiseSuppression:true}});
        if(disposed){stream.getTracks().forEach(t=>t.stop());return;}
        streamRef.current=stream;
        if(live.current){live.current.srcObject=stream;void live.current.play().catch(()=>{});}
        setPhase('ready');
      }catch(e){if(!disposed){setError(e instanceof Error?e.message:'Не удалось открыть камеру');setPhase('error');}}
    })();
    return()=>{
      disposed=true;clearClock();onRecordingChange(false);
      const recorder=recorderRef.current;
      if(recorder&&recorder.state!=='inactive')try{recorder.onstop=null;recorder.stop();}catch{}
      stopNormalizedFrames();
      stopCamera();
      if(previewRef.current)URL.revokeObjectURL(previewRef.current);
    };
  },[]);
  function start(){
    const stream=streamRef.current;if(!stream||phase!=='ready'||flipPending.current||recorderRef.current?.state==='recording')return;
    try{
      const formats=['video/mp4;codecs=h264,aac','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
      const mime=formats.find(x=>MediaRecorder.isTypeSupported(x));
      const recordingStream=normalizedRecordingStream(stream);
      const recorder=new MediaRecorder(recordingStream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:isNativeMediaRuntime()?800000:720000,audioBitsPerSecond:isNativeMediaRuntime()?64000:56000});
      chunksRef.current=[];recorderRef.current=recorder;savedRef.current=null;
      recorder.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data)};
      recorder.onerror=()=>{onRecordingChange(false);setError('Ошибка записи видео');setPhase('error');clearClock();stopNormalizedFrames();stopCamera()};
      recorder.onstop=()=>{
        onRecordingChange(false);clearClock();stopNormalizedFrames();stopCamera();
        const type=recorder.mimeType||chunksRef.current[0]?.type||'video/webm';
        const blob=new Blob(chunksRef.current,{type});
        if(blob.size<100){setError('Видео не записалось. Попробуйте ещё раз.');setPhase('error');return;}
        const ext=type.includes('mp4')?'mp4':'webm';
        savedRef.current=new File([blob],`connect-video-note-${Date.now()}.${ext}`,{type});
        const url=URL.createObjectURL(blob);previewRef.current=url;setPreview(url);setPhase('review');
      };
      recorder.start(1000);startRef.current=Date.now();setSeconds(0);setPhase('recording');onRecordingChange(true);
      timerRef.current=window.setInterval(()=>{
        const time=Math.floor((Date.now()-startRef.current)/1000);
        setSeconds(Math.min(60,time));
        if(time>=60&&recorder.state==='recording')recorder.stop();
      },250);
    }catch(e){onRecordingChange(false);stopNormalizedFrames();setError(e instanceof Error?e.message:'Не удалось начать запись');setPhase('error')}
  }
  function stop(){if(recorderRef.current?.state==='recording')recorderRef.current.stop()}
  async function flipCamera() {
    if(phase!=='ready'||!streamRef.current||flipPending.current||recorderRef.current?.state==='recording')return;
    const previous=streamRef.current;flipPending.current=true;setPhase('loading');
    const nextFacing=facing==='user'?'environment':'user';
    try {
      const stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:nextFacing},width:{ideal:480},height:{ideal:480}},
        audio:{echoCancellation:true,noiseSuppression:true}
      });
      if(streamRef.current!==previous){stream.getTracks().forEach(track=>track.stop());return;}
      previous.getTracks().forEach(track=>track.stop());
      streamRef.current=stream;
      if(live.current){live.current.srcObject=stream;void live.current.play().catch(()=>{});}
      setFacing(nextFacing);setError('');setPhase('ready');
    } catch(e) {if(streamRef.current===previous){setError('Не удалось переключить камеру: '+(e instanceof Error?e.message:String(e)));setPhase('ready');}}
    finally{flipPending.current=false;}
  }
  function cancel(){onRecordingChange(false);onClose()}
  return <div className="connect-vnote-backdrop" role="dialog" aria-modal="true" aria-label="Запись видеокружка">
    <div className="connect-vnote-panel">
      <div className="connect-vnote-header"><strong>Видеокружок</strong><button type="button" onClick={cancel} aria-label="Закрыть">✕</button></div>
      <div className={'connect-vnote-preview'+(phase==='recording'?' is-recording':'')}>
        <video ref={live} autoPlay muted playsInline style={{display:preview?'none':undefined}}/>
        {preview&&<video src={preview} controls playsInline preload="auto"/>}
        {phase==='loading'&&<span className="connect-vnote-hint">Открываем камеру…</span>}
      </div>
      {phase==='recording'&&<p className="connect-vnote-timer">● {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} / 1:00</p>}
      {phase==='error'&&<p className="connect-vnote-error">{error}</p>}
      <div className="connect-vnote-actions">
        <button type="button" onClick={cancel}>Отмена</button>
        {phase==='ready'&&<button type="button" onClick={()=>void flipCamera()}>↻ Камера</button>}
        {phase==='ready'&&<button type="button" className="connect-vnote-primary" onClick={start}>● Записать</button>}
        {phase==='recording'&&<button type="button" className="connect-vnote-primary" onClick={stop}>■ Остановить</button>}
        {phase==='review'&&<button type="button" className="connect-vnote-primary" onClick={()=>{const file=savedRef.current;if(file)onSend(file)}}>Отправить</button>}
      </div>
    </div>
  </div>;
}
export { VideoNoteRecorder };
export type { VideoNotePhase };
