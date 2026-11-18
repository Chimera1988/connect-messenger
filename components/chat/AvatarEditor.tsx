'use client';
import { useEffect,useRef,useState } from 'react';


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
export { AvatarCropper,PendingAttachment };
export type { CropState };
