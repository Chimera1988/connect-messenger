import type { CSSProperties } from 'react';
import { getHotChatPoster,isNativeMediaRuntime,rememberChatPoster } from '../chat-media-presentation';
import { mediaCacheOwner,mediaIdentity,prefetchCachedMedia,resolveCachedMedia,storeGeneratedChatPoster } from '../media-cache';
import { browserSupabase,mediaUrl } from '../supabase-browser';
const supabase=browserSupabase();


// Signed storage links expire independently of authentication. Renew only the
// failing object through the existing session, never make a private bucket public.
async function refreshMediaUrl(source: string): Promise<string | undefined> {
  const identity = mediaIdentity(source);
  if (!supabase || !identity) return;
  const slash = identity.indexOf('/'), bucket = identity.slice(0, slash);
  if (slash < 1 || !['connect-avatars', 'connect-attachments', 'connect-stickers', 'connect-profile-media'].includes(bucket)) return;
  const {data} = await supabase.storage.from(bucket).createSignedUrl(identity.slice(slash + 1), 3600);
  return data?.signedUrl ? mediaUrl(data.signedUrl) : undefined;
}


// Use the video's decoded dimensions rather than forcing every preview to 16:9.
// Only change the standalone message thumbnail; album grid cells keep their own layout.
function syncVideoThumbnailSize(video: HTMLVideoElement) {
  const width=video.videoWidth, height=video.videoHeight;
  if(width<=0||height<=0)return;
  const button=video.closest<HTMLButtonElement>('button.connect-media-thumb');
  if(!button||button.closest('.connect-album-grid'))return;
  const ratio=Math.max(0.25,Math.min(4,width/height));
  button.style.setProperty('--connect-video-ratio', `${width} / ${height}`);
  button.style.setProperty('--connect-video-width', `${Math.round(Math.min(300,340*ratio))}px`);
}


type ConnectPhotoSize = { width: number; height: number };

const connectPhotoSizeCache = new Map<string, ConnectPhotoSize>();


function connectPhotoDimensions(path: string): ConnectPhotoSize | null {
  const match = /__img_(\d{1,5})x(\d{1,5})$/.exec(path);
  if (match) {
    const width = Number(match[1]), height = Number(match[2]);
    if (width > 0 && height > 0) return { width, height };
  }
  return connectPhotoSizeCache.get(path) ?? null;
}


function connectPhotoFrameValues(size: ConnectPhotoSize): { width: string; ratio: string } {
  // The image stays proportionate and fits within 280 x 340 CSS pixels.
  const ratio = Math.max(0.35, Math.min(4, size.width / size.height));
  return { width: `${Math.round(Math.min(280, 340 * ratio))}px`, ratio: String(ratio) };
}


function connectPhotoFrameStyle(path: string): CSSProperties | undefined {
  const dimensions = connectPhotoDimensions(path);
  if (!dimensions) return undefined;
  const values = connectPhotoFrameValues(dimensions);
  return { '--connect-photo-width': values.width, '--connect-photo-ratio': values.ratio } as CSSProperties;
}


async function connectImageFileSize(file: File): Promise<ConnectPhotoSize | null> {
  if (!file.type.startsWith('image/')) return null;
  const url = URL.createObjectURL(file);
  try {
    return await new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0
        ? { width: img.naturalWidth, height: img.naturalHeight } : null);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}


function connectUpdatePhotoSize(image: HTMLImageElement, path: string) {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const frame = image.closest<HTMLElement>('.attachment-preview.connect-adaptive-photo');
  if (!frame) return;
  const dimensions = { width: image.naturalWidth, height: image.naturalHeight };
  connectPhotoSizeCache.set(path, dimensions);
  const values = connectPhotoFrameValues(dimensions);
  if (frame.style.getPropertyValue('--connect-photo-width') === values.width &&
      frame.style.getPropertyValue('--connect-photo-ratio') === values.ratio) return;

  const scroll = frame.closest<HTMLElement>('.message-scroll');
  const viewport = scroll?.getBoundingClientRect();
  const anchor = scroll && viewport
    ? Array.from(scroll.querySelectorAll<HTMLElement>('.message-day-group'))
        .find(el => el.getBoundingClientRect().bottom > viewport.top + 8)
    : undefined;
  const originalTop = anchor?.getBoundingClientRect().top;
  const nearBottom = scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 100 : false;

  frame.style.setProperty('--connect-photo-width', values.width);
  frame.style.setProperty('--connect-photo-ratio', values.ratio);
  // The first view of older files lacks dimensions. Keep the reading position
  // steady while correcting their footprint on image decode.
  if (scroll) {
    if (nearBottom) scroll.scrollTop = scroll.scrollHeight;
    else if (anchor && originalTop !== undefined)
      scroll.scrollTop += anchor.getBoundingClientRect().top - originalTop;
  }
}



