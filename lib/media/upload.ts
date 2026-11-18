import * as tus from 'tus-js-client';
import { sessionScope } from '../session-scope';
/** Every transfer owns its cancellation; logout invalidates it synchronously. */
export function uploadOperation(){const controller=new AbortController();const unregister=sessionScope.onReset(()=>controller.abort());return {signal:controller.signal,close:()=>unregister()};}
export async function uploadObject(file:Blob,path:string,options:{endpoint:string;token:string;key:string;signal:AbortSignal;onProgress?:(fraction:number)=>void}){
 const {endpoint,token,key,signal,onProgress}=options;signal.throwIfAborted();
 if(file.size<=6*1024*1024){
  const response=await fetch(endpoint+'/object/connect-attachments/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{authorization:'Bearer '+token,apikey:key,'content-type':file.type||'application/octet-stream','x-upsert':'false'},body:file,signal});
  if(!response.ok)throw Error('Загрузка: HTTP '+response.status);onProgress?.(1);return;
 }
 await new Promise<void>((resolve,reject)=>{
  let settled=false;
  const done=(error?:unknown)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(error)reject(error);else resolve();};
  const upload=new tus.Upload(file,{endpoint:endpoint+'/upload/resumable',retryDelays:[0,3000,5000,10000,20000],headers:{authorization:'Bearer '+token,apikey:key,'x-upsert':'false'},uploadDataDuringCreation:true,removeFingerprintOnSuccess:true,metadata:{bucketName:'connect-attachments',objectName:path,contentType:file.type||'application/octet-stream'},chunkSize:6*1024*1024,onError:done,onSuccess:()=>done(),onProgress:(done,total)=>onProgress?.(done/total)});
  const abort=()=>{void upload.abort().catch(()=>{});done(new DOMException('Upload cancelled','AbortError'));};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();else upload.start();
 });
}
