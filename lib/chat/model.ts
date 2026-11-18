import { stickerFromBody } from '../stickers';


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

// CONNECT_PWA_WEBP_HISTORY_THUMBS_AUDIO_HOLD_V1
// CONNECT_PWA_INSTANT_CACHE_V3_20261111

type Tab = 'chats' | 'contacts' | 'settings';

type SettingsPage = 'home' | 'appearance' | 'notifications' | 'stickers' | 'members' | 'usage' | 'data' | 'privacy' | 'about';

type VisualScene = 'waves' | 'aurora' | 'moon' | 'sunset' | 'lagoon' | 'nebula' | 'minimal';

const VISUAL_SCENES: ReadonlyArray<{ id: VisualScene; title: string; description: string }> = [
  { id: 'waves', title: 'Волны', description: 'Текущая тема' },
  { id: 'aurora', title: 'Сияние', description: 'Мягкие переливы' },
  { id: 'moon', title: 'Лунный свет', description: 'Холодные линии' },
  { id: 'sunset', title: 'Закат', description: 'Тёплые волны' },
  { id: 'lagoon', title: 'Лагуна', description: 'Бирюзовые потоки' },
  { id: 'nebula', title: 'Туманность', description: 'Фиолетовый свет' },
  { id: 'minimal', title: 'Минимализм', description: 'Без волн и свечения' },
];

type CustomPack = {id:string;name:string;emoji:string;owner_id:string;is_public:boolean;created_at:string};

type CustomSticker = {id:string;pack_id:string;name:string;storage_path:string;position:number};

const IOS_FAVORITE_PACK = 'Избранное из чатов · Connect';

type Profile = { id: string; display_name: string; is_blocked: boolean; bio: string; avatar_path: string | null; last_seen_at: string | null; online_until: string | null };

type Conversation = { id: string; user_a: string; user_b: string; created_at: string };

type Message = {
  id: string; conversation_id: string; sender_id: string; body: string; created_at: string;
  edited_at: string | null; deleted_at: string | null; reply_to: string | null;
  attachment_path: string | null; attachment_name: string | null; attachment_type: string | null;
  attachment_size: number | null; attachment_kind: 'image' | 'video' | 'audio' | 'file' | null;
};

function isPlayableAudioFile(m: Message): boolean {
  if (m.attachment_kind !== 'file') return false;
  return (m.attachment_type || '').toLowerCase().startsWith('audio/') ||
    /\.(?:mp3|m4a|aac|wav|ogg|oga|opus|flac|aif|aiff)$/i.test(m.attachment_name || '');
}


type ChatReadingEntry = { chatId: string; readAt: string; firstUnreadId: string | null; anchorId: string | null };

type Gesture = { id: string; x: number; y: number; dx: number; dy: number; timer: number | null; opened: boolean };

type IconName = 'chats' | 'contacts' | 'settings' | 'smile' | 'back' | 'search' | 'write' | 'send' | 'reply' |
  'edit' | 'copy' | 'trash' | 'close' | 'check' | 'moon' | 'sun' | 'logout' | 'shield' | 'info' | 'chevron' | 'arrow' | 'message' | 'camera' | 'user' | 'plus' | 'mic' | 'stop' | 'file' | 'play' | 'dots' | 'forward';


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
  return (m.sender_id === selfId ? 'Вы: ' : '') + (m.deleted_at ? 'Нет сообщений' : (isVideoNote(m) ? 'Видеокружок' : parseAlbum(m.body).length ? `Альбом (${parseAlbum(m.body).length})` : (stickerFromBody(forwardedMessage(m.body).text) || (m.attachment_kind==='image' && /^sticker-\d+\.(png|webp|gif|jpe?g)$/i.test(m.attachment_name || ''))) ? 'Стикер' : forwardedMessage(m.body).text || ({image:'Фото',video:'Видео',audio:'Голосовое сообщение',file:'Файл'}[m.attachment_kind || 'file'])).replace(/\s+/g, ' '));
}


// Video notes use the existing video attachments schema, but have a distinct presentation.
function isVideoNote(m: Message): boolean {
  return m.attachment_kind === 'video' && /^connect-video-note-\d+\.(?:mp4|webm)$/i.test(m.attachment_name || '');
}
export { ALBUM_PREFIX,dayKey,dayLabel,formatPresence,FORWARD_PREFIX,forwardBody,forwardedMessage,IOS_FAVORITE_PACK,isPlayableAudioFile,isVideoNote,listTimeLabel,MESSAGE_COLUMNS,messagePreview,parseAlbum,timeLabel,VISUAL_SCENES };
export type { AlbumItem,ChatReadingEntry,Conversation,CustomPack,CustomSticker,Gesture,IconName,Message,Profile,SettingsPage,Tab,VisualScene };