type ConnectVideoPreview = { size: ConnectPhotoSize; poster: Blob | null };

const connectVideoSizeCache = new Map<string, ConnectPhotoSize>();


function connectVideoFrameStyle(path: string): CSSProperties | undefined {
  const found = /__vid_(\d{1,5})x(\d{1,5})$/.exec(path);
  const dimensions = found
    ? {width:Number(found[1]),height:Number(found[2])}
    : connectVideoSizeCache.get(path);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return undefined;
  const layout = connectPhotoFrameValues(dimensions);
  return { '--connect-video-card-width': layout.width, '--connect-video-card-ratio': layout.ratio } as CSSProperties;
}


function connectUpdateVideoFrame(video: HTMLVideoElement, path: string) {
  if (!video.videoWidth || !video.videoHeight) return;
  const frame = video.closest<HTMLElement>('.attachment-preview.connect-adaptive-video');
  if (!frame) return;
  const size = {width:video.videoWidth,height:video.videoHeight};
  connectVideoSizeCache.set(path, size);
  const values = connectPhotoFrameValues(size);
  if (frame.style.getPropertyValue('--connect-video-card-width') === values.width &&
      frame.style.getPropertyValue('--connect-video-card-ratio') === values.ratio) return;
  const scroll = frame.closest<HTMLElement>('.message-scroll');
  const view = scroll?.getBoundingClientRect();
  const anchor = scroll && view
    ? Array.from(scroll.querySelectorAll<HTMLElement>('.message-day-group'))
        .find(node => node.getBoundingClientRect().bottom > view.top + 8)
    : undefined;
  const originalTop = anchor?.getBoundingClientRect().top;
  const nearBottom = scroll ? scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight <= 100 : false;
  frame.style.setProperty('--connect-video-card-width', values.width);
  frame.style.setProperty('--connect-video-card-ratio', values.ratio);
  // Old videos did not store dimensions: preserve the reading position on first decode.
  if (scroll) {
    if (nearBottom) scroll.scrollTop = scroll.scrollHeight;
    else if (anchor && originalTop !== undefined)
      scroll.scrollTop += anchor.getBoundingClientRect().top - originalTop;
  }
}


async function connectVideoFilePreview(file: File): Promise<ConnectVideoPreview | null> {
  if (!file.type.startsWith('video/')) return null;
  const url = URL.createObjectURL(file);
  return await new Promise(resolve => {
    const video = document.createElement('video');
    video.preload = 'auto'; video.muted = true; video.playsInline = true;
    let settled = false, captured = false;
    let size: ConnectPhotoSize | null = null;
    const timer = window.setTimeout(() => finish(null), 5500);
    function finish(poster: Blob | null) {
      if (settled) return;
      settled = true; window.clearTimeout(timer);
      video.pause(); video.removeAttribute('src'); video.load();
      URL.revokeObjectURL(url);
      resolve(size ? {size, poster} : null);
    }
    function capture() {
      if (!size || captured || video.readyState < 2) return;
      captured = true;
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 480 / size.width, 480 / size.height);
        canvas.width = Math.max(1, Math.round(size.width * scale));
        canvas.height = Math.max(1, Math.round(size.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {finish(null);return;}
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(blob => finish(blob && blob.size > 0 ? blob : null), 'image/jpeg', .76);
      } catch { finish(null); }
    }
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        size = {width: video.videoWidth, height: video.videoHeight};
      }
      try {
        const target = Number.isFinite(video.duration) && video.duration > .3
          ? Math.min(1.2, Math.max(.3, video.duration * .12), video.duration * .8) : 0;
        if (target > 0) video.currentTime = target;
        else if (video.readyState >= 2) capture();
      } catch { if (video.readyState >= 2) capture(); }
    };
    video.onseeked = capture;
    video.onloadeddata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= .3 || video.currentTime > .05)
        capture();
    };
    video.onerror = () => finish(null);
    video.src = url;
    video.load();
  });
}


