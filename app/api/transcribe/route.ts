import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const recent = new Map<string,number[]>(); // Best-effort in-process rate limit, not a distributed quota.
const noStore = {'Cache-Control':'no-store'};
const answer = (error:string,status:number) => NextResponse.json({error},{status,headers:noStore});

export async function POST(req:NextRequest){
  const key = process.env.OPENAI_API_KEY;
  if(!key)return answer('Расшифровка пока не настроена администратором Connect.',503);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !pub || !secret)return answer('Служба распознавания недоступна.',503);
  const bearer = req.headers.get('authorization')||'';
  if(!bearer.startsWith('Bearer '))return answer('Нужна авторизация.',401);
  const authToken=bearer.slice(7);
  if(authToken.length<20 || authToken.length>8192)return answer('Неверная авторизация.',401);
  const body=await req.json().catch(()=>null);
  if(!body || typeof body.messageId!=='string' || !UUID.test(body.messageId))return answer('Неверный идентификатор сообщения.',400);
  const auth=createClient(url,pub,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await auth.auth.getUser(authToken);
  if(authError || !user)return answer('Сессия недействительна.',401);
  const now=Date.now();
  const history=(recent.get(user.id)||[]).filter(t=>now-t<60_000);
  if(history.length>=6)return answer('Слишком много запросов. Повтори через минуту.',429);
  history.push(now);recent.set(user.id,history);
  if(recent.size>2000)recent.clear();

  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:message,error:messageError}=await db.from('messages')
    .select('id,conversation_id,attachment_kind,attachment_path,attachment_name,attachment_size,deleted_at')
    .eq('id',body.messageId).maybeSingle();
  if(messageError || !message || message.deleted_at || !message.attachment_path || !['audio','video'].includes(message.attachment_kind))
    return answer('Запись не найдена.',404);
  const {data:conversation}=await db.from('conversations').select('user_a,user_b').eq('id',message.conversation_id).maybeSingle();
  if(!conversation || ![conversation.user_a,conversation.user_b].includes(user.id))return answer('Запись недоступна.',403);
  // No arbitrary URLs or file paths supplied by the client: the object path is
  // selected exclusively from the authorized message record.
  if(typeof message.attachment_size==='number' && message.attachment_size>24*1024*1024)
    return answer('Запись слишком большая (максимум 24 МБ).',413);
  const {data:blob,error:downloadError}=await db.storage.from('connect-attachments').download(message.attachment_path);
  if(downloadError || !blob)return answer('Не удалось получить запись.',404);
  if(blob.size>24*1024*1024)return answer('Запись слишком большая (максимум 24 МБ).',413);
  const filename=String(message.attachment_name||message.attachment_path.split('/').pop()||'speech.webm');
  const ext=filename.split('.').pop()?.toLowerCase()||'';
  if(!['mp3','mp4','mpeg','mpga','m4a','wav','webm'].includes(ext))return answer('Неподдерживаемый формат записи.',415);
  const mime:Record<string,string>={mp3:'audio/mpeg',mp4:'video/mp4',mpeg:'audio/mpeg',mpga:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',webm:message.attachment_kind==='video'?'video/webm':'audio/webm'};
  const form=new FormData();
  form.set('file',new File([blob],`connect-recording.${ext}`,{type:mime[ext]}));
  form.set('model','gpt-transcribe');
  try{
    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(55_000),cache:'no-store',
    });
    if(!response.ok)return answer(response.status===413?'Запись превышает лимит распознавания.':'Не удалось распознать речь в файле.',response.status===413?413:502);
    const parsed=await response.json() as {text?:unknown};
    if(typeof parsed.text!=='string')return answer('Служба распознавания вернула неверный ответ.',502);
    return NextResponse.json({text:parsed.text.slice(0,30000)},{headers:noStore});
  }catch{return answer('Время распознавания истекло или служба недоступна.',504);}
}