/** Share one stable IndexedDB-backed JPEG poster across videos, albums and video notes. */
async function cachedChatPoster(path:string):Promise<string|null>{
  if(!supabase||!path)return null;
  if(isNativeMediaRuntime()){
    const viewer=mediaCacheOwner(),identity='/storage/v1/object/sign/connect-attachments/'+path+'__poster.jpg';
    if(viewer){const local=await resolveCachedMedia(identity,viewer).catch(()=>identity);if(local.startsWith('blob:'))return local;}
    const {data,error}=await supabase.storage.from('connect-attachments').createSignedUrl(path+'__poster.jpg',3600);
    if(error||!data?.signedUrl)return null;
    const signed=mediaUrl(data.signedUrl);
    if(viewer)void prefetchCachedMedia(signed,viewer);
    return signed;
  }
  const viewer=mediaCacheOwner();
  const hot=getHotChatPoster(viewer,path);
  if(hot)return hot;
  const identity='/storage/v1/object/sign/connect-attachments/'+path+'__poster.jpg';
  if(viewer){
    const local=await resolveCachedMedia(identity,viewer).catch(()=>identity);
    if(local.startsWith('blob:')){rememberChatPoster(viewer,path,local);return local;}
  }
  const {data,error}=await supabase.storage.from('connect-attachments').createSignedUrl(path+'__poster.jpg',3600);
  if(error||!data?.signedUrl)return null;
  const signed=mediaUrl(data.signedUrl);
  if(viewer){
    await prefetchCachedMedia(signed,viewer);
    const local=await resolveCachedMedia(identity,viewer).catch(()=>identity);
    if(local.startsWith('blob:')){rememberChatPoster(viewer,path,local);return local;}
    rememberChatPoster(viewer,path,signed);
  }
  return signed;
}


// CONNECT_PWA_VIDEO_STILLS_FIX4_20261113
/** Save the most recent nonempty decoded frame as a stable attachment poster.
 * PWA only. Cross-origin/tainted video falls back to its uploaded poster.
 */
function preserveVisibleChatFrame(video:HTMLVideoElement,path:string,display:(url:string)=>void,squareCrop=false):boolean{
  if(isNativeMediaRuntime()||!path||!mediaCacheOwner()||video.readyState<2||video.currentTime<.12||!video.videoWidth||!video.videoHeight)return false;
  try{
    const canvas=document.createElement('canvas');
    // Fit the actual pixels, not the intrinsic portrait/landscape frame, to the
    // fixed circular viewport. Other video posters keep their original ratio.
    const width=video.videoWidth,height=video.videoHeight,edge=Math.min(width,height);
    const cropSquare=squareCrop&&edge>0;
    const sourceWidth=cropSquare?edge:width,sourceHeight=cropSquare?edge:height;
    const scale=Math.min(1,420/sourceWidth,420/sourceHeight);
    canvas.width=Math.max(1,Math.round(sourceWidth*scale));
    canvas.height=Math.max(1,Math.round(sourceHeight*scale));
    const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)return false;
    const x=cropSquare?(width-edge)/2:0,y=cropSquare?(height-edge)/2:0;
    ctx.drawImage(video,x,y,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
    // Avoid persisting a decoder's all-black placeholder on iOS.
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let sampled=0,lit=0;
    for(let i=0;i<pixels.length;i+=128){sampled++;if(pixels[i]+pixels[i+1]+pixels[i+2]>65)lit++;}
    if(sampled&&!lit)return false;
    const url=canvas.toDataURL('image/jpeg',.76);if(url.length<180)return false;
    const viewer=mediaCacheOwner();
    rememberChatPoster(viewer,path,url);
    display(url);
    canvas.toBlob(blob=>{if(blob&&viewer===mediaCacheOwner())void storeGeneratedChatPoster(viewer,path,blob).catch(()=>{});},'image/jpeg',.76);
    return true;
  }catch{return false;}
}
export { cachedChatPoster,connectImageFileSize,connectPhotoDimensions,connectPhotoFrameStyle,connectPhotoFrameValues,connectPhotoSizeCache,connectUpdatePhotoSize,connectUpdateVideoFrame,connectVideoFilePreview,connectVideoFrameStyle,connectVideoSizeCache,preserveVisibleChatFrame,refreshMediaUrl,syncVideoThumbnailSize };
export type { ConnectPhotoSize,ConnectVideoPreview };
