'use client';
import { AvatarCropper,PendingAttachment,type CropState } from '../components/chat/AvatarEditor';
import { Avatar,Icon,MessageChecks,PresenceAvatar } from '../components/chat/Primitives';
import { ConnectInlineAutoplayVideo,VideoNoteBubble,VideoThumbnail } from '../components/chat/VideoMessages';
import { VideoNoteRecorder } from '../components/chat/VideoNoteRecorder';
import { VoicePlayer } from '../components/chat/VoicePlayer';
import { ConnectCallButton } from '../components/ConnectAudioCalls';
import ConnectCallBridge from '../components/ConnectCallBridge';
import { waveStyles } from '../components/ConnectDynamicTheme';
import { useConnectSession } from '../components/ConnectSessionProvider';
import ConnectUiCoordinator from '../components/ConnectUiCoordinator';
import { useUiSlot } from '../components/ConnectUiSlots';
import { cachedChatPoster,connectPhotoFrameStyle,connectUpdatePhotoSize,connectVideoFrameStyle,refreshMediaUrl } from '../lib/chat/media-preview';
import { ALBUM_PREFIX,dayKey,dayLabel,formatPresence,forwardBody,forwardedMessage,IOS_FAVORITE_PACK,isPlayableAudioFile,isVideoNote,listTimeLabel,MESSAGE_COLUMNS,messagePreview,parseAlbum,timeLabel,VISUAL_SCENES,type AlbumItem,type ChatReadingEntry,type Conversation,type CustomPack,type CustomSticker,type Gesture,type IconName,type Message,type Profile,type SettingsPage,type Tab,type VisualScene } from '../lib/chat/model';
import { useChatComposer } from '../lib/chat/use-composer';
import { useInbox } from '../lib/chat/use-inbox';
import { usePushNavigation } from '../lib/chat/use-push-navigation';
import type { Database } from '../lib/database';
import { retireCurrentPush,setPushSession } from '../lib/push/session';
import { createReconciler } from '../lib/realtime/reconciler';
import { sessionScope } from '../lib/session-scope';
// CONNECT_PWA_UNIFIED_CHAT_MEDIA_V1_20261112
// CONNECT_PWA_CHAT_ACTIVITY_STATUS_V1_20261115
// CONNECT_PWA_COMPACT_AUDIO_NO_TRANSCRIPTION_20261112
// CONNECT_PWA_VOICE_VIDEO_GEOMETRY_FIX4_20261112
// CONNECT_PWA_MEDIA_UX_FIX_V3_20261112

import ConnectAdminUsage from '../components/ConnectAdminUsage';
import CacheSettings from '../components/ConnectCacheSettings';
import ConnectGalleryViewer from '../components/ConnectGalleryViewer';
import ConnectHiddenMembers from '../components/ConnectHiddenMembers';
import { ConnectMusicStatus } from '../components/ConnectMusicSystem';
import ConnectNotificationSettings from '../components/ConnectNotificationSettings';
import ConnectProfileMedia,{ type ProfileMediaKind } from '../components/ConnectProfileMedia';
import ConnectPushGuardian from '../components/ConnectPushGuardian'; // CONNECT_PWA_PUSH_GUARDIAN_20261114
import RecordingBar from '../components/ConnectRecordingBar';
import ConnectSplashScreen from '../components/ConnectSplashScreen';
import { activityTtl,composerActivity,visiblePeerActivity } from '../lib/chat-activity'; // CONNECT_PWA_CHAT_ACTIVITY_STATUS_V1_20261115
import { dropCachedMessage,dropCachedMessageById,prewarmChatHistory,readChatHistory,readNewerChatHistory,readOlderChatHistory,wipeChatHistory,wipeUserHistory,writeChatHistory } from '../lib/chat-history-cache';
import { forgetUserChatPresentation,isNativeMediaRuntime } from '../lib/chat-media-presentation';
import { chatTimeKey,compareChatMessages } from '../lib/chat-order';
import { photoPreviewPath,supportsPhotoPreview } from '../lib/chat-thumbnails';
import { clearCachedMedia,installMediaCache,linkMessageMedia,prefetchCachedMedia,prefetchChatAudio,prefetchStickerWebp,purgeDeletedMedia,resolveCachedMedia } from '../lib/media-cache';
import { warmOwnProfileLibraries,warmPeerProfileLibraries } from '../lib/profile-media-index';
import { settingsMenuSegmentClasses } from '../lib/settings-menu-groups';
import { prepareStickerFile } from '../lib/sticker-webp'; // CONNECT_PWA_STICKER_WEBP_EDITOR_20261115
import { convertStickerWebpOnServer } from '../lib/sticker-webp-transport'; // CONNECT_PWA_STICKER_BINARY_TRANSPORT_FIX4_20261115
import { STICKER_PACKS,stickerBody,stickerFromBody,stickerUrl,type StickerPackId } from '../lib/stickers';
import { clearWallpaper,loadWallpaper,saveWallpaper } from '../lib/wallpaper';

import type { CSSProperties,FormEvent,KeyboardEvent as ReactKeyboardEvent,TouchEvent } from 'react';
import { useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { deliverAttachments } from '../lib/chat/attachments';
import { deliverMessage,retryMessageOutbox } from '../lib/chat/delivery';
import { browserSupabase,mediaUrl,supabaseFetch,supabaseKey,supabaseUrl } from '../lib/supabase-browser';

const supabase = browserSupabase();

const CONNECT_LOCAL_LOGOUT_FLAG='connect-local-logout-v1';
function locallyLoggedOut():boolean {try{return localStorage.getItem(CONNECT_LOCAL_LOGOUT_FLAG)==='1';}catch{return false;}}
function clearStoredConnectAuth():void {
  try {
    if(!supabaseUrl)return;
    const host=new URL(supabaseUrl).hostname;
    if(!host.endsWith('.supabase.co'))return;
    const ref=host.slice(0,-'.supabase.co'.length);
    if(!/^[a-z0-9-]{4,64}$/.test(ref))return;
    localStorage.removeItem(`sb-${ref}-auth-token`);
  }catch{/* Storage restrictions must never prevent the screen from locking. */}
}

// CONNECT_PWA_NAV_MENUS_CALL_V1_20261114: edge gestures navigate screen history,
// never message swipes or the iOS native system back gesture.
type ConnectGestureView = { tab: Tab; chat: string | null; profile: string | null; media: ProfileMediaKind | null; settings: SettingsPage };
function connectSwipeDirection(edge: 'back' | 'forward', dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < 76 || Math.abs(dy) > Math.abs(dx) * 0.52) return 0;
  if (edge === 'back' && dx > 0) return -1;
  if (edge === 'forward' && dx < 0) return 1;
  return 0;
}

// CONNECT_PWA_DOCK_MOTION_NESTED_GESTURES_V1_20261114: no swipes between root tabs.
function connectAllowHistorySwipe(current: ConnectGestureView | undefined, target: ConnectGestureView, direction: -1 | 1): boolean {
  if (!current) return false;
  // Back and forward belong to nested screens, not primary tab switching.
  const inSubmenu = Boolean(current.profile || current.media || current.settings !== 'home');
  if (inSubmenu) {
    if (current.tab !== target.tab) return false;
    return direction === -1 || Boolean(target.profile || target.media || target.settings !== 'home');
  }
  // A conversation is the only full-screen root child with a back edge gesture.
  if (current.chat) return direction === -1 && !target.chat;
  return false;
}

export default function Home() {
  const mainSlot=useUiSlot('main'),navSlot=useUiSlot('nav'),settingsSlot=useUiSlot('settings');
  const closeChatMenu=useCallback(()=>setChatActions(false),[]),closeListMenu=useCallback(()=>setListActions(null),[]);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [visualScene, setVisualScene] = useState<VisualScene>('waves');
  useEffect(()=>{void window.ConnectNative?.request('appearance',{scene:visualScene}).catch(()=>{});},[visualScene]);
  const [tab, setTab] = useState<Tab>('chats');
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('home');
  const [accent, setAccent] = useState('#087dff');
  const [wallpaper, setWallpaper] = useState<string | null>(null);
  const wallpaperInput = useRef<HTMLInputElement | null>(null);
  const [stickerPicker, setStickerPicker] = useState(false);
  const [filePickerOpen,setFilePickerOpen] = useState(false);
  const [videoNoteRecording,setVideoNoteRecording] = useState(false);
  const [stickerPack, setStickerPack] = useState<StickerPackId>('speed');
  const [enabledPacks, setEnabledPacks] = useState<StickerPackId[]>(STICKER_PACKS.map(p=>p.id));
  const [stickerFavorites, setStickerFavorites] = useState<string[]>([]);
  const [stickerRecent, setStickerRecent] = useState<string[]>([]);
  const [customPacks,setCustomPacks] = useState<CustomPack[]>([]);
  const [customStickers,setCustomStickers] = useState<CustomSticker[]>([]);
  const [customStickerUrls,setCustomStickerUrls] = useState<Record<string,string>>({});
  const [customPack,setCustomPack] = useState<string>('');
  const [editingStickerPack,setEditingStickerPack] = useState<string|null>(null);
  const [selectedStickerIds,setSelectedStickerIds] = useState<string[]>([]);
  const migratedStickerAttempts=useRef<Set<string>>(new Set());
  const [packName,setPackName] = useState('');
  const [packEmoji,setPackEmoji] = useState('🎨');
  const [packPublic,setPackPublic] = useState(false);
  // Sticker input lives inside each pack's label; native iOS picker retains the tap gesture.

  const {user,setUser,admin,setAdmin,setConversation}=useConnectSession();
  // CONNECT_PWA_AUTH_FAIL_CLOSED_20261117: stored session alone is never authorization.
  const [authGate, setAuthGate] = useState<'checking'|'verified'|'denied'|'offline'>('checking');
  // CONNECT_PWA_SEAMLESS_SESSION_20261118: only a server-verified in-memory session can remain visible.
  const verifiedSessionRef = useRef(false);
  const verifiedIdentityRef=useRef<string|null>(null);
  const [connectionStatus,setConnectionStatus] = useState<'online'|'offline'|'reconnecting'>('online');
  const authSequence = useRef(0);
  const passwordRecoveryPending = useRef(false);
  const loginInProgress = useRef(false);
  const [loading, setLoading] = useState(true);
  const [splashVisible, setSplashVisible] = useState(()=>typeof window==='undefined'||!window.__connectNativeCall||window.__connectNativeCall.phase==='idle');
  const [directoryReady, setDirectoryReady] = useState(false);
  const finishSplash = useCallback(() => setSplashVisible(false), []);
  useEffect(()=>{const incoming=(event:Event)=>{if((event as CustomEvent).detail?.phase!=='idle')setSplashVisible(false);};window.addEventListener('connect:native-call',incoming);return()=>window.removeEventListener('connect:native-call',incoming);},[]);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState(''); const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [avatarUrls, setAvatarUrls] = useState<Record<string,string>>({});
  const [profileView, setProfileView] = useState<string | null>(null);
  const [profileMediaOpen, setProfileMediaOpen] = useState<ProfileMediaKind | null>(null); /* Connect profile media visible to members v2 */
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const avatarInput = useRef<HTMLInputElement | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const gestureHistory = useRef<{ owner: string; entries: ConnectGestureView[]; cursor: number; restoring: boolean }>({owner:'',entries:[],cursor:-1,restoring:false});
  const [clearedChats, setClearedChats] = useState<Record<string,string>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistoryLoading,setChatHistoryLoading]=useState(false);
  const [historyReadyChat,setHistoryReadyChat]=useState<string|null>(null);
  const [chatDisplayReady,setChatDisplayReady]=useState<string|null>(null);
  useEffect(()=>{
    if(!activeChat||isNativeMediaRuntime())return;
    const timer=window.setTimeout(()=>setChatDisplayReady(activeChat),1400);
    return()=>window.clearTimeout(timer);
  },[activeChat,user?.id]);
  const signedMediaLifetimes=useRef(new Map<string,number>());
  const warmedChatWindows=useRef(new Map<string,number>());
  const [historyHasMore,setHistoryHasMore]=useState(false);
  const [historyLoadingMore,setHistoryLoadingMore]=useState(false);
  const [historyHasNewer,setHistoryHasNewer]=useState(false);
  const historyNewer=useRef(false),historyGeneration=useRef(0),historyPaging=useRef(false),historyAppend=useRef(false),historyTouched=useRef(false);
  const historyOldest=useRef<Message|null>(null),historyNewest=useRef<Message|null>(null);
  function setNewerHistory(value:boolean){historyNewer.current=value;setHistoryHasNewer(value);}
  const olderHistoryAnchor=useRef<{id:string;top:number}|null>(null);
  const [photoPreviews,setPhotoPreviews]=useState<Record<string,string|null>>({});
  const photoPreviewRequests=useRef(new Set<string>());
  const photoPreviewAttempts=useRef(new Map<string,number>());
  const photoPreviewRetryTimers=useRef(new Map<string,number>());
  const [photoPreviewRetry,setPhotoPreviewRetry]=useState(0);
  function retryPhotoPreview(path:string){
    photoPreviewRequests.current.delete(path);
    if((photoPreviewAttempts.current.get(path)||0)>=3||photoPreviewRetryTimers.current.has(path))return;
    const timer=window.setTimeout(()=>{
      photoPreviewRetryTimers.current.delete(path);
      setPhotoPreviewRetry(value=>value+1);
    },10000);
    photoPreviewRetryTimers.current.set(path,timer);
  }
  const activePreviewUser=useRef('');
  activePreviewUser.current=user?.id||'';
  const messagesById=useMemo(()=>new Map(messages.map(m=>[m.id,m])),[messages]);
  const [latest, setLatest] = useState<Record<string, Message>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const recentMessagesRef=useRef<Message[]>([]);
  const historyWarmStamps=useRef<Record<string,string>>({});
  const avatarCacheEpoch=useRef(0);
  const inboxMediaWarm=useRef<Map<string,number>>(new Map());
  useEffect(()=>{historyWarmStamps.current={};inboxMediaWarm.current.clear();avatarCacheEpoch.current++;},[user?.id]);
  const [typing, setTyping] = useState(false);
  const [peerRecording, setPeerRecording] = useState(false);
  const serverDeleted=useRef(new Set<string>());
  useEffect(()=>{serverDeleted.current.clear();},[user?.id]);
  const [peerActivity,setPeerActivity]=useState<{chat:string;kind:string;until:number}|null>(null);
  const activitySupported=useRef(false),activityLast=useRef({chat:'',kind:'',at:0});
  const activityWriteQueue=useRef<Promise<void>>(Promise.resolve());
  useEffect(()=>{let live=true;activitySupported.current=false;if(supabase&&user)void supabase.rpc('connect_unified_capabilities').then(({data})=>{if(live)activitySupported.current=!!data&&typeof data==='object'&&!Array.isArray(data)&&data.activity===1;});return()=>{live=false;};},[user?.id]);
  useEffect(()=>{if(!peerActivity)return;const timer=setTimeout(()=>setPeerActivity(null),Math.max(0,peerActivity.until-Date.now()));return()=>clearTimeout(timer);},[peerActivity]);
  const [peerStates, setPeerStates] = useState<Record<string,{delivered:string|null;read:string|null}>>({});
  const [presence, setPresence] = useState<Record<string,{last_seen_at:string|null;online_until:string|null}>>({});
  const [clock, setClock] = useState(Date.now());
  const {draft,setDraft,pendingFiles,setPendingFiles}=useChatComposer(user?.id||null,activeChat);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string,string>>({});
  function imageInChat(path:string):string|undefined {
    const preview=photoPreviews[path];
    if(!supportsPhotoPreview(path))return attachmentUrls[path];
    if(preview===undefined)return undefined; // Do not download a 10MB original while locating its thumb.
    return preview||attachmentUrls[path];
  }
  const failedPhotoPreview=(path:string)=>{
    setPhotoPreviews(prev=>({...prev,[path]:null}));
    retryPhotoPreview(path);
  };

  const [mediaViewer, setMediaViewer] = useState<{url:string;path:string;name:string;kind:'image'|'video'} | null>(null);
  const mediaTouchStart = useRef<{x:number;y:number}|null>(null);
  const [savingMedia, setSavingMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [videoNoteOpen,setVideoNoteOpen]=useState(false);
  const [recording, setRecording] = useState(false);
  useEffect(()=>{if(!user?.id)return;return installMediaCache(user.id, refreshMediaUrl);},[user?.id]);
  // CONNECT_PROFILE_MEDIA_INSTANT_CACHE_V3_20261111
  // Prefetch only library metadata after login, without bulk downloading media.
  useEffect(()=>{
    if(!supabase||!user?.id)return;
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      if(!cancelled&&document.visibilityState==='visible')void warmOwnProfileLibraries(supabase,user.id);
    },1800);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[user?.id]);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const attachmentInput = useRef<HTMLInputElement | null>(null);
  const filePickerOpenedAt=useRef(0);
  useEffect(()=>{
    const input=attachmentInput.current;
    if(!input)return;
    const cancelFileSelection=()=>setFilePickerOpen(false);
    input.addEventListener('cancel',cancelFileSelection);
    return()=>input.removeEventListener('cancel',cancelFileSelection);
  },[activeChat]);
  useEffect(()=>{
    if(!filePickerOpen)return;
    // Some iOS file pickers do not fire cancel. Regaining focus ends the indicator.
    const onFocus=()=>{if(Date.now()-filePickerOpenedAt.current>800)window.setTimeout(()=>setFilePickerOpen(false),150);};
    window.addEventListener('focus',onFocus);
    return()=>window.removeEventListener('focus',onFocus);
  },[filePickerOpen]);
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
  const androidBackHandler=useRef<()=>void>(()=>{});
  androidBackHandler.current=()=>{
    if(mediaViewer){setMediaViewer(null);return;}
    if(crop){closeCrop();return;}
    if(videoNoteOpen){setVideoNoteOpen(false);return;}
    if(stickerPicker){setStickerPicker(false);return;}
    if(menuMessage){setMenuMessage(null);return;}
    if(chatActions){setChatActions(false);return;}
    if(forwardIds.length){setForwardIds([]);return;}
    if(selectionMode){setSelectionMode(false);setSelectedIds([]);return;}
    if(chatSearchOpen){setChatSearchOpen(false);setChatQuery('');return;}
    if(recording){finishRecording(false);return;}
    if(profileMediaOpen){setProfileMediaOpen(null);return;}
    if(profileView){setProfileView(null);return;}
    if(activeChat){exitChat();return;}
    if(settingsPage!=='home'){setSettingsPage('home');return;}
    if(tab!=='chats'){switchTab('chats');return;}
    void window.ConnectNative?.request('navigation:exit').catch(()=>{});
  };
  useEffect(()=>{
    const back=()=>androidBackHandler.current();
    window.addEventListener('connect:android-back',back);
    return()=>window.removeEventListener('connect:android-back',back);
  },[]);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  type ViewportAnchor = {chatId:string;items:{id:string;top:number}[];bottom:boolean};
  const viewportAnchor = useRef<ViewportAnchor | null>(null);
  const savedChatAnchors = useRef<Record<string,ViewportAnchor>>({});
  const anchorPersistedAt=useRef(0);
  const visibilityFilter = useRef({hiddenMessages,clearedChats});
  visibilityFilter.current = {hiddenMessages,clearedChats};
  function captureChatAnchor() {
    const root = scrollRef.current;
    const chatId = activeChatRef.current;
    if (!root || !chatId || chatPositionedRef.current !== chatId) return;
    const bounds = root.getBoundingClientRect();
    const items:{id:string;top:number}[]=[];
    const nodes=root.querySelectorAll<HTMLElement>('.message-day-group[id]');
    // Ordered rows allow logarithmic viewport lookup. Avoid reading hundreds
    // of layout boxes on every scroll frame in a long conversation.
    const findBoundary=(y:number,bottom:boolean)=>{
      let low=0,high=nodes.length;
      while(low<high){const mid=(low+high)>>>1,rect=nodes[mid].getBoundingClientRect();
        if(bottom?rect.bottom<=y:rect.top<y)low=mid+1;else high=mid;}
      return low;
    };
    const first=findBoundary(bounds.top,true),last=findBoundary(bounds.bottom,false)-1;
    for(let i=first;i<Math.min(first+4,nodes.length);i++){
      items.push({id:nodes[i].id,top:nodes[i].getBoundingClientRect().top-bounds.top});
    }
    const value={chatId,items,bottom:root.scrollHeight-root.clientHeight-root.scrollTop < 24};
    viewportAnchor.current=value; savedChatAnchors.current[chatId]=value;
    if (user?.id && Date.now()-anchorPersistedAt.current>1000) try {
      anchorPersistedAt.current=Date.now();
      sessionStorage.setItem('connect-reading-anchor:'+user.id+':'+chatId,JSON.stringify(value));
    } catch {}
    return {nodes,bounds,first,last};
  }
  function restoreChatAnchor() {
    const root=scrollRef.current, anchor=viewportAnchor.current;
    if (!root || !anchor || anchor.chatId!==activeChatRef.current || chatPositionedRef.current!==anchor.chatId) return;
    if (anchor.bottom) root.scrollTop=root.scrollHeight;
    else for (const saved of anchor.items) {
      const node=document.getElementById(saved.id);
      if (!node || !root.contains(node)) continue;
      root.scrollTop += node.getBoundingClientRect().top-root.getBoundingClientRect().top-saved.top;
      break;
    }
  }
  const [chatReadingEntry, setChatReadingEntry] = useState<ChatReadingEntry | null>(null);
  const [showChatJump, setShowChatJump] = useState(false);
  const chatPositionedRef = useRef<string | null>(null);
  const scrollCheckFrame = useRef<number | null>(null);
  const readReceiptTimer=useRef<number|null>(null);
  const pendingReadReceipt=useRef<{id:string;iso:string}|null>(null);
  const readSyncPending=useRef<Record<string,string>>({});
  const readSyncBusy=useRef<Record<string,boolean>>({});
  function flushVisibleRead(){
    if(readReceiptTimer.current!==null)clearTimeout(readReceiptTimer.current);
    readReceiptTimer.current=null;
    const pending=pendingReadReceipt.current;pendingReadReceipt.current=null;
    if(pending)void markRead(pending.id,pending.iso);
  }
  function queueVisibleRead(id:string,iso:string){
    const pending=pendingReadReceipt.current;
    if(!pending||pending.id!==id||pending.iso<iso)pendingReadReceipt.current={id,iso};
    if(readReceiptTimer.current===null)readReceiptTimer.current=window.setTimeout(flushVisibleRead,200);
  }
  useEffect(()=>()=>{
    if(readReceiptTimer.current!==null)clearTimeout(readReceiptTimer.current);
    readReceiptTimer.current=null;pendingReadReceipt.current=null;
  },[activeChat,user?.id]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressMessageClick=useRef(0);
  const activeChatRef = useRef<string | null>(null);
  const readCache = useRef<Record<string, string>>({});
  const deliveredCache = useRef<Record<string, string>>({});
  useEffect(()=>{
    if(!user?.id)return;
    return sessionScope.onReset(()=>{
      readCache.current={};deliveredCache.current={};readSyncBusy.current={};readSyncPending.current={};
      pendingReadReceipt.current=null;if(readReceiptTimer.current!==null)clearTimeout(readReceiptTimer.current);readReceiptTimer.current=null;
      savedChatAnchors.current={};viewportAnchor.current=null;
    });
  },[user?.id]);
  const lastKeypress = useRef(0); const lastTypingSent = useRef(0);
  const previousLast = useRef(''); const stickToBottom = useRef(true);
  const invited = typeof window !== 'undefined' && /type=(invite|recovery)/.test(window.location.hash + window.location.search);

  useEffect(() => {
    try {
      if (localStorage.getItem('connect-theme') === 'light') setTheme('light');
      const storedScene = localStorage.getItem('connect-visual-scene');
      if (VISUAL_SCENES.some(item => item.id === storedScene)) setVisualScene(storedScene as VisualScene);
    } catch { /* Private browsing */ }
  }, []);
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
    for (const key of ['connect-theme','connect-visual-scene','connect-accent','connect-sticker-packs','connect-sticker-favorites','connect-sticker-recent']) try{localStorage.removeItem(key);}catch{}
    setTheme('dark');setVisualScene('waves');setAccent('#087dff');setEnabledPacks(STICKER_PACKS.map(p=>p.id));setStickerFavorites([]);setStickerRecent([]);
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
  function changeVisualScene(next: VisualScene) {
    setVisualScene(next);
    try { localStorage.setItem('connect-visual-scene', next); } catch { /* Private browsing */ }
  }

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

  useEffect(() => { setDirectoryReady(false); }, [user?.id]);

  const denyPrivateAccess = useCallback(() => {
    verifiedSessionRef.current = false;
    setConnectionStatus('online');
    setUser(null);setSetup(false);setAuthGate('denied');setLoading(false);
    verifiedIdentityRef.current=null;
    setActiveChat(null);setProfileView(null);setMessages([]);
    setConversations([]);setProfiles([]);setAvatarUrls({});
    setLatest({});setUnread({});setAdmin(false);setSettingsPage('home');
    setMediaViewer(null);setMenuMessage(null);setForwardIds([]);
    setVideoNoteOpen(false);setCrop(null);setProfileMediaOpen(null);
  },[]);

  // The only path to the authenticated UI is a live, server-verified Supabase session.
  const verifyAuth = useCallback(async () => {
    if (!supabase) { setUser(null); setAuthGate('denied'); setLoading(false); return; }
    const sequence = ++authSequence.current;
    if(locallyLoggedOut()){
      if(loginInProgress.current)return;
      clearStoredConnectAuth();
      denyPrivateAccess();
      return;
    }
    // Recheck a running chat silently; never use startup loading for periodic auth.
    if (!verifiedSessionRef.current) { setAuthGate('checking'); setLoading(true); }
    // The network state is only a hint; a fresh boot still requires server verification.
    if (navigator.onLine === false) {
      if (verifiedSessionRef.current) setConnectionStatus('offline');
      else { setUser(null); setAuthGate('offline'); setLoading(false); }
      return;
    }
    let timer:ReturnType<typeof setTimeout> | undefined;
    let serverUnavailable = false;
    let controller:AbortController | undefined;
    try {
      const {data,error} = await Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_,reject) => { timer=setTimeout(()=>reject(new Error('SESSION_CHECK_TIMEOUT')),12000); }),
      ]);
      if (sequence !== authSequence.current) return;
      if (error && !data.session) {
        const code = error.name || '';
        if (code !== 'AuthSessionMissingError' && code !== 'AuthApiError') throw error;
      }
      const session = data.session;
      if(verifiedIdentityRef.current&&session?.user.id!==verifiedIdentityRef.current){denyPrivateAccess();setAuthGate('checking');setLoading(true);}
      if (!session?.access_token) {
        clearStoredConnectAuth();
        denyPrivateAccess();
        void Promise.resolve().then(()=>window.__connectPrepareSession?.(null)).catch(()=>{});
        return;
      }
      controller = new AbortController();
      if(timer)clearTimeout(timer);
      timer=setTimeout(()=>controller?.abort(),12000);
      const response = await fetch('/api/auth/verify', {
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{Authorization:`Bearer ${session.access_token}`},signal:controller.signal,
      }).catch((error:unknown)=>{serverUnavailable=true;throw error;});
      if (sequence !== authSequence.current) return;
      if (response.status === 401 || response.status === 403) {
        clearStoredConnectAuth();
        denyPrivateAccess();
        void Promise.resolve().then(()=>window.__connectPrepareSession?.(null)).catch(()=>{});
        return;
      }
      if (!response.ok) {
        serverUnavailable = response.status===429 || response.status>=500;
        throw new Error('SESSION_SERVER_UNAVAILABLE');
      }
      const result = await response.json();
      if (!result?.ok || result.userId !== session.user.id) {
        clearStoredConnectAuth(); denyPrivateAccess();
        void Promise.resolve().then(()=>window.__connectPrepareSession?.(null)).catch(()=>{});
        return;
      }
      if (sequence !== authSequence.current) return;
      await window.__connectPrepareSession?.(session);
      if (sequence !== authSequence.current) return;
      verifiedIdentityRef.current=session.user.id;
      verifiedSessionRef.current = true;
      setConnectionStatus('online');
      setUser(session.user);setAdmin(result.isAdmin===true); setAuthGate('verified'); setLoading(false);
      if (invited || passwordRecoveryPending.current) setSetup(true);
      passwordRecoveryPending.current=false;
    } catch (error) {
      if (sequence === authSequence.current) {
        // Only genuine transport/timeout failures may keep a previously verified UI mounted.
        const transient = serverUnavailable || (error instanceof Error && (
          error.message==='SESSION_CHECK_TIMEOUT' || error.name==='AbortError' ||
          error.name==='AuthRetryableFetchError'
        ));
        if (verifiedSessionRef.current && transient) {
          setConnectionStatus('reconnecting');
        } else {
          verifiedSessionRef.current = false;
          setUser(null); setAuthGate('offline'); setLoading(false);
        }
      }
    } finally {if(timer)clearTimeout(timer);controller?.abort();}
  },[invited,denyPrivateAccess]);

  useEffect(() => {
    if(!supabase){setAuthGate('denied');setLoading(false);return;}
    let active=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      if(event==='SIGNED_OUT'||!session){
        // CONNECT_PWA_LOGOUT_SESSION_RECOVERY_20261117
        ++authSequence.current;
        denyPrivateAccess();
        void Promise.resolve().then(()=>window.__connectPrepareSession?.(null)).catch(()=>{});
      } else if(event==='INITIAL_SESSION'||event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED'||event==='PASSWORD_RECOVERY'){
        if(verifiedIdentityRef.current&&session.user.id!==verifiedIdentityRef.current){++authSequence.current;denyPrivateAccess();}
        if(event==='PASSWORD_RECOVERY')passwordRecoveryPending.current=true;
        // Supabase auth callbacks must not await other auth methods synchronously.
        queueMicrotask(()=>{if(active)void verifyAuth();});
      }
    });
    void verifyAuth();
    const onOffline=()=>{
      ++authSequence.current;
      if(verifiedSessionRef.current) { setConnectionStatus('offline'); return; }
      setUser(null);setAuthGate('offline');setLoading(false);
    };
    const onReturn=()=>{
      if(document.visibilityState!=='visible')return;
      if(navigator.onLine!==false) setConnectionStatus(s=>s==='offline'?'reconnecting':s);
      void verifyAuth();
    };
    window.addEventListener('offline',onOffline);
    window.addEventListener('online',onReturn);
    window.addEventListener('focus',onReturn);
    window.addEventListener('pageshow',onReturn);
    document.addEventListener('visibilitychange',onReturn);
    const timer=window.setInterval(onReturn,60000);
    return ()=>{
      active=false;++authSequence.current;subscription.unsubscribe();
      window.removeEventListener('offline',onOffline);
      window.removeEventListener('online',onReturn);
      window.removeEventListener('focus',onReturn);
      window.removeEventListener('pageshow',onReturn);
      document.removeEventListener('visibilitychange',onReturn);
      window.clearInterval(timer);
    };
  },[verifyAuth,denyPrivateAccess]);

  // Re-register the current FCM token after login or token rotation, not only
  // when the user manually opens the notification settings screen.
  useEffect(() => {
    if(!supabase || !user || !window.ConnectAndroid) return;
    let cancelled=false;
    void supabase.auth.getSession().then(({data})=>{
      if(!cancelled && data.session?.user.id===user.id && data.session.access_token)
        window.ConnectAndroid?.register(data.session.access_token);
    }).catch(()=>{});
    return ()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user?.id]);

  async function authenticatedRequest(path:string,body?:object){
    if(!supabase)throw new Error('Нет соединения');
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)throw new Error('Сначала войдите в аккаунт');
    const res=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${session.access_token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const json=await res.json().catch(()=>({error:'Ошибка ответа сервера'}));
    if(!res.ok)throw new Error(json.error||'Ошибка сервера');
    return json;
  }
  const stickerCatalogEpoch=useRef(0);
  const stickerPriority=useRef<Set<string>>(new Set());
  const [stickerCatalogReady,setStickerCatalogReady]=useState(false);
  useEffect(()=>{
    const ids=new Set<string>();
    for(const m of messages){
      const found=m.body.match(/^\[\[connect-custom-sticker:([0-9a-f-]{36})\]\]$/);
      if(found)ids.add(found[1]);
    }
    stickerPriority.current=ids;
  },[messages]);
  useEffect(()=>{stickerCatalogEpoch.current++;setStickerCatalogReady(false);setCustomStickerUrls({});},[user?.id]);
  const loadCustomStickers=useCallback(async()=>{
    if(!supabase||!user)return;
    const epoch=++stickerCatalogEpoch.current;
    const viewer=user.id;
    const packs=await supabase.from('connect_sticker_packs').select('id,name,emoji,owner_id,is_public,created_at').order('created_at',{ascending:false});
    if(epoch!==stickerCatalogEpoch.current||packs.error)return;
    const list=(packs.data||[]) as CustomPack[];
    setCustomPacks(list);
    if(!list.length){setCustomStickers([]);setCustomStickerUrls({});setStickerCatalogReady(true);return;}
    const stickers=await supabase.from('connect_stickers').select('id,pack_id,name,storage_path,position').in('pack_id',list.map(p=>p.id)).order('position');
    if(epoch!==stickerCatalogEpoch.current||stickers.error)return;
    const items=(stickers.data||[]) as CustomSticker[];
    setCustomStickers(items);
    setStickerCatalogReady(true);
    // Prioritize stickers referenced by the open history. Do not wait for
    // hundreds of Storage signing requests before presenting any of them.
    const queue=[...items].sort((a,b)=>Number(stickerPriority.current.has(b.id))-Number(stickerPriority.current.has(a.id)));
    let cursor=0;
    const worker=async()=>{
      while(epoch===stickerCatalogEpoch.current&&cursor<queue.length){
        const st=queue[cursor++];
        const identity='/storage/v1/object/sign/connect-stickers/'+st.storage_path;
        try {
          const local=await resolveCachedMedia(identity,viewer);
          if(epoch!==stickerCatalogEpoch.current)return;
          if(local.startsWith('blob:')){
            setCustomStickerUrls(prev=>prev[st.id]===local?prev:{...prev,[st.id]:local});
            continue;
          }
          const {data}=await supabase!.storage.from('connect-stickers').createSignedUrl(st.storage_path,3600);
          if(epoch!==stickerCatalogEpoch.current)return;
          if(!data?.signedUrl)continue;
          const signed=mediaUrl(data.signedUrl);
          setCustomStickerUrls(prev=>prev[st.id]===signed?prev:{...prev,[st.id]:signed});
          // Queue a small, account-scoped cache write. Never block the UI on it.
          void prefetchStickerWebp(signed,viewer).catch(()=>{});
        }catch{/* Retry on next login/visibility refresh; never expose private packs. */}
      }
    };
    await Promise.all(Array.from({length:Math.min(4,queue.length)},()=>worker()));
  },[user?.id]);
  useEffect(()=>{void loadCustomStickers()},[loadCustomStickers]);
  async function createCustomPack(){
    if(!supabase||!user||!packName.trim()||busy)return;
    setBusy(true);
    const {error}=await supabase.from('connect_sticker_packs').insert({name:packName.trim().slice(0,60),emoji:packEmoji.slice(0,8)||'🎨',owner_id:user.id,is_public:packPublic});
    setBusy(false);if(error)setNotice('Не удалось создать набор: '+error.message);else{setPackName('');await loadCustomStickers();setNotice('Набор создан');}
  }
  async function convertStickerOnServer(file:File):Promise<Blob>{
    if(!supabase||!supabaseUrl||!supabaseKey)throw new Error('Нет соединения с сервером');
    const {data:{session},error}=await supabase.auth.getSession();
    if(error||!session?.access_token)throw new Error('Войдите в Connect для загрузки стикера');
    // FIX4 sends the actual File bytes through the existing authenticated proxy.
    // The previous functions.invoke({body:file}) reached Supabase as 0 bytes on iOS.
    return convertStickerWebpOnServer(file,{
      endpoint:supabaseUrl+'/functions/v1/connect-sticker-webp-convert',
      accessToken:session.access_token,
      apiKey:supabaseKey,
      transport:supabaseFetch,
    });
  }
  async function uploadCustomStickers(packId:string,files:File[]){ // CONNECT_PWA_STICKER_PICKER_IOS_FIX_20261115
    if(!supabase||!user||!packId||!files.length||busy)return;
    const pack=customPacks.find(p=>p.id===packId);
    if(!pack||pack.owner_id!==user.id)return;
    setBusy(true);
    setNotice('Обрабатываю '+Math.min(files.length,30)+' стикер(ов)…');
    try{
      for(const file of files.slice(0,30)){
        const prepared=await prepareStickerFile(file,convertStickerOnServer);
        const ext=prepared.type==='image/gif'?'gif':'webp';
        const path=`${user.id}/${pack.id}/${crypto.randomUUID()}.${ext}`;
        const uploaded=await supabase.storage.from('connect-stickers')
          .upload(path,prepared,{contentType:prepared.type,upsert:false});
        if(uploaded.error)throw uploaded.error;
        const saved=await supabase.from('connect_stickers').insert({
          pack_id:pack.id,name:file.name.replace(/\.[^.]+$/,'').slice(0,60),storage_path:path
        });
        if(saved.error){await supabase.storage.from('connect-stickers').remove([path]);throw saved.error;}
      }
      await loadCustomStickers();setNotice('Стикеры добавлены. JPG и PNG сохраняются в WebP.');
    }catch(e){setNotice('Не удалось загрузить: '+(e instanceof Error?e.message:'Ошибка'));}
    finally{setBusy(false);}
  }
  function toggleStickerSelection(id:string){
    setSelectedStickerIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  }
  async function deleteCustomStickers(items:CustomSticker[]){
    if(!supabase||!user||busy||!items.length)return;
    const ownPackIds=new Set(customPacks.filter(p=>p.owner_id===user.id).map(p=>p.id));
    const chosen=items.filter(st=>ownPackIds.has(st.pack_id));
    if(!chosen.length)return;
    const question=chosen.length===1?'Удалить стикер навсегда из набора?':'Удалить выбранные стикеры навсегда ('+chosen.length+' шт.)?';
    if(!window.confirm(question+' Файлы будут удалены с сервера. Ранее отправленные сообщения останутся в чатах как «Стикер недоступен».'))return;
    setBusy(true);
    try{
      const {data,error}=await supabase.from('connect_stickers').delete()
        .in('id',chosen.map(st=>st.id)).select('id');
      if(error)throw error;
      if((data||[]).length!==chosen.length)throw new Error('Некоторые стикеры не были удалены');
      setSelectedStickerIds([]);
      await loadCustomStickers();
      setNotice('Удалено стикеров: '+chosen.length+'. Файлы удалит серверная очистка не позднее следующего ежедневного запуска.');
    }catch(error){setNotice('Ошибка удаления: '+(error instanceof Error?error.message:String(error)));}
    finally{setBusy(false);}
  }
  async function deleteCustomSticker(st:CustomSticker){await deleteCustomStickers([st]);}
  async function deleteCustomPack(pack:CustomPack){
    if(!supabase||!user||busy||pack.owner_id!==user.id||!window.confirm(`Удалить набор «${pack.name}» со всеми стикерами? Файлы будут очищены на сервере.`))return;
    setBusy(true);
    try{
      const {data,error}=await supabase.from('connect_sticker_packs').delete()
        .eq('id',pack.id).eq('owner_id',user.id).select('id');
      if(error||!data?.length)throw error||new Error('Набор не удалён');
      setEditingStickerPack(null);setSelectedStickerIds([]);setCustomPack('');
      await loadCustomStickers();
      setNotice('Набор удалён. Файлы поставлены в очередь безопасной очистки.');
    }catch(error){setNotice('Ошибка удаления набора: '+(error instanceof Error?error.message:String(error)));}
    finally{setBusy(false);}
  }
  // Convert previously uploaded PNG/JPEG when its owner opens Settings → Stickers.
  // Upload + download-verify + conditional DB path switch; the old path is queued
  // by a database trigger and only removed after the new object is active.
  useEffect(()=>{
    if(!supabase||!user||busy||settingsPage!=='stickers')return;
    const ownPacks=new Set(customPacks.filter(p=>p.owner_id===user.id).map(p=>p.id));
    const candidate=customStickers.find(st=>ownPacks.has(st.pack_id)&&
      /\.(png|jpe?g)$/i.test(st.storage_path)&&!migratedStickerAttempts.current.has(st.id));
    if(!candidate)return;
    migratedStickerAttempts.current.add(candidate.id);
    void (async()=>{
      setBusy(true);
      let freshPath='';
      try{
        const old=await supabase!.storage.from('connect-stickers').download(candidate.storage_path);
        if(old.error||!old.data)throw old.error||new Error('Исходный стикер недоступен');
        const inputType=/\.png$/i.test(candidate.storage_path)?'image/png':'image/jpeg';
        const next=await prepareStickerFile(new File([old.data],candidate.name+'.png',{type:inputType}));
        if(next.type!=='image/webp')throw new Error('Конвертация не создала WebP');
        freshPath=`${user!.id}/${candidate.pack_id}/${crypto.randomUUID()}.webp`;
        const up=await supabase!.storage.from('connect-stickers').upload(freshPath,next,{contentType:'image/webp',upsert:false});
        if(up.error)throw up.error;
        const check=await supabase!.storage.from('connect-stickers').download(freshPath);
        if(check.error||!check.data||check.data.size!==next.size)throw new Error('Не удалось проверить загруженный WebP');
        const update=await supabase!.from('connect_stickers').update({storage_path:freshPath})
          .eq('id',candidate.id).eq('storage_path',candidate.storage_path).select('id');
        if(update.error||update.data?.length!==1)throw update.error||new Error('Стикер изменён на другом устройстве');
        freshPath=''; // The new file is active. Trigger queued the old PNG for server GC.
        await loadCustomStickers();
        setNotice('Старый PNG преобразован в WebP.');
      }catch(error){
        if(freshPath)await supabase!.storage.from('connect-stickers').remove([freshPath]);
        setNotice('Конвертация старого стикера: '+(error instanceof Error?error.message:String(error)));
      }finally{setBusy(false);}
    })();
  },[settingsPage,user?.id,busy,customStickers,customPacks,loadCustomStickers]);
  function customStickerUrl(st:CustomSticker){return customStickerUrls[st.id]||''}
  async function sendCustomSticker(st:CustomSticker){
    if(!supabase||!user||!activeChat||busy)return;
    const savedPack = customPacks.find(pack => pack.id === st.pack_id);
    if(savedPack?.owner_id === user.id && savedPack.name === IOS_FAVORITE_PACK) {
      try {
        const result = await supabase.storage.from('connect-stickers').download(st.storage_path);
        if (result.error || !result.data) throw result.error || new Error('Не удалось загрузить стикер');
        const ext = /\.(png|webp|gif)$/i.exec(st.storage_path)?.[1]?.toLowerCase() || 'png';
        const mime = ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/png';
        await sendAttachment(new File([result.data], `sticker-${Date.now()}.${ext}`, {type:mime}));
        setStickerPicker(false);
      } catch (error) {
        setNotice('Не удалось отправить стикер: '+(error instanceof Error?error.message:String(error)));
      }
      return;
    }
    setBusy(true);
    const {error}=await supabase.from('messages').insert({conversation_id:activeChat,sender_id:user.id,body:`[[connect-custom-sticker:${st.id}]]`,reply_to:replyTo?.id||null});
    setBusy(false);if(error)setNotice(error.message);else{setStickerPicker(false);setReplyTo(null);}
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
    const operation=sessionScope.capture();
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('id,display_name,is_blocked,bio,avatar_path,last_seen_at,online_until'),
      supabase.from('conversations').select('id,user_a,user_b,created_at').order('created_at', { ascending: false }),
    ]);
    if(!sessionScope.current(operation))return;
    if (p.error) setNotice(p.error.message); else {
      const directory = (p.data || []) as Profile[];
      setProfiles(directory);
      setPresence(Object.fromEntries(directory.map(p=>[p.id,{last_seen_at:p.last_seen_at,online_until:p.online_until}])));
      // Local avatars first. Sign only missing files; never block the chat list.
      const epoch=++avatarCacheEpoch.current, owner=user.id;
      const candidates=directory.filter(x=>x.avatar_path);
      void Promise.all(candidates.map(async x=>{
        const identity='/storage/v1/object/sign/connect-avatars/'+x.avatar_path!;
        const local=await resolveCachedMedia(identity,owner).catch(()=>identity);
        return {id:x.id,path:x.avatar_path!,local:local.startsWith('blob:')?local:''};
      })).then(items=>{
        if(avatarCacheEpoch.current!==epoch||activePreviewUser.current!==owner)return;
        setAvatarUrls(Object.fromEntries(items.filter(x=>x.local).map(x=>[x.id,x.local])));
        // Signed URLs are short-lived; paths in IndexedDB are stable.
        void Promise.all(items.filter(x=>!x.local).map(async x=>{
          const {data}=await supabase.storage.from('connect-avatars').createSignedUrl(x.path,3600);
          if(!data?.signedUrl||avatarCacheEpoch.current!==epoch||activePreviewUser.current!==owner)return;
          const url=mediaUrl(data.signedUrl);
          setAvatarUrls(prev=>({...prev,[x.id]:url}));
          void prefetchCachedMedia(url,owner);
        })).catch(()=>{});
      }).catch(()=>{});
    }
    if (c.error) setNotice(c.error.message); else setConversations((c.data || []) as Conversation[]);
    setDirectoryReady(true);
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
    const operation=sessionScope.capture();if(operation.userId!==user.id)return;
    if(deliveredCache.current[id] && deliveredCache.current[id]>=iso)return;
    deliveredCache.current[id]=iso;
    const {error}=await supabase.from('conversation_user_state').upsert(
      {conversation_id:id,user_id:user.id,last_delivered_at:iso},
      {onConflict:'conversation_id,user_id'}
    );
    if(!sessionScope.current(operation))return;
    if(error){delete deliveredCache.current[id];console.error('Delivery:',error.message);}
  },[user?.id]);

  const markRead = useCallback(async (id: string, iso: string) => {
    if (!supabase || !user || document.visibilityState!=='visible') return;
    const operation=sessionScope.capture();if(operation.userId!==user.id)return;
    readSyncPending.current[id]=readSyncPending.current[id]>iso?readSyncPending.current[id]:iso;
    if(readSyncBusy.current[id])return;
    readSyncBusy.current[id]=true;
    try { while(readSyncPending.current[id]) {
    iso=readSyncPending.current[id];delete readSyncPending.current[id];
    if (readCache.current[id] && readCache.current[id] >= iso) continue;
    readCache.current[id] = iso;
    // A one-row-per-chat summary cannot count a partially read history window.
    // Keep exact server totals until the next explicit invalidation resolves.
    const { error } = await supabase.from('conversation_user_state').upsert(
      { conversation_id: id, user_id: user.id, last_read_at: iso },
      { onConflict: 'conversation_id,user_id' },
    );
    if(!sessionScope.current(operation))return;
    if (error) { delete readCache.current[id]; console.error('Read receipt:', error.message); }
    else {
      window.ConnectAndroid?.dismissConversationNotifications(id,iso);
      navigator.serviceWorker?.controller?.postMessage({type:'CONNECT_READ',userId:user.id,conversationId:id,readAt:iso});
      // A signed-in read receipt also clears Android notifications on other devices.
      const {data:{session}}=await supabase.auth.getSession();
      if(session?.user.id===user.id&&sessionScope.current(operation)) void fetch('/api/push/read',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({conversationId:id,readAt:iso})
      }).catch(()=>{});
    }
    window.dispatchEvent(new Event('connect:inbox-invalidated'));
    }} finally {if(sessionScope.current(operation))readSyncBusy.current[id]=false;}
  }, [user?.id]);

  // Android native notifications follow the chat the user is actually viewing.
  useEffect(() => {
    const sync = () => window.ConnectAndroid?.setActiveConversation(
      document.visibilityState === 'visible' && tab === 'chats' && activeChat ? activeChat : ''
    );
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.ConnectAndroid?.setActiveConversation('');
    };
  }, [activeChat, tab]);

  const updateActivity=useCallback((id:string,kind:string|null):Promise<void>=>{
    if(!supabase||!user)return Promise.resolve();
    const now=Date.now(),last=activityLast.current;
    if(last.chat===id&&last.kind===(kind||'')&&now-last.at<4000)return Promise.resolve();
    activityLast.current={chat:id,kind:kind||'',at:now};
    const until=kind?new Date(now+activityTtl(kind)).toISOString():null;
    const values:Database['public']['Tables']['conversation_user_state']['Insert']={conversation_id:id,user_id:user.id,typing_until:kind==='typing'?until:null,recording_until:kind==='voice'?until:null};
    if(activitySupported.current){values.activity_kind=kind;values.activity_until=until;}
    // Serialize status writes so a delayed cleanup cannot overwrite the next status.
    const client=supabase;
    const write=activityWriteQueue.current.then(async()=>{
      const {error}=await client.from('conversation_user_state').upsert(values,{onConflict:'conversation_id,user_id'});
      if(error)console.warn('Connect activity update failed:',error.message);
    });
    activityWriteQueue.current=write.catch(()=>{});
    return activityWriteQueue.current;
  },[user?.id]);
  const updateTyping=useCallback((id:string,value:boolean)=>updateActivity(id,value?'typing':null),[updateActivity]);
  const updateRecording=useCallback((id:string,value:boolean)=>updateActivity(id,value?'voice':null),[updateActivity]);
  useEffect(()=>{
    if(!activeChat)return;
    const kind=composerActivity(videoNoteRecording,stickerPicker,filePickerOpen);
    if(!kind)return;
    void updateActivity(activeChat,kind);
    const pulse=setInterval(()=>void updateActivity(activeChat,kind),4000);
    const hidden=()=>{
      const isVisible=document.visibilityState==='visible';
      // A system file picker can temporarily hide a mobile PWA; keep its short-lived status.
      if(kind==='file' && !isVisible)return;
      void updateActivity(activeChat,isVisible?kind:null);
    };
    document.addEventListener('visibilitychange',hidden);
    return()=>{clearInterval(pulse);document.removeEventListener('visibilitychange',hidden);void updateActivity(activeChat,null);};
  },[activeChat,videoNoteRecording,stickerPicker,filePickerOpen,updateActivity]);
  useInbox(supabase,user?.id||null,{
    read:readCache,visibility:visibilityFilter,
    onRows:(rows,changed)=>{
      if(!user)return;
      const states=rows.flatMap(row=>row.states);
      for(const state of states)if(state.user_id===user.id&&state.last_read_at>(readCache.current[state.conversation_id]||''))readCache.current[state.conversation_id]=state.last_read_at;
      for(const row of rows){
        if(row.incoming_at)void markDelivered(row.conversation_id,row.incoming_at);
        const at=readCache.current[row.conversation_id];
        if(at&&row.incoming_at&&row.incoming_at<=at)window.ConnectAndroid?.dismissConversationNotifications(row.conversation_id,at);
      }
      const current=activeChatRef.current;
      const peer=states.find(st=>st.conversation_id===current&&st.user_id!==user.id);
      setPeerActivity(peer?.activity_kind&&Date.parse(peer.activity_until||'')>Date.now()?{chat:current!,kind:peer.activity_kind,until:Date.parse(peer.activity_until!)}:null);
      setTyping(Date.parse(peer?.typing_until||'')>Date.now());setPeerRecording(Date.parse(peer?.recording_until||'')>Date.now());
      if(!changed)return;
      recentMessagesRef.current=rows.flatMap(row=>row.latest?[row.latest]:[]);
      setLatest(Object.fromEntries(rows.filter(row=>row.latest).map(row=>[row.conversation_id,row.latest!])));
      setUnread(Object.fromEntries(rows.map(row=>[row.conversation_id,Number(row.unread_count)])));
      setPeerStates(Object.fromEntries(states.filter(st=>st.user_id!==user.id).map(st=>[st.conversation_id,{delivered:st.last_delivered_at,read:st.last_read_at}])));
    },
    onDirectory:()=>{void loadDirectory();},
    onError:()=>setConnectionStatus(navigator.onLine===false?'offline':'reconnecting'),
    onProfile:p=>{setPresence(prev=>({...prev,[p.id]:{last_seen_at:p.last_seen_at,online_until:p.online_until}}));setProfiles(prev=>prev.some(row=>row.id===p.id)?prev.map(row=>row.id===p.id?p:row):prev);}
  });

  // Seed the latest chat windows from the already fetched inbox feed. No extra
  // Supabase queries, no bulk media reads, and no changes to call/push handling.
  useEffect(()=>{
    if(!user?.id||!conversations.length)return;
    const owner=user.id;
    const timer=window.setTimeout(()=>{
      const rows=recentMessagesRef.current;
      const ordered=[...conversations].sort((a,b)=>(latest[b.id]?.created_at||b.created_at).localeCompare(latest[a.id]?.created_at||a.created_at)).slice(0,7);
      void (async()=>{
        for(const chat of ordered){
          if(activePreviewUser.current!==owner)return;
          const visible=rows.filter(m=>m.conversation_id===chat.id&&!m.deleted_at&&!serverDeleted.current.has(m.id)).sort(compareChatMessages).slice(-90);
          const signature=visible.map(m=>m.id+':'+(m.edited_at||'')).join('|');
          const key=owner+':'+chat.id;
          if(visible.length&&historyWarmStamps.current[key]!==signature){
            await writeChatHistory(owner,chat.id,visible,readCache.current[chat.id]||'').catch(()=>{});
            historyWarmStamps.current[key]=signature;
          }
          await prewarmChatHistory(owner,chat.id).catch(()=>{});
        }
      })();
    },320);
    return()=>window.clearTimeout(timer);
  },[user?.id,conversations,latest]);

  // Give nearby chats a head start: a few lightweight thumbnails plus at
  // most three bounded photos are signed and cached before the next tap.
  useEffect(()=>{
    if(!supabase||!user?.id||!conversations.length)return;
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    if(connection?.saveData||connection?.effectiveType==='2g')return;
    const owner=user.id;
    const timer=window.setTimeout(()=>{void(async()=>{
      const hotChats=new Set([...conversations].sort((a,b)=>(latest[b.id]?.created_at||b.created_at).localeCompare(latest[a.id]?.created_at||a.created_at)).slice(0,3).map(c=>c.id));
      const rows=recentMessagesRef.current.filter(m=>hotChats.has(m.conversation_id)&&!m.deleted_at&&!serverDeleted.current.has(m.id)).sort(compareChatMessages).slice(-50).reverse();
      const candidates=rows.flatMap(m=>[
        ...(m.attachment_kind==='image'&&m.attachment_path&&supportsPhotoPreview(m.attachment_path)?[{path:photoPreviewPath(m.attachment_path),original:false}]:[]),
        ...parseAlbum(m.body).filter(x=>x.kind==='image'&&supportsPhotoPreview(x.path)).map(x=>({path:photoPreviewPath(x.path),original:false})),
        ...(connection?.effectiveType!=='3g'&&m.attachment_kind==='image'&&m.attachment_path&&m.attachment_size&&m.attachment_size<=6*1024**2?[{path:m.attachment_path,original:true}]:[])
      ]);
      let thumbs=0,originals=0;
      for(const candidate of candidates){
        if(activePreviewUser.current!==owner)return;
        if(candidate.original?originals>=3:thumbs>=10)continue;
        const key=owner+':'+candidate.path,until=inboxMediaWarm.current.get(key)||0;
        if(until>Date.now())continue;
        inboxMediaWarm.current.set(key,Date.now()+60000);
        if(candidate.original)originals++;else thumbs++;
        try{
          const identity='/storage/v1/object/sign/connect-attachments/'+candidate.path;
          if((await resolveCachedMedia(identity,owner)).startsWith('blob:'))continue;
          const {data,error}=await supabase.storage.from('connect-attachments').createSignedUrl(candidate.path,3600);
          if(!error&&data?.signedUrl)await prefetchCachedMedia(mediaUrl(data.signedUrl),owner,candidate.original);
        }catch{/* Preloading never blocks chat navigation. */}
      }
    })();},900);
    return()=>window.clearTimeout(timer);
  },[user?.id,conversations,latest]);

  useEffect(() => {
    if (!supabase || !activeChat || !user) return;
    let alive = true;
    let firstLoad = true;
    let firstLoadPending = false;
    let refreshing = false;
    let cacheHydrated = false;
    historyGeneration.current++;historyPaging.current=false;historyTouched.current=false;historyAppend.current=false;
    historyOldest.current=null;historyNewest.current=null;setNewerHistory(false);
    setMessages([]); setTyping(false); setPeerRecording(false); setMenuMessage(null);
    setChatHistoryLoading(true);setHistoryHasMore(false);setHistoryReadyChat(null);
    setChatReadingEntry(null); setShowChatJump(false);
    chatPositionedRef.current = null;
    previousLast.current = ''; stickToBottom.current = false;
    const id = activeChat;
    void supabase.from('conversation_user_state').upsert({ conversation_id: id, user_id: user.id }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
    const refresh = async () => {
      if (!alive || !cacheHydrated || document.visibilityState === 'hidden' || firstLoadPending || refreshing) return;
      refreshing = true;
      if (firstLoad) firstLoadPending = true;
      try {
      const [messageResult, entryStateResult] = await Promise.all([
        (()=>{let query=supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id',id).is('deleted_at',null);const upper=historyNewest.current;if(!firstLoad&&historyNewer.current&&upper)query=query.or(`created_at.lt.${upper.created_at},and(created_at.eq.${upper.created_at},id.lte.${upper.id})`);return query.order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);})(),
        firstLoad ? supabase.from('conversation_user_state').select('last_read_at')
          .eq('conversation_id', id).eq('user_id', user.id).maybeSingle() : Promise.resolve(null),
      ]);
      refreshing = false;
      if (!alive) return;
      const { data, error } = messageResult;
      if (error) { firstLoadPending = false; setChatHistoryLoading(false); setNotice(error.message); return; }
      let incoming = ((data || []) as Message[]).reverse();
      const firstResponse=firstLoad;let recentered=false;
      if(firstLoad){
        const readAt=[readCache.current[id]||'',entryStateResult?.data?.last_read_at||''].sort((a,b)=>chatTimeKey(a).localeCompare(chatTimeKey(b)))[1];
        const latest=incoming[incoming.length-1],cachedUpper=historyNewest.current,recent=incoming;let restoredCached=false;
        if(cachedUpper&&(historyNewer.current||historyTouched.current)){
          const {data:windowRows,error:windowError}=await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id',id).is('deleted_at',null).or(`created_at.lt.${cachedUpper.created_at},and(created_at.eq.${cachedUpper.created_at},id.lte.${cachedUpper.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(200);
          if(windowError)throw windowError;if(!alive)return;incoming=((windowRows||[])as Message[]).reverse();
          if(incoming.length){restoredCached=true;setNewerHistory(!!latest&&compareChatMessages(latest,incoming[incoming.length-1])>0);}else{incoming=recent;recentered=true;setNewerHistory(false);}
        }
        if(!restoredCached&&readAt&&latest?.sender_id!==user.id&&incoming.length&&chatTimeKey(incoming[0].created_at)>chatTimeKey(readAt)){
          const {data:unreadRow,error:unreadError}=await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id',id).is('deleted_at',null).neq('sender_id',user.id).gt('created_at',readAt).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(1).maybeSingle();
          if(unreadError)throw unreadError;if(!alive)return;
          if(unreadRow){const anchor=unreadRow as Message;const [before,after]=await Promise.all([
            supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id',id).is('deleted_at',null).or(`created_at.lt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.lt.${anchor.id})`).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(30),
            supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id',id).is('deleted_at',null).or(`created_at.gt.${anchor.created_at},and(created_at.eq.${anchor.created_at},id.gte.${anchor.id})`).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(170)
          ]);if(before.error||after.error)throw before.error||after.error;if(!alive)return;
            incoming=[...((before.data||[])as Message[]).reverse(),...(after.data||[])as Message[]];recentered=true;
            setNewerHistory(!!latest&&!!incoming.length&&compareChatMessages(latest,incoming[incoming.length-1])>0);
          }
        }
        setHistoryHasMore(recentered?incoming.length>=30:incoming.length===200);
      }
      for(const row of incoming)if(row.deleted_at){serverDeleted.current.add(row.id);void dropCachedMessage(user.id,id,row.id).catch(()=>{});}
      if(recentered&&!historyTouched.current)chatPositionedRef.current=null;
      if(incoming.length){if(firstResponse||!historyOldest.current)historyOldest.current=incoming[0];if(firstResponse||!historyNewest.current||compareChatMessages(incoming[incoming.length-1],historyNewest.current)>0)historyNewest.current=incoming[incoming.length-1];}
      if (firstLoad) {
        firstLoad = false;
        firstLoadPending = false;
        // Snapshot the read boundary BEFORE anything becomes visible. Never
        // declare all 500 messages read just because the chat was opened.
        const serverAt = entryStateResult?.data?.last_read_at || '';
        const localAt = readCache.current[id] || '';
        const readAt = serverAt > localAt ? serverAt : localAt;
        if (readAt > localAt) readCache.current[id] = readAt;
        const displayed = incoming.filter(m => !m.deleted_at && !hiddenMessages.includes(m.id)
          && (!clearedChats[id] || m.created_at > clearedChats[id]));
        const unreadIndex = displayed.findIndex(m => m.sender_id !== user.id && m.created_at > readAt);
        let anchorIndex = unreadIndex >= 0 ? Math.max(0, unreadIndex - 1) : displayed.length - 1;
        // If my own message is the newest, return to it rather than a stale read receipt.
        if (displayed[displayed.length-1]?.sender_id === user.id) anchorIndex = displayed.length - 1;
        setChatReadingEntry({ chatId:id, readAt,
          firstUnreadId:unreadIndex >= 0 ? displayed[unreadIndex].id : null,
          anchorId:displayed[anchorIndex]?.id || null });
      }
      setMessages(prev => {
        // A 500-row response is a recent window, not proof that older cached
        // messages were deleted. A shorter complete response supersedes cache.
        const firstIncoming=incoming[0];
        const older=!recentered&&incoming.length===200 ? prev.filter(m=>m.conversation_id===id&&firstIncoming&&compareChatMessages(m,firstIncoming)<0&&!m.deleted_at&&!serverDeleted.current.has(m.id)) : [];
        const queued=prev.filter(m=>m.id.startsWith('local-')&&m.conversation_id===id);
        const merged=[...older,...incoming,...queued].filter(m=>!m.deleted_at&&!serverDeleted.current.has(m.id)).sort(compareChatMessages);
        if(prev.length===merged.length&&prev.every((m,i)=>m.id===merged[i].id&&m.body===merged[i].body&&m.edited_at===merged[i].edited_at&&m.deleted_at===merged[i].deleted_at&&m.attachment_path===merged[i].attachment_path))return prev;
        return merged;
      });
      if(!incoming.length)void wipeChatHistory(user.id,id).catch(()=>{});
      setChatHistoryLoading(false);setHistoryReadyChat(id);
      // Read receipts are updated from messages actually shown in the viewport.
      } catch (error) { if(alive){setChatHistoryLoading(false);setNotice(error instanceof Error?error.message:'Ошибка обновления чата');} }
      finally { refreshing=false; firstLoadPending=false; }
    };
    // Read cache before the first network fetch so we never flash "no messages".
    void readChatHistory<Message>(user.id,id).then(snapshot=>{
      if(!alive||!snapshot?.messages.length)return;
      const saved=snapshot.messages;
      historyOldest.current=saved[0];historyNewest.current=saved[saved.length-1];setNewerHistory(!!snapshot.hasNewer);
      setMessages(saved);
      const readAt=readCache.current[id]>snapshot.readAt?readCache.current[id]:snapshot.readAt;
      const unreadIndex=saved.findIndex(m=>m.sender_id!==user.id&&m.created_at>readAt);
      const anchorIndex=unreadIndex>=0?Math.max(0,unreadIndex-1):saved.length-1;
      setChatReadingEntry({chatId:id,readAt,firstUnreadId:unreadIndex>=0?saved[unreadIndex].id:null,anchorId:saved[anchorIndex]?.id||null});
      setChatHistoryLoading(false);setHistoryReadyChat(id);
      setHistoryHasMore(true);
    }).catch(()=>{}).finally(()=>{cacheHydrated=true;if(alive)void refresh();});
    const reconciliation=createReconciler(refresh,{visible:()=>document.visibilityState!=='hidden'});
    const channel = supabase.channel('connect-chat-' + id).on('postgres_changes', {
      event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + id,
    }, payload => {
      if (!alive) return;
      if (payload.eventType === 'DELETE') {
        const removedId=(payload.old as {id?:string})?.id;
        if (removedId){setMessages(prev=>prev.filter(row=>row.id!==removedId));void dropCachedMessage(user.id,id,removedId).catch(()=>{});}
        return;
      }
      const m = payload.new as Message;
      if (!m?.id) return;
      if(m.deleted_at)void dropCachedMessage(user.id,id,m.id).catch(()=>{});
      if(historyNewer.current&&historyNewest.current&&compareChatMessages(m,historyNewest.current)>0){
        void writeChatHistory(user.id,id,[m],readCache.current[id]||'').catch(()=>{});setShowChatJump(true);
        if(m.sender_id!==user.id)return;
        setNewerHistory(false);historyOldest.current=m;historyNewest.current=m;setMessages([m]);void refresh();return;
      }
      const optimistic=optimisticSend.current;
      const replaceOptimistic=optimistic&&optimistic.chat===id&&m.sender_id===user.id&&
        m.body===optimistic.body&&m.reply_to===optimistic.reply&&m.created_at>=optimistic.at;
      setMessages(prev=>{
        const without=replaceOptimistic?prev.filter(x=>x.id!==optimistic!.id):prev;
        const exists=without.some(x=>x.id===m.id);
        return exists?without.map(x=>x.id===m.id?m:x):[...without,m].sort(compareChatMessages);
      });
      // The viewport scan acknowledges messages only after they are actually shown.
    }).subscribe(status => {reconciliation.setHealthy(status==='SUBSCRIBED');if(status==='SUBSCRIBED')void reconciliation.trigger();});
    void reconciliation.trigger();
    const onVisible = () => { if (document.visibilityState === 'visible') void reconciliation.trigger(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      historyGeneration.current++;
      alive = false; reconciliation.stop(); document.removeEventListener('visibilitychange', onVisible);
      if (scrollCheckFrame.current !== null) cancelAnimationFrame(scrollCheckFrame.current);
      scrollCheckFrame.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeChat, user?.id, markRead]);

  useEffect(()=>{
    if(!user?.id||!activeChat||!messages.some(m=>m.conversation_id===activeChat))return;
    const userId=user.id,chatId=activeChat;
    const rows=messages.filter(m=>m.conversation_id===chatId&&!m.id.startsWith('local-')&&!m.deleted_at&&!hiddenMessages.includes(m.id)&&!serverDeleted.current.has(m.id));
    const timer=window.setTimeout(()=>{void writeChatHistory(userId,chatId,rows,readCache.current[chatId]||'').catch(()=>{});},400);
    return()=>window.clearTimeout(timer);
  },[user?.id,activeChat,messages,hiddenMessages]);

  async function loadOlderChatMessages(){await loadHistoryPage(false);}
  async function loadNewerChatMessages(){await loadHistoryPage(true);}
  async function loadHistoryPage(forward:boolean){
    if(!supabase||!user||!activeChat||historyPaging.current||!(forward?historyNewer.current:historyHasMore))return;
    const id=activeChat,generation=historyGeneration.current,cursor=(forward?historyNewest.current:historyOldest.current)||(forward?visibleMessages[visibleMessages.length-1]:visibleMessages[0]);
    if(!cursor)return;
    historyPaging.current=true;
    setHistoryLoadingMore(true);
    const root=scrollRef.current;
    const first=root?.querySelector<HTMLElement>('.message-day-group[id]');
    if(first)olderHistoryAnchor.current={id:first.id,top:first.getBoundingClientRect().top};
    try{
      const cached=await(forward?readNewerChatHistory<Message>(user.id,id,cursor.created_at,cursor.id):readOlderChatHistory<Message>(user.id,id,cursor.created_at,cursor.id)).catch(()=>null);
      if(activeChatRef.current!==id||historyGeneration.current!==generation)return;
      const merge=(rows:Message[])=>setMessages(prev=>{const ids=new Set(prev.map(m=>m.id)),added=rows.filter(m=>!ids.has(m.id)&&!m.deleted_at&&!serverDeleted.current.has(m.id));if(!added.length)return prev;if(forward){historyAppend.current=true;stickToBottom.current=false;}return[...prev,...added].sort(compareChatMessages);});
      if(cached?.messages.length)merge(cached.messages);
      const {data,error}=await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id',id).is('deleted_at',null)
        .or(`created_at.${forward?'gt':'lt'}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${forward?'gt':'lt'}.${cursor.id})`).order('created_at',{ascending:forward}).order('id',{ascending:forward}).limit(120);
      if(error)throw error;
      if(activeChatRef.current!==id||historyGeneration.current!==generation)return;
      const rows=(forward?(data||[]):[...(data||[])].reverse())as Message[];
      for(const row of rows)if(row.deleted_at){serverDeleted.current.add(row.id);await dropCachedMessage(user.id,id,row.id).catch(()=>{});}
      if(rows.length){if(forward)historyNewest.current=rows[rows.length-1];else historyOldest.current=rows[0];merge(rows);}
      if(forward)setNewerHistory(rows.length===120);else setHistoryHasMore(rows.length===120);
    }catch(e){if(historyGeneration.current===generation){olderHistoryAnchor.current=null;setNotice('Не удалось загрузить историю: '+(e instanceof Error?e.message:String(e)));}}
    finally{if(historyGeneration.current===generation){historyPaging.current=false;setHistoryLoadingMore(false);}}
  }
  useLayoutEffect(()=>{
    const point=olderHistoryAnchor.current;if(!point)return;
    const root=scrollRef.current,node=document.getElementById(point.id);
    if(root&&node){root.scrollTop+=node.getBoundingClientRect().top-point.top;olderHistoryAnchor.current=null;}
  },[messages]);

  // Position before paint; a chat with unread messages starts at its read
  // boundary, not at an arbitrary retained browser scroll offset.
  useLayoutEffect(() => {
    if (!activeChat || !messages.length || chatReadingEntry?.chatId !== activeChat
        || chatPositionedRef.current === activeChat) return;
    const root = scrollRef.current;
    if (!root) return;
    let saved=savedChatAnchors.current[activeChat];
    if (!saved && user?.id) try { saved=JSON.parse(sessionStorage.getItem('connect-reading-anchor:'+user.id+':'+activeChat)||'null'); } catch {}
    const savedItem=!chatReadingEntry.firstUnreadId && saved?.items.find(item=>document.getElementById(item.id));
    const anchor = savedItem ? document.getElementById(savedItem.id) : chatReadingEntry.anchorId
      ? root.querySelector<HTMLElement>('#msg-' + chatReadingEntry.anchorId) : null;
    if (anchor) {
      const scrollOffset = anchor.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTop = Math.max(0, root.scrollTop + scrollOffset - (savedItem ? savedItem.top : 14));
    } else root.scrollTop = root.scrollHeight;
    chatPositionedRef.current = activeChat;
    const below = root.scrollHeight - root.scrollTop - root.clientHeight;
    stickToBottom.current = below < 110;
    setShowChatJump(below > 170);
    captureChatAnchor();
    requestAnimationFrame(() => { if (chatPositionedRef.current === activeChat) trackScroll(); });
  }, [activeChat, chatReadingEntry, messages.length]);

  useEffect(() => {
    if (!activeChat || !messages.length || chatPositionedRef.current !== activeChat) return;
    const last = messages[messages.length - 1];
    if (previousLast.current === last.id) return; // edits/deletions never force a jump
    if(historyAppend.current){historyAppend.current=false;previousLast.current=last.id;return;}
    const previousIndex=messages.findIndex(message=>message.id===previousLast.current);
    const initial = previousLast.current === '';
    previousLast.current = last.id;
    if (!initial && previousIndex < 0) return; // removal/replacement never requests bottom
    if (initial) return; // useLayoutEffect already placed the chat correctly
    if (stickToBottom.current || last.sender_id === user?.id) requestAnimationFrame(() => {
      if (chatPositionedRef.current !== activeChat) return;
      const el = scrollRef.current;
      if (el) { el.scrollTop = el.scrollHeight; stickToBottom.current = true; setShowChatJump(false); }
      if (last.sender_id !== user?.id) void markRead(activeChat, last.created_at);
    });
    else if (last.sender_id !== user?.id) {
      // If a new message arrived while reading above the bottom, show a divider.
      setChatReadingEntry(prev => prev?.chatId === activeChat && !prev.firstUnreadId
        ? { ...prev, firstUnreadId:last.id } : prev);
    }
  }, [activeChat, messages, user?.id, markRead]);

  useLayoutEffect(() => {
    if (chatPositionedRef.current===activeChat) restoreChatAnchor();
  }, [messages,hiddenMessages,frame,profileView,profileMediaOpen]);
  useEffect(() => {
    const root=scrollRef.current;
    if (!root || !activeChat || profileView) return;
    let frameId:number|undefined;
    const observer=new ResizeObserver(()=>{
      if(frameId!==undefined)return;
      frameId=requestAnimationFrame(()=>{frameId=undefined;restoreChatAnchor();});
    });
    observer.observe(root);
    if(root.firstElementChild)observer.observe(root.firstElementChild);
    return()=>{observer.disconnect();if(frameId!==undefined)cancelAnimationFrame(frameId);};
  },[activeChat,profileView,profileMediaOpen]);

  function trackScroll() {
    const el = scrollRef.current;
    if (!el || !activeChat || chatPositionedRef.current !== activeChat) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = remaining < 110 && !historyNewer.current;
    if(el.scrollTop<90&&historyHasMore&&!historyPaging.current)void loadOlderChatMessages();
    else if(remaining<160&&historyNewer.current&&!historyPaging.current)void loadNewerChatMessages();
    setShowChatJump(remaining > 170);
    // Throttle the read-receipt scan to one animation frame per scroll burst.
    if (scrollCheckFrame.current !== null || document.visibilityState !== 'visible') return;
    scrollCheckFrame.current = requestAnimationFrame(() => {
      scrollCheckFrame.current = null;
      if (!el.isConnected || chatPositionedRef.current !== activeChat) return;
      const visible=captureChatAnchor();
      if(!visible)return;
      const {nodes,bounds:viewport,first,last}=visible;
      for (let i = last; i >= first; i--) {
        const rect = nodes[i].getBoundingClientRect();
        if (rect.top >= viewport.bottom - 15 || rect.bottom <= viewport.top + 8) continue;
        const visiblePixels = Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top);
        if (visiblePixels < Math.min(rect.height * 0.55, 72)) continue;
        const m = messagesById.get(nodes[i].id.slice(4));
        if (m && m.sender_id !== user?.id) { queueVisibleRead(activeChat,m.created_at); break; }
      }
    });
  }

  function jumpToReadingPoint() {
    if(historyNewer.current){void loadNewerChatMessages();return;}
    const root = scrollRef.current;
    if (!root || !activeChat) return;
    const readAt = readCache.current[activeChat] || chatReadingEntry?.readAt || '';
    const last = messages[messages.length-1];
    const target = [...messages].reverse().find(m => m.created_at <= readAt
      || (last?.sender_id === user?.id && m.id === last?.id));
    const node = target ? root.querySelector<HTMLElement>('#msg-' + target.id) : null;
    // Earlier in history: return to the last read message (or my last sent one).
    // Below that point: continue to the latest message. Never jump backwards.
    if (node && node.getBoundingClientRect().top > root.getBoundingClientRect().bottom - 25) {
      const offset = node.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top:root.scrollTop + offset - 15, behavior:'smooth' });
    } else root.scrollTo({ top:root.scrollHeight, behavior:'smooth' });
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
    setProfileView(id); setProfileMediaOpen(null); setEditName(p.display_name); setEditBio(p.bio || ''); setMenuMessage(null);
  }
  useEffect(()=>{
    const open=(event:Event)=>{
      const id=(event as CustomEvent<{ownerId:string}>).detail?.ownerId;
      const person=profiles.find(p=>p.id===id);
      if(!person)return;
      showProfile(person.id);setProfileMediaOpen('music');
    };
    window.addEventListener('connect:music-open',open);
    return()=>window.removeEventListener('connect:music-open',open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[profiles]);
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
  useEffect(()=>{
    if(!user)return;for(const m of messages)if(!serverDeleted.current.has(m.id)&&!m.deleted_at)void linkMessageMedia(user.id,m.id,[...(m.attachment_path?[m.attachment_path]:[]),...parseAlbum(m.body).map(x=>x.path)]).catch(()=>{});
  },[messages,user?.id]);
  // Retried private storage cleanups contain only object paths, never message text.
  useEffect(()=>{
    if(!supabase||!user)return;
    void supabase.functions.invoke('connect-delete-forever',{body:{cleanup_pending:true}}).catch(()=>{});
  },[user?.id]);
  useEffect(()=>{
    if(!supabase||!user)return;let active=true,running=false;
    const key='connect-deletion-cursor:'+user.id;
    const reconcile=async()=>{if(running||!active)return;running=true;try{
      let cursor={time:'1970-01-01T00:00:00.000Z',id:'00000000-0000-0000-0000-000000000000'};
      try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(stored&&Number.isFinite(Date.parse(stored.time))&&/^[0-9a-f-]{36}$/i.test(stored.id))cursor=stored;}catch{}
      for(let batch=0;batch<10&&active;batch++){
        const {data,error}=await supabase!.rpc('connect_deleted_since',{p_after:cursor.time,p_id:cursor.id,p_limit:200});if(error||!Array.isArray(data)||!data.length)break;
        for(const row of data){serverDeleted.current.add(row.message_id);setMessages(prev=>prev.some(m=>m.id===row.message_id)?prev.filter(m=>m.id!==row.message_id):prev);await purgeDeletedMedia(user.id,row.message_id);await dropCachedMessageById(user.id,row.message_id);if(!active)return;cursor={time:row.deleted_at,id:row.message_id};}
        localStorage.setItem(key,JSON.stringify(cursor));if(data.length<200)break;
      }
    }catch{/* Retry without advancing cursor on storage/network failures. */}finally{running=false;}};
    void reconcile();const timer=setInterval(()=>void reconcile(),15000);const resumed=()=>{if(document.visibilityState==='visible')void reconcile();};document.addEventListener('visibilitychange',resumed);
    return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',resumed);};
  },[user?.id]);
  const visibleMessages=messages.filter(m=>m.conversation_id===activeChat&&!serverDeleted.current.has(m.id)&&!m.deleted_at && !hiddenMessages.includes(m.id) && (!activeChat || !clearedChats[activeChat] || m.created_at>clearedChats[activeChat]));
  useEffect(()=>{
    if(historyReadyChat!==activeChat||visibleMessages.length||historyLoadingMore)return;
    if(historyHasNewer)void loadNewerChatMessages();else if(historyHasMore)void loadOlderChatMessages();
  // Reconcile pages containing only locally hidden rows without an empty-chat flash.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeChat,historyReadyChat,visibleMessages.length,historyLoadingMore,historyHasNewer,historyHasMore]);
  const searchMatches=chatQuery.trim()?visibleMessages.filter(m=>m.body.toLocaleLowerCase('ru-RU').includes(chatQuery.trim().toLocaleLowerCase('ru-RU'))):[];
  function showMatch(index:number){if(!searchMatches.length)return;const i=(index+searchMatches.length)%searchMatches.length;setSearchPosition(i);requestAnimationFrame(()=>document.getElementById('msg-'+searchMatches[i].id)?.scrollIntoView({behavior:'smooth',block:'center'}));}
  function highlightMessage(body:string){if(!chatSearchOpen||!chatQuery.trim())return body;const i=body.toLocaleLowerCase('ru-RU').indexOf(chatQuery.trim().toLocaleLowerCase('ru-RU'));return i<0?body:<>{body.slice(0,i)}<mark className="chat-search-mark">{body.slice(i,i+chatQuery.trim().length)}</mark>{body.slice(i+chatQuery.trim().length)}</>;}
  useEffect(()=>{if(!user)return;try{setHiddenMessages(JSON.parse(localStorage.getItem('connect-hidden-messages:'+user.id)||'[]'));}catch{setHiddenMessages([])}},[user?.id]);
  function hideMessages(ids:string[]){if(!user)return;const next=Array.from(new Set([...hiddenMessages,...ids]));setHiddenMessages(next);try{localStorage.setItem('connect-hidden-messages:'+user.id,JSON.stringify(next))}catch{}for(const id of ids)void dropCachedMessageById(user.id,id).catch(()=>{});setSelectedIds([]);setSelectionMode(false);setMenuMessage(null);}
  function beginForward(ids:string[]){setForwardIds(ids);setMenuMessage(null);setChatActions(false);}
  async function forwardTo(contact:Profile) {
    if (!supabase || !user || busy) return;
    const items = visibleMessages.filter(m => forwardIds.includes(m.id));
    if (!items.length) { setForwardIds([]); return; }
    setBusy(true);
    try {
      const operation=sessionScope.capture();if(operation.userId!==user.id)return;
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
        const original=forwardedMessage(m.body);
        const senderName=original.from||profiles.find(p=>p.id===m.sender_id)?.display_name||(m.sender_id===user.id?ownProfile?.display_name:null)||'Пользователь';
        const copiedPaths:string[]=[];
        const bucket=supabase.storage.from('connect-attachments');
        const copyMedia=async(source:string,size?:number|null,mime?:string|null):Promise<string>=>{
          const suffix=source.match(/__(?:img|vid)_\d{1,5}x\d{1,5}$/)?.[0]||'';
          const destination=`${chat!.id}/${user.id}/${crypto.randomUUID()}${suffix}`;
          const copied=await bucket.copy(source,destination);
          if(copied.error){
            if(!size||size>6*1024*1024)throw new Error('Не удалось скопировать вложение: '+copied.error.message);
            const downloaded=await bucket.download(source);
            if(downloaded.error||!downloaded.data||downloaded.data.size>6*1024*1024)throw new Error('Не удалось прочитать вложение');
            const uploaded=await bucket.upload(destination,downloaded.data,{contentType:mime||downloaded.data.type||'application/octet-stream',upsert:false});
            if(uploaded.error)throw uploaded.error;
          }
          copiedPaths.push(destination);
          const sibling=supportsPhotoPreview(source)?'__thumb.webp':/__vid_\d{1,5}x\d{1,5}$/.test(source)?'__poster.jpg':null;
          if(sibling){
            try{
              const result=await bucket.copy(source+sibling,destination+sibling);
              if(!result.error)copiedPaths.push(destination+sibling);
              else {
                // Storage COPY can be restricted even though signed downloads are allowed.
                const fallback=await bucket.download(source+sibling);
                if(!fallback.error&&fallback.data&&fallback.data.size<=1024*1024){
                  const upload=await bucket.upload(destination+sibling,fallback.data,{contentType:sibling.endsWith('webp')?'image/webp':'image/jpeg',upsert:false});
                  if(!upload.error)copiedPaths.push(destination+sibling);
                }
              }
            }catch{/* Preview is optional; original is authoritative. */}
          }
          return destination;
        };
        try{
          const path=m.attachment_path?await copyMedia(m.attachment_path,m.attachment_size,m.attachment_type):null;
          const album=parseAlbum(original.text);
          let body=original.text;
          if(album.length){
            const copied:AlbumItem[]=[];
            for(const media of album)copied.push({...media,path:await copyMedia(media.path)});
            body=ALBUM_PREFIX+JSON.stringify(copied)+']]';
          }
          const {error}=await supabase.from('messages').insert({
            conversation_id:chat.id,sender_id:user.id,body:forwardBody(senderName,body),
            attachment_path:path,attachment_name:path?m.attachment_name:null,
            attachment_type:path?m.attachment_type:null,attachment_size:path?m.attachment_size:null,
            attachment_kind:path?m.attachment_kind:null,
          });
          if(error)throw error;
          count++;
        }catch(error){
          if(copiedPaths.length)await bucket.remove(copiedPaths).catch(()=>{});
          throw error;
        }
      }
      setForwardIds([]); setSelectedIds([]); setSelectionMode(false);
      enterChat(chat.id); setNotice('Переслано: ' + count);
    } catch (error) {
      setNotice('Не удалось переслать: ' + (error instanceof Error ? error.message : String(error)));
    } finally { setBusy(false); }
  }
  // CONNECT_PWA_HARD_DELETE_UNIFIED_QUALITY_20261115
  async function eraseMessage(m:Message){
    if(!supabase||!user)return {error:new Error('Нет соединения')};
    // The server verifies the sender, physically deletes the message row,
    // writes a content-free tombstone, and removes unreferenced media.
    // No fallback to a soft-delete: do not claim success if the server fails.
    const {data,error}=await supabase.functions.invoke<{deleted:boolean;pending_files?:number}>(
      'connect-delete-forever',{body:{message_id:m.id}}
    );
    if(error||!data?.deleted)return {error:error||new Error('Удаление не подтверждено сервером')};
    await dropCachedMessage(user.id,m.conversation_id,m.id).catch(()=>{});
    for(const path of [m.attachment_path,...parseAlbum(m.body).map(x=>x.path)]){
      if(path)await clearCachedMedia('temporary','connect-attachments/'+path);
    }
    if((data.pending_files||0)>0)setNotice('Сообщение удалено. Вложение ожидает очистки на сервере.');
    return {error:null};
  }
  async function removeForEveryone(ids:string[]){if(!supabase||!user||busy)return;const own=visibleMessages.filter(m=>ids.includes(m.id)&&m.sender_id===user.id);if(!own.length){setNotice('Можно удалить у всех только свои сообщения');return;}if(!window.confirm('Удалить '+own.length+' сообщ. у обоих участников?'))return;setBusy(true);let failed='';for(const m of own){const r=await eraseMessage(m);if(r.error){failed=r.error.message;break;}}setBusy(false);if(failed)setNotice('Не удалось удалить: '+failed);else{setMessages(prev=>prev.filter(m=>!own.some(x=>x.id===m.id)));setSelectedIds([]);setSelectionMode(false);setMenuMessage(null);}}
  function selectOne(id:string){setSelectedIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);}
  function startSelection(ids:string[]=[]){setSelectionMode(true);setSelectedIds(ids);setChatActions(false);setMenuMessage(null);}
  function resetChatTools(){setSelectionMode(false);setSelectedIds([]);setChatActions(false);setChatSearchOpen(false);setChatQuery('');setForwardIds([]);}

  // A cleared conversation is hidden from the list, but must remain openable from Contacts.
  const selected = conversations.map(c => ({
    ...c,
    other: profiles.find(p => p.id === (c.user_a === user?.id ? c.user_b : c.user_a)),
    last: latest[c.id], count: unread[c.id] || 0,
  })).find(c => c.id === activeChat);

// CONNECT_PWA_CONTACT_PROFILE_WARM_V3_20261111
// Warm the open conversation partner, or the profile currently being viewed.
// Never fetch other contacts in bulk or run during a call.
useEffect(()=>{
  if(!supabase||!user?.id)return;
  const peer=profileView&&profileView!==user.id?profileView:selected?.other?.id;
  if(!peer||peer===user.id||document.visibilityState!=='visible')return;
  if(selected?.other?.id===peer&&selected.other.is_blocked)return;
  let cancelled=false;
  const timer=window.setTimeout(()=>{
    if(cancelled||document.visibilityState!=='visible')return;
    void warmPeerProfileLibraries(supabase,user.id,peer,mediaUrl);
  },1150);
  return()=>{cancelled=true;window.clearTimeout(timer);};
},[user?.id,activeChat,profileView,selected?.other?.id]);
const currentName = selected?.other?.display_name || 'Собеседник';
  const peerPresence = selected?.other ? presence[selected.other.id] : undefined;
  const activityText:Record<string,string>={typing:'Печатает…',voice:'Записывает голосовое…',video:'Записывает видео…',sticker:'Выбирает стикер…',file:'Выбирает файл…'};
  const activePeerKind=visiblePeerActivity(peerActivity,activeChat,Date.now());
  const peerStatus = activePeerKind?activityText[activePeerKind]||formatPresence(peerPresence,clock):peerRecording?'Записывает голосовое…':typing?'Печатает…':formatPresence(peerPresence,clock);
  const currentPeerState=activeChat?peerStates[activeChat]:undefined;
  useEffect(()=>{setConversation(selected?.other&&user?{conversationId:selected.id,peerId:selected.other.id,peerName:selected.other.display_name}:null);},[user?.id,selected?.id,selected?.other?.id,selected?.other?.display_name,setConversation]);
  const filteredChats = chats.filter(c => (c.other?.display_name || '').toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU')));
  useEffect(()=>{if(chatSearchOpen&&chatQuery.trim()&&searchMatches.length){const match=searchMatches[Math.min(searchPosition,searchMatches.length-1)];requestAnimationFrame(()=>document.getElementById('msg-'+match.id)?.scrollIntoView({behavior:'smooth',block:'center'}));}},[chatQuery,chatSearchOpen,searchMatches.length]);
  const filteredContacts = contacts.filter(p => p.display_name.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU')));
  const unreadTotal = Object.values(unread).reduce((sum, n) => sum + n, 0);


  // CONNECT_PWA_HOME_ICON_BADGE_V1 — authoritative foreground reconciliation.
  const [badgeCalls,setBadgeCalls]=useState<{userId:string;count:number;latest:string}>({userId:'',count:0,latest:''});
  useEffect(()=>{
    const listener=(event:Event)=>{
      const item=(event as CustomEvent<{userId:string;count:number;latest:string}>).detail;
      if(!item?.userId||item.userId!==user?.id)return;
      const count=Math.min(9999,Math.max(0,Math.floor(Number(item.count)||0)));
      const latest=typeof item.latest==='string'?item.latest:'';
      setBadgeCalls(prev=>prev.userId===item.userId&&prev.count===count&&prev.latest===latest?prev:{userId:item.userId,count,latest});
    };
    window.addEventListener('connect:badge:missed',listener);
    return()=>window.removeEventListener('connect:badge:missed',listener);
  },[user?.id]);
  // Include chats already read: their last known message time prevents a delayed push
  // from turning a cleared badge back on.
  const badgeMessages=useMemo(()=>Object.fromEntries(
    [...new Set([...Object.keys(latest),...Object.keys(unread)])].map(id=>[id,Math.max(0,unread[id]||0)])
  ),[unread,latest]);
  const badgeMessageLatest=useMemo(()=>Object.fromEntries(Object.keys(badgeMessages).map(id=>[id,latest[id]?.created_at||''])),[badgeMessages,latest]);
  const badgeSignature=JSON.stringify({chats:badgeMessages,latest:badgeMessageLatest});
  useEffect(()=>{
    if(window.ConnectAndroid)return;
    const userId=user?.id||'';
    const calls=badgeCalls.userId===userId?badgeCalls.count:0;
    const count=userId?Math.min(9999,unreadTotal+calls):0;
    const nav=navigator as Navigator&{setAppBadge?:(n:number)=>Promise<void>;clearAppBadge?:()=>Promise<void>};
    // The browser displays the badge only when installed/permissioned; no extra prompt.
    if(count>0)void nav.setAppBadge?.(count).catch(()=>{});
    else if(nav.clearAppBadge)void nav.clearAppBadge().catch(()=>{});
    else void nav.setAppBadge?.(0).catch(()=>{});
    if(!('serviceWorker'in navigator))return;
    const snapshot={type:'CONNECT_BADGE_SNAPSHOT',userId,
      chats:userId?badgeMessages:{},latest:userId?badgeMessageLatest:{},
      missed:calls,callsLatest:badgeCalls.userId===userId?badgeCalls.latest:''};
    const send=(worker:ServiceWorker|null|undefined)=>worker?.postMessage(snapshot);
    if(navigator.serviceWorker.controller)send(navigator.serviceWorker.controller);
    else void navigator.serviceWorker.ready.then(reg=>send(reg.active)).catch(()=>{});
  },[user?.id,unreadTotal,badgeSignature,badgeCalls.userId,badgeCalls.count,badgeCalls.latest]);
  function clearConversation(id: string) {
    if (!user || !window.confirm('Очистить переписку только на этом устройстве? У собеседника сообщения останутся.')) return;
    const next={...clearedChats,[id]:new Date().toISOString()};
    setClearedChats(next);
    try { localStorage.setItem('connect-cleared-chats:'+user.id,JSON.stringify(next)); } catch {}
    if (activeChat===id) exitChat();
    setNotice('Переписка скрыта на этом устройстве');
  }
  function enterChat(id: string) { sessionScope.setChat(id); setPeerActivity(null);setTyping(false);setPeerRecording(false);setFilePickerOpen(false);setVideoNoteRecording(false);setChatDisplayReady(user?.id&&(warmedChatWindows.current.get(user.id+":"+id)||0)>Date.now()?id:null); resetChatTools(); setListActions(null); setActiveChat(id); setTab('chats'); setSearch(''); setReplyTo(null); setEditing(null); setMenuMessage(null); }
  useEffect(() => {
    function openFromAndroid() {
      const chatId=window.__connectAndroidPendingChat;
      if(!chatId || !conversations.some(c=>c.id===chatId)) return;
      delete window.__connectAndroidPendingChat;
      enterChat(chatId);
    }
    window.addEventListener('connect:android-open-chat',openFromAndroid);
    openFromAndroid();
    return ()=>window.removeEventListener('connect:android-open-chat',openFromAndroid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[conversations,user?.id]);
  function exitChat() { sessionScope.setChat(null); setFilePickerOpen(false);setVideoNoteRecording(false);setPeerActivity(null);setPeerRecording(false);captureChatAnchor(); flushVisibleRead(); resetChatTools(); setActiveChat(null); setReplyTo(null); setEditing(null); setMenuMessage(null); setTyping(false); }
  usePushNavigation(user?.id||null,conversations.map(chat=>chat.id),directoryReady,enterChat);
  function switchTab(t: Tab) { setSettingsPage('home'); setFilePickerOpen(false);setStickerPicker(false); setTab(t); setSearch(''); setNotice(''); setProfileView(null); setProfileMediaOpen(null); }
  // Keep one in-memory navigation stack. Swipe restoration must not create new entries.
  useEffect(() => {
    const history = gestureHistory.current;
    if(!user?.id) { history.owner='';history.entries=[];history.cursor=-1;history.restoring=false;return; }
    if(history.owner!==user.id) { history.owner=user.id;history.entries=[];history.cursor=-1;history.restoring=false; }
    const view:ConnectGestureView={tab,chat:activeChat,profile:profileView,media:profileMediaOpen,settings:settingsPage};
    if(history.restoring) { history.restoring=false;return; }
    const same=(a:ConnectGestureView|undefined,b:ConnectGestureView)=>Boolean(a && a.tab===b.tab && a.chat===b.chat && a.profile===b.profile && a.media===b.media && a.settings===b.settings);
    if(same(history.entries[history.cursor],view))return;
    // Native back buttons and bottom tabs must move the cursor too, not push duplicate screens.
    if(same(history.entries[history.cursor-1],view)){history.cursor--;return;}
    if(same(history.entries[history.cursor+1],view)){history.cursor++;return;}
    history.entries=[...history.entries.slice(0,history.cursor+1),view].slice(-24);
    history.cursor=history.entries.length-1;
  },[user?.id,tab,activeChat,profileView,profileMediaOpen,settingsPage]);

  useEffect(() => {
    if(!user?.id || isNativeMediaRuntime())return;
    const shell=shellRef.current;
    if(!shell)return;
    // CONNECT_PWA_LIST_PARITY_GESTURE_V1_20261114: PWA-only layout, never Android WebView.
    shell.setAttribute('data-connect-pwa-list-parity','true');
    let started:{x:number;y:number;edge:'back'|'forward'}|null=null;
    function start(e: Event){
      started=null;
      // This is a DOM listener, not the React TouchEvent imported for message gestures.
      const touches=(e as Event & {touches:TouchList}).touches;
      if(touches.length!==1 || crop || mediaViewer || videoNoteOpen || !!menuMessage || !!forwardIds.length || selectionMode || stickerPicker || chatSearchOpen || chatActions)return;
      if(document.querySelector('.connect-call-backdrop,.connect-call-history-screen'))return;
      // A root tab never starts swipe navigation, even away from the bottom dock.
      const currentView=gestureHistory.current.entries[gestureHistory.current.cursor];
      if(!currentView || (!currentView.chat && !currentView.profile && !currentView.media && currentView.settings==='home'))return;
      const target=e.target;
      // Keep the entire bottom navigation dock outside swipe history, even near screen edges.
      if(target instanceof Element && target.closest('.bottom-nav,.nav-tab,.connect-calls-tab'))return;
      const dock=shell!.querySelector<HTMLElement>('.bottom-nav');
      if(dock && touches[0].clientY>=dock.getBoundingClientRect().top-12)return;
      if(target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"],.bubble,.context-overlay,.sticker-picker,.connect-vnote-backdrop,.connect-media-overlay'))return;
      const rect=shell!.getBoundingClientRect(),x=touches[0].clientX,y=touches[0].clientY;
      if(x>=rect.left && x<=rect.left+28)started={x,y,edge:'back'};
      else if(x<=rect.right && x>=rect.right-28)started={x,y,edge:'forward'};
    }
    function end(e: Event){
      const changedTouches=(e as Event & {changedTouches:TouchList}).changedTouches;
      if(!started || changedTouches.length!==1)return;
      const origin=started;started=null;
      // Do not navigate if a gesture ends on or within the bottom dock's hit zone.
      const dock=shell!.querySelector<HTMLElement>('.bottom-nav');
      if((e.target instanceof Element && e.target.closest('.bottom-nav,.nav-tab,.connect-calls-tab')) ||
        (dock && changedTouches[0].clientY>=dock.getBoundingClientRect().top-12))return;
      const dx=changedTouches[0].clientX-origin.x,dy=changedTouches[0].clientY-origin.y;
      const direction=connectSwipeDirection(origin.edge,dx,dy);
      if(!direction)return;
      const history=gestureHistory.current,step=history.cursor+direction;
      if(step<0||step>=history.entries.length)return;
      const target=history.entries[step];
      if(target.chat && !conversations.some(c=>c.id===target.chat))return;
      if(target.profile && !profiles.some(p=>p.id===target.profile))return;
      if(!connectAllowHistorySwipe(history.entries[history.cursor],target,direction))return;
      e.preventDefault();
      history.cursor=step;
      history.restoring=true;
      if(activeChat && target.chat!==activeChat)exitChat();
      if(target.chat && target.chat!==activeChat)enterChat(target.chat);
      if(!target.chat)setActiveChat(null);
      if(target.profile)showProfile(target.profile);
      else {setProfileView(null);setProfileMediaOpen(null);}
      setProfileMediaOpen(target.media);
      setTab(target.tab);setSettingsPage(target.settings);setSearch('');setListActions(null);setStickerPicker(false);
    }
    function cancel(){started=null;}
    shell.addEventListener('touchstart',start,{passive:true});
    shell.addEventListener('touchend',end,{passive:false});
    shell.addEventListener('touchcancel',cancel,{passive:true});
    return()=>{shell.removeEventListener('touchstart',start);shell.removeEventListener('touchend',end);shell.removeEventListener('touchcancel',cancel);};
  },[user?.id,tab,activeChat,profileView,profileMediaOpen,settingsPage,crop,mediaViewer,videoNoteOpen,menuMessage,forwardIds.length,selectionMode,stickerPicker,chatSearchOpen,chatActions,conversations,profiles]);

  async function openContact(p: Profile) {
    if (!supabase || !user || busy) return;
    const operation=sessionScope.capture();if(operation.userId!==user.id)return;
    setBusy(true); setNotice('');
    let chat = conversations.find(c => (c.user_a === user.id && c.user_b === p.id) || (c.user_b === user.id && c.user_a === p.id));
    if (!chat) {
      const [a, b] = [user.id, p.id].sort();
      const { data, error } = await supabase.from('conversations').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b' }).select('id,user_a,user_b,created_at').single();
      if(!sessionScope.current(operation))return;
      if (error || !data) { setBusy(false); setNotice('Не удалось открыть чат: ' + (error?.message || 'Ошибка')); return; }
      chat = data as Conversation; setConversations(prev => [chat!, ...prev.filter(c => c.id !== chat!.id)]);
    }
    setBusy(false); enterChat(chat.id);
  }

  function startReply(m: Message) { setReplyTo(m); setEditing(null); setMenuMessage(null); inputRef.current?.focus(); }
  function startEdit(m: Message) { setEditing(m); setReplyTo(null); setDraft(m.body); setMenuMessage(null); inputRef.current?.focus(); }
  function cancelCompose() { setEditing(null); setReplyTo(null); setDraft(''); }
  async function copyText(m: Message) {
    try {
      if(window.ConnectNative)await window.ConnectNative.request('clipboard',{text:m.body});
      else await navigator.clipboard.writeText(m.body);
      setNotice('Текст скопирован');
    }
    catch { setNotice('Не удалось скопировать текст'); }
    setMenuMessage(null);
  }
  async function deleteMessage(m: Message) {
    if (!supabase || !user || busy || m.sender_id !== user.id || m.deleted_at) return;
    setMenuMessage(null);
    if (!window.confirm('Удалить это сообщение у обоих участников?')) return;
    setBusy(true);
    const { error } = await eraseMessage(m);
    setBusy(false);
    if (error) { setNotice('Не удалось удалить: ' + error.message); return; }
    setMessages(prev => prev.filter(x => x.id !== m.id));
  }
  const optimisticSend=useRef<{id:string;chat:string;body:string;reply:string|null;at:string}|null>(null);
  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user || !activeChat || !draft.trim() || busy) return;
    const body=draft.trim(),chat=activeChat,reply=replyTo?.id||null;
    const operation=sessionScope.capture(chat),ownerOperation=sessionScope.capture();
    if(operation.userId!==user.id||!sessionScope.current(operation))return;
    setBusy(true);setNotice('');
    if(editing){
      const {error}=await supabase.from('messages').update({body}).eq('id',editing.id).eq('sender_id',user.id);
      if(!sessionScope.current(ownerOperation))return;
      setBusy(false);if(!sessionScope.current(operation))return;
      if(error){setNotice('Не удалось изменить: '+error.message);return;}
      setMessages(prev=>prev.map(m=>m.id===editing.id?{...m,body,edited_at:new Date().toISOString()}:m));
      cancelCompose();return;
    }
    const messageId=crypto.randomUUID(),tempId='local-'+messageId,at=new Date().toISOString();
    optimisticSend.current={id:tempId,chat,body,reply,at};
    const optimistic:Message={id:tempId,conversation_id:chat,sender_id:user.id,body,created_at:at,
      edited_at:null,deleted_at:null,reply_to:reply,attachment_path:null,attachment_name:null,
      attachment_type:null,attachment_size:null,attachment_kind:null};
    setMessages(prev=>[...prev,optimistic].sort(compareChatMessages));
    setDraft('');setReplyTo(null);lastKeypress.current=0;void updateTyping(chat,false);
    requestAnimationFrame(()=>{const el=scrollRef.current;if(el&&activeChat===chat)el.scrollTop=el.scrollHeight;});
    const {data,error,pending}=await deliverMessage(supabase,{id:messageId,conversation_id:chat,sender_id:user.id,body,reply_to:reply});
    if(!sessionScope.current(ownerOperation))return;
    setBusy(false);
    if(pending){if(sessionScope.current(operation))setNotice('Сообщение сохранено и ожидает соединения');return;}
    if(error||!data){
      setMessages(prev=>prev.filter(m=>m.id!==tempId));
      if(sessionScope.current(operation)){setDraft(current=>current||body);setReplyTo(current=>current||replyTo);}
      if(sessionScope.current(operation))setNotice('Не удалось отправить: '+(error?.message||'Ошибка'));
      if(optimisticSend.current?.id===tempId)optimisticSend.current=null;
      return;
    }
    const m=data as Message;
    if(optimisticSend.current?.id===tempId)optimisticSend.current=null;
    if(sessionScope.current(operation))setMessages(prev=>{
      const without=prev.filter(x=>x.id!==tempId);
      return without.some(x=>x.id===m.id)?without:[...without,m].sort(compareChatMessages);
    });
    setLatest(prev=>({...prev,[chat]:m}));
  }


  useEffect(()=>{
    if(!supabase||!user)return;
    const ticket=sessionScope.capture();let running=false;
    const retry=async()=>{if(running||document.visibilityState==='hidden'||!sessionScope.current(ticket))return;running=true;
      try{await retryMessageOutbox(supabase,user.id,row=>{if(!sessionScope.current(ticket))return;const m=row as Message;setLatest(prev=>({...prev,[m.conversation_id]:m}));if(activeChatRef.current===m.conversation_id)setMessages(prev=>[...prev.filter(x=>x.id!==m.id&&x.id!=='local-'+m.id),m].sort(compareChatMessages));});}catch{}finally{running=false;}};
    const timer=setInterval(()=>{void retry();},15000);window.addEventListener('online',retry);void retry();
    return()=>{clearInterval(timer);window.removeEventListener('online',retry);};
  },[user?.id]);

  // CONNECT_PWA_CHAT_MEDIA_ENTRY_V2
  useEffect(() => {
    if(!supabase||!user)return;
    let cancelled=false;
    const client=supabase,viewer=user.id;
    // Android also needs progressive, bounded signing for large audio-heavy chats.
    if(isNativeMediaRuntime()){
      const selected=messages.filter(m=>!m.deleted_at&&(!activeChat||m.conversation_id===activeChat));
      const paths=Array.from(new Set([...selected].reverse().flatMap(m=>[...(m.attachment_path?[m.attachment_path]:[]),...parseAlbum(m.body).map(x=>x.path)])));
      const missing=paths.filter(path=>!attachmentUrls[path]);
      let cursor=0, audioWarm=0;
      const worker=async()=>{
        while(!cancelled&&cursor<missing.length){
          const path=missing[cursor++];
          const meta=selected.find(m=>m.attachment_path===path);
          const identity='/storage/v1/object/sign/connect-attachments/'+path;
          try {
            const local=await resolveCachedMedia(identity,viewer).catch(()=>identity);
            let url=local.startsWith('blob:')?local:'';
            if(!url){
              const {data}=await client.storage.from('connect-attachments').createSignedUrl(path,3600);
              url=data?.signedUrl?mediaUrl(data.signedUrl):'';
            }
            if(!url||cancelled)continue;
            setAttachmentUrls(prev=>prev[path]?prev:{...prev,[path]:url});
            if(meta?.attachment_kind==='audio'&&meta.attachment_size&&meta.attachment_size<=1024*1024&&audioWarm++<2)
              void prefetchChatAudio(url,viewer,meta.attachment_size);
          }catch{/* One failed attachment must not block the rest. */}
        }
      };
      void Promise.all(Array.from({length:Math.min(4,missing.length)},()=>worker())).catch(()=>{});
      return()=>{cancelled=true;};
    }
    if(!activeChat||historyReadyChat!==activeChat)return;
    const chatId=activeChat;
    // Newest first. UI can open while older attachments continue preparing.
    const entries=[...new Map(messages.filter(m=>m.conversation_id===chatId&&!m.deleted_at&&!serverDeleted.current.has(m.id))
      .flatMap(m=>[
        ...(m.attachment_path?[{path:m.attachment_path,kind:m.attachment_kind||'file',size:m.attachment_size||0}]:[]),
        ...parseAlbum(m.body).map(x=>({path:x.path,kind:x.kind,size:0}))
      ]).filter(item=>Boolean(item.path)).map(item=>[item.path,item] as const)).values()].reverse();
    // Set readiness as soon as the recent set is prepared; outer timer is a hard cap.
    let offset=0,recentLeft=Math.min(10,entries.length);
    if(!recentLeft)setChatDisplayReady(chatId);
    const worker=async()=>{
      while(!cancelled&&offset<entries.length){
        const index=offset++,item=entries[index],path=item.path;
        try{
          const identity='/storage/v1/object/sign/connect-attachments/'+path;
          const cached=await resolveCachedMedia(identity,viewer);
          const previous=attachmentUrls[path];
          let url=cached.startsWith('blob:')?cached:(previous&&(previous.startsWith('blob:')||(signedMediaLifetimes.current.get(path)||0)>Date.now()+60000)?previous:'');
          if(!url){
            const {data,error}=await client.storage.from('connect-attachments').createSignedUrl(path,3600);
            if(!error&&data?.signedUrl){url=mediaUrl(data.signedUrl);signedMediaLifetimes.current.set(path,Date.now()+48*60*1000);}
          }
          if(!url)continue;
          if(!cancelled)setAttachmentUrls(prev=>prev[path]===url?prev:{...prev,[path]:url});
          if(item.kind==='image'&&supportsPhotoPreview(path)){
            const thumb=photoPreviewPath(path),thumbIdentity='/storage/v1/object/sign/connect-attachments/'+thumb;
            let local=await resolveCachedMedia(thumbIdentity,viewer);
            if(!local.startsWith('blob:')){
              const signed=await client.storage.from('connect-attachments').createSignedUrl(thumb,3600);
              if(signed.data?.signedUrl){const thumbUrl=mediaUrl(signed.data.signedUrl);
                await prefetchCachedMedia(thumbUrl,viewer);
                const hydrated=await resolveCachedMedia(thumbIdentity,viewer);
                local=hydrated.startsWith('blob:')?hydrated:thumbUrl;
              }else local='';
            }
            if(!cancelled)setPhotoPreviews(prev=>prev[path]=== (local||null)?prev:{...prev,[path]:local||null});
          }
          if(item.kind==='video')await cachedChatPoster(path).catch(()=>null);
           if(item.kind==='audio'&&index<4&&item.size>0&&item.size<=1024*1024)
             void prefetchChatAudio(url,viewer,item.size);
        }catch{/* Never let a failed attachment block message navigation. */}
        finally{
          if(index<10&&--recentLeft===0&&!cancelled){
            warmedChatWindows.current.set(viewer+':'+chatId,Date.now()+42*60*1000);
            setChatDisplayReady(chatId);
          }
        }
      }
    };
    void Promise.all(Array.from({length:Math.min(3,entries.length)},()=>worker())).catch(()=>{});
    return()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeChat,historyReadyChat,messages,user?.id]);

  useEffect(()=>{
    if(!supabase||!user)return;
    const owner=user.id;
    const paths=[...new Set(messages.filter(m=>m.conversation_id===activeChat).flatMap(m=>[
      ...(m.attachment_kind==='image'&&m.attachment_path?[m.attachment_path]:[]),
      ...parseAlbum(m.body).filter(x=>x.kind==='image').map(x=>x.path)
    ]).filter(supportsPhotoPreview))].filter(path=>
      !photoPreviewRequests.current.has(path)&&!photoPreviewRetryTimers.current.has(path)&&
      (photoPreviewAttempts.current.get(path)||0)<3);
    if(!paths.length)return;
    paths.forEach(path=>{
      photoPreviewRequests.current.add(path);
      photoPreviewAttempts.current.set(path,(photoPreviewAttempts.current.get(path)||0)+1);
    });
    void Promise.all(paths.map(async path=>{
      try{
        const previewPath=photoPreviewPath(path),identity='/storage/v1/object/sign/connect-attachments/'+previewPath;
        const local=await resolveCachedMedia(identity,owner);
        if(local.startsWith('blob:'))return {path,url:local};
        const {data,error}=await supabase!.storage.from('connect-attachments').createSignedUrl(previewPath,3600);
        if(error||!data?.signedUrl)return {path,url:null};
        const signed=mediaUrl(data.signedUrl);
        void prefetchCachedMedia(signed,owner);
        return {path,url:signed};
      }catch{return {path,url:null};}
    })).then(items=>{if(activePreviewUser.current===owner){setPhotoPreviews(prev=>{const next={...prev};for(const item of items)next[item.path]=item.url;return next;});for(const item of items)if(!item.url)retryPhotoPreview(item.path);}});
  },[messages,activeChat,user?.id,photoPreviewRetry]);
  useEffect(()=>{
    photoPreviewRequests.current.clear();photoPreviewAttempts.current.clear();
    for(const timer of photoPreviewRetryTimers.current.values())window.clearTimeout(timer);
    photoPreviewRetryTimers.current.clear();setPhotoPreviews({});
  },[user?.id]);
  useEffect(()=>{
    const online=()=>{photoPreviewRequests.current.clear();photoPreviewAttempts.current.clear();setPhotoPreviewRetry(v=>v+1);};
    window.addEventListener('online',online);return()=>window.removeEventListener('online',online);
  },[]);

  // Warm avatars and small thumbnails even while viewing the chat list.
  // Small original photos are prefetched only on unconstrained connections.
  useEffect(()=>{
    if(!user?.id)return;
    const owner=user.id;
    const connection=(navigator as Navigator & {connection?:{saveData?:boolean;effectiveType?:string}}).connection;
    if(connection?.saveData||connection?.effectiveType==='2g')return;
    const previews=activeChat?messages.filter(m=>m.conversation_id===activeChat).slice(-35).flatMap(m=>[
      ...(m.attachment_kind==='image'&&m.attachment_path?[m.attachment_path]:[]),
      ...parseAlbum(m.body).filter(x=>x.kind==='image').map(x=>x.path)
    ]):[];
    const urls=[...new Set([...Object.values(avatarUrls),...previews.map(p=>photoPreviews[p]).filter((v):v is string=>typeof v==='string')])].filter(Boolean).slice(0,56);
    const small=activeChat?messages.filter(m=>m.conversation_id===activeChat&&m.attachment_kind==='image'&&m.attachment_path&&m.attachment_size&&m.attachment_size<=6*1024**2).slice(-6).map(m=>attachmentUrls[m.attachment_path!]).filter((v):v is string=>!!v):[];
    let stopped=false;
    const timer=window.setTimeout(()=>{void(async()=>{
      for(const src of urls){if(stopped||activePreviewUser.current!==owner)break;await prefetchCachedMedia(src,owner);}
      if(connection?.effectiveType==='3g')return;
      for(const src of small){if(stopped||activePreviewUser.current!==owner)break;await prefetchCachedMedia(src,owner,true);}
    })();},200);
    return()=>{stopped=true;window.clearTimeout(timer);};
  },[user?.id,activeChat,photoPreviews,avatarUrls,messages,attachmentUrls]);

  function isKeyboardSticker(m: Message): boolean {
    return m.attachment_kind === 'image' && /^sticker-\d+\.(png|webp|gif|jpe?g)$/i.test(m.attachment_name || '');
  }

  // Connect iOS sticker favorites v1: save a private durable copy, not a temporary photo link.
  async function saveKeyboardStickerFavorite(m: Message) {
    if (!supabase || !user || !m.attachment_path || !isKeyboardSticker(m) || busy) return;
    setMenuMessage(null);
    setBusy(true);
    let storedPath: string | null = null;
    try {
      const source = await supabase.storage.from('connect-attachments').download(m.attachment_path);
      if (source.error || !source.data) throw new Error(source.error?.message || 'Файл недоступен');
      let imageBlob: Blob = await prepareStickerFile(new File(
        [source.data],m.attachment_name||'sticker.png',
        {type:(m.attachment_type||source.data.type||'image/png').toLowerCase()}
      ),convertStickerOnServer);
      const mime=imageBlob.type;
      const hash = await crypto.subtle.digest('SHA-256', await imageBlob.arrayBuffer());
      const fingerprint = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('').slice(0, 48);
      const name = 'iOS-' + fingerprint;
      let pack = customPacks.find(item => item.owner_id === user.id && item.name === IOS_FAVORITE_PACK);
      if (!pack) {
        const existing = await supabase.from('connect_sticker_packs')
          .select('id,name,emoji,owner_id,is_public,created_at')
          .eq('owner_id', user.id).eq('name', IOS_FAVORITE_PACK).maybeSingle();
        if (existing.error) throw existing.error;
        if (existing.data) pack = existing.data as CustomPack;
        else {
          const created = await supabase.from('connect_sticker_packs')
            .insert({name:IOS_FAVORITE_PACK,emoji:'⭐',owner_id:user.id,is_public:false})
            .select('id,name,emoji,owner_id,is_public,created_at').single();
          if (created.error || !created.data) throw created.error || new Error('Не удалось создать избранное');
          pack = created.data as CustomPack;
        }
      }
      const duplicate = await supabase.from('connect_stickers').select('id')
        .eq('pack_id', pack.id).eq('name', name).limit(1);
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data?.length) {
        setNotice('Этот стикер уже в избранном');
        await loadCustomStickers();
        return;
      }
      const ext = mime === 'image/gif' ? 'gif' : mime === 'image/webp' ? 'webp' : 'png';
      storedPath = `${user.id}/${pack.id}/${crypto.randomUUID()}.${ext}`;
      const uploaded = await supabase.storage.from('connect-stickers')
        .upload(storedPath, imageBlob, {contentType:mime,upsert:false});
      if (uploaded.error) throw uploaded.error;
      const inserted = await supabase.from('connect_stickers')
        .insert({pack_id:pack.id,name,storage_path:storedPath});
      if (inserted.error) throw inserted.error;
      storedPath = null;
      await loadCustomStickers();
      setNotice('Стикер добавлен в избранное');
    } catch (error) {
      if (storedPath) await supabase.storage.from('connect-stickers').remove([storedPath]);
      setNotice('Не удалось сохранить стикер: ' + (error instanceof Error ? error.message : String(error)));
    } finally { setBusy(false); }
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
      for(const file of docs){if(!await sendAttachment(file))break;setPendingFiles(prev=>prev.filter(item=>item!==file));}
      return;
    }
    if(media.length===1){if(await sendAttachment(media[0]))setPendingFiles(prev=>prev.filter(item=>item!==media[0]));return}
    await sendAlbum(media);
  }
  async function sendAlbum(files:File[]){return submitAttachments(files);}
  async function sendAttachment(file:File,kindOverride?:'audio'){return submitAttachments([file],kindOverride);}
  async function submitAttachments(files:File[],kindOverride?:'audio'){
    if(!supabase||!user||!activeChat||busy)return false;
    if(!files.length||files.some(file=>file.size<1||file.size>100*1024**2)){setNotice('Максимальный размер файла — 100 МБ');return false;}
    const chat=activeChat,operation=sessionScope.capture(chat),ownerOperation=sessionScope.capture();
    if(operation.userId!==user.id||!sessionScope.current(operation))return false;
    setBusy(true);setUploadProgress(0);setNotice('');
    try{
      const result=await deliverAttachments(supabase,user.id,chat,files,replyTo?.id||null,value=>{if(sessionScope.current(operation))setUploadProgress(value);},kindOverride);
      if(!sessionScope.current(ownerOperation))return true;
      if(result.data){const m=result.data as Message;setLatest(prev=>({...prev,[chat]:m}));if(sessionScope.current(operation))setMessages(prev=>prev.some(x=>x.id===m.id)?prev:[...prev,m]);}
      if(sessionScope.current(operation)){
        if(result.pending)setNotice('Вложение сохранено и ожидает соединения');
        setReplyTo(null);setPendingFiles(prev=>prev.filter(file=>!files.includes(file)));
        setAttachmentUrls(prev=>({...prev,...result.urls}));
        requestAnimationFrame(()=>{if(sessionScope.current(operation)&&scrollRef.current)scrollRef.current.scrollTop=scrollRef.current.scrollHeight;});
      }
      return true;
    }catch(error){if(sessionScope.current(operation))setNotice('Не удалось отправить вложение: '+(error instanceof Error?error.message:String(error)));return false;}
    finally{if(sessionScope.current(ownerOperation))setBusy(false);if(sessionScope.current(operation))setUploadProgress(null);}
  }
  async function beginRecording() {
    if(window.ConnectNative){
      if(!activeChat||recording||recordingFinalizing.current)return;
      recordingFinalizing.current=true;
      const chat=activeChat,operation=sessionScope.capture(activeChat);
      try{
        await window.ConnectNative.request('recordVoice:start');
        if(!sessionScope.current(operation)){await window.ConnectNative.request('recordVoice:cancel');return;}
        recordingChat.current=chat;recordingStarted.current=performance.now();setRecording(true);setRecordSeconds(0);
        void updateRecording(activeChat,true);
        recordInterval.current=window.setInterval(()=>{setRecordSeconds(Math.floor((performance.now()-recordingStarted.current)/1000));const chat=recordingChat.current;if(chat)void updateRecording(chat,true);},1000);
      }catch(e){if(sessionScope.current(operation))setNotice(e instanceof Error?e.message:'Не удалось включить микрофон');}
      finally{if(sessionScope.current(operation))recordingFinalizing.current=false;}
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined') {
      setNotice('Запись звука недоступна в этом браузере');return;
    }
    if (!activeChat || recording || recordingFinalizing.current) return;
    recordingFinalizing.current=true;
    const operation=sessionScope.capture(activeChat);
    let stream:MediaStream|null=null;
    try {
      stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!sessionScope.current(operation)){stream.getTracks().forEach(track=>track.stop());return;}
      // Android WebView records/plays Opus in WebM more reliably than MP4 audio.
      const formats=window.ConnectAndroid
        ? ['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4']
        : ['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'];
      const mime=formats.find(x=>MediaRecorder.isTypeSupported(x));
      const recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),...(!isNativeMediaRuntime()?{audioBitsPerSecond:56000}:{})});
      const recordedChunks:Blob[]=[];
      audioChunks.current=recordedChunks;recordingStream.current=stream;mediaRecorder.current=recorder;
      recordingChat.current=activeChat;recordingStarted.current=performance.now();
      let failed=false;let sendOnStop=true;
      recorder.ondataavailable=e=>{if(e.data.size>0)recordedChunks.push(e.data);};
      recorder.onerror=()=>{failed=true;setNotice('Ошибка записи аудио. Попробуйте ещё раз.');};
      recorder.onstop=()=>{
        const chunks=recordedChunks;
        const durationMs=performance.now()-recordingStarted.current;
        const chat=recordingChat.current;
        const type=recorder.mimeType || mime || 'audio/webm';
        const blob=new Blob(chunks,{type});
        stream?.getTracks().forEach(track=>track.stop());
        if(mediaRecorder.current!==recorder)return;
        recordingStream.current=null;mediaRecorder.current=null;recordingChat.current=null;
        recordingFinalizing.current=false;recordingSend.current=null;
        if(recordInterval.current!==null)window.clearInterval(recordInterval.current);
        recordInterval.current=null;setRecording(false);setRecordSeconds(0);
        if(chat)void updateRecording(chat,false);
        if(!sendOnStop||!sessionScope.current(operation))return;
        if(failed || blob.size<1000 || durationMs<700){
          setNotice('Голосовое не записалось полностью. Попробуйте ещё раз.');return;
        }
        const ext=type.includes('mp4')?'m4a':type.includes('ogg')?'ogg':'webm';
        void sendAttachment(new File([blob],`Голосовое-${Date.now()}.${ext}`,{type}),'audio');
      };
      recorder.onstart=()=>{recordingStarted.current=performance.now();setRecording(true);setRecordSeconds(0);};
      recorder.start(250);
      void updateRecording(activeChat,true);
      recordInterval.current=window.setInterval(()=>{
        setRecordSeconds(Math.floor((performance.now()-recordingStarted.current)/1000));
        const chat=recordingChat.current;if(chat)void updateRecording(chat,true);
      },250);
      recordingSend.current=(send:boolean)=>{sendOnStop=send;};
    } catch(e){
      stream?.getTracks().forEach(track=>track.stop());
      recordingFinalizing.current=false;
      if(sessionScope.current(operation))setNotice('Не удалось включить микрофон: '+(e instanceof Error?e.message:String(e)));
    } finally {if(sessionScope.current(operation))recordingFinalizing.current=false;}
  }
  function finishRecording(send:boolean) {
    if(window.ConnectNative){
      if(recordingFinalizing.current)return;
      recordingFinalizing.current=true;
      const chat=recordingChat.current,operation=sessionScope.capture(recordingChat.current);
      void window.ConnectNative.request('recordVoice:stop',{send}).then((file:File|null)=>{if(file&&sessionScope.current(operation))void sendAttachment(file,'audio');})
        .catch(e=>setNotice(e instanceof Error?e.message:'Не удалось завершить запись'))
        .finally(()=>{if(!sessionScope.current(operation))return;recordingFinalizing.current=false;recordingChat.current=null;setRecording(false);setRecordSeconds(0);if(recordInterval.current!==null)clearInterval(recordInterval.current);recordInterval.current=null;if(chat)void updateRecording(chat,false);});
      return;
    }
    const recorder=mediaRecorder.current;
    if(!recorder || recorder.state==='inactive' || recordingFinalizing.current)return;
    recordingFinalizing.current=true;recordingSend.current?.(send);
    try{recorder.stop();}catch(e){
      recordingFinalizing.current=false;
      setNotice('Не удалось завершить запись: '+(e instanceof Error?e.message:String(e)));
    }
  }
  async function openNativeVideoNote(){
    if(!window.ConnectNative){setVideoNoteOpen(true);return;}
    const chat=activeChat,operation=sessionScope.capture(activeChat);
    if(chat)void updateActivity(chat,'video');
    const pulse=setInterval(()=>{if(!sessionScope.current(operation)){clearInterval(pulse);return;}if(chat)void updateActivity(chat,'video');},4000);
    const release=sessionScope.onReset(()=>clearInterval(pulse));
    try{const file:File|null=await window.ConnectNative.request('recordVideo:open');if(file&&sessionScope.current(operation))await sendAttachment(file);}
    catch(e){if(sessionScope.current(operation))setNotice(e instanceof Error?e.message:'Не удалось записать видеокружок');}
    finally{release();clearInterval(pulse);if(chat&&sessionScope.current(operation))void updateActivity(chat,null);}
  }
  useEffect(()=>{
    const stopped=(event:Event)=>{const state=(event as CustomEvent).detail;if(state?.kind!=='voice'||state.recording)return;const chat=recordingChat.current;if(recordInterval.current!==null)clearInterval(recordInterval.current);recordInterval.current=null;setRecording(false);setRecordSeconds(0);if(chat)void updateRecording(chat,false);};
    window.addEventListener('connect:native-recording',stopped);
    return()=>window.removeEventListener('connect:native-recording',stopped);
  },[user?.id]);
  useEffect(()=>{
    const stop=()=>{
      if(window.ConnectNative&&recordingChat.current)void window.ConnectNative.request('recordVoice:cancel').catch(()=>{});
      recordingSend.current?.(false);
      const recorder=mediaRecorder.current;
      if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}
      recordingStream.current?.getTracks().forEach(track=>track.stop());recordingStream.current=null;
      mediaRecorder.current=null;recordingChat.current=null;recordingFinalizing.current=false;audioChunks.current=[];
      if(recordInterval.current!==null)clearInterval(recordInterval.current);recordInterval.current=null;
      setRecording(false);setRecordSeconds(0);
    };
    const unsubscribe=sessionScope.onReset(stop);
    return()=>{unsubscribe();stop();};
  },[activeChat,user?.id]);
  useEffect(()=>{const error=(event:Event)=>setNotice(String((event as CustomEvent).detail||'Ошибка Android'));window.addEventListener('connect:native-error',error);return()=>window.removeEventListener('connect:native-error',error);},[]);
  useEffect(()=>{
    const root=scrollRef.current;
    if(!root||!CSS.supports('content-visibility','auto'))return;
    // Preserve each measured height before letting Chromium skip offscreen
    // message paint. Unmeasured placeholder estimates would move read anchors.
    const observer=new ResizeObserver(entries=>{
      for(const entry of entries){const node=entry.target as HTMLElement;const height=entry.contentRect.height;
        if(height>0){node.style.containIntrinsicSize=`auto ${height}px`;node.style.contentVisibility='auto';}}
    });
    root.querySelectorAll<HTMLElement>('.message-day-group').forEach(node=>observer.observe(node));
    return()=>observer.disconnect();
  },[activeChat,profileView,messages.length]);
  const gallery = visibleMessages.flatMap(m => [
    ...(m.attachment_path && (m.attachment_kind==='image'||m.attachment_kind==='video') && !isVideoNote(m) && !isKeyboardSticker(m)
      ? [{path:m.attachment_path,name:m.attachment_name||'Медиа',kind:m.attachment_kind as 'image'|'video'}] : []),
    ...parseAlbum(m.body),
  ].map(item=>({...item,messageId:m.id,senderId:m.sender_id,createdAt:m.created_at})))
    .filter(item=>Boolean(attachmentUrls[item.path]))
    .map(item=>({...item,url:attachmentUrls[item.path]}));
  const galleryIndex = mediaViewer ? gallery.findIndex(item => item.path === mediaViewer.path) : -1;
  useEffect(()=>{
    if(!mediaViewer || galleryIndex<0)return;
    for(const index of [galleryIndex-1,galleryIndex+1]){
      const item=gallery[index];
      if(item?.kind==='image') { const image=new Image(); image.src=item.url; }
    }
  },[galleryIndex,mediaViewer?.path]);
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
      if(window.ConnectNative){const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
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
      if (gesture.current?.id === m.id) { gesture.current.opened = true; suppressMessageClick.current=Date.now()+1000;openMenu(m, element); }
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
    if(g.opened)suppressMessageClick.current=Date.now()+600;
    clearGestureTimer(); gesture.current = null; setSwipe(null);
    if (!g.opened && g.dx > 58 && g.dx > Math.abs(g.dy) * 1.3 && !m.deleted_at) startReply(m);
  }
  function bubbleKey(e: ReactKeyboardEvent<HTMLDivElement>, m: Message) {
    if(e.target!==e.currentTarget)return;
    if ((e.key === 'Enter' || e.key === ' ') && !m.deleted_at) { e.preventDefault(); openMenu(m, e.currentTarget); }
  }

  async function login(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    loginInProgress.current=true;
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
      else {
        try{localStorage.removeItem(CONNECT_LOCAL_LOGOUT_FLAG);}catch{}
        void verifyAuth();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ошибка соединения с сервером');
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      loginInProgress.current=false;
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
    if (!supabase) return;
    // A missing remote session is NOT a reason to leave the private UI unlocked.
    ++authSequence.current;
    verifiedSessionRef.current = false;
    setConnectionStatus('online');
    verifiedIdentityRef.current=null;
    const accountId=user?.id;
    try{localStorage.setItem(CONNECT_LOCAL_LOGOUT_FLAG,'1');}catch{}
    setPushSession(null);
    setAuthGate('denied');setUser(null); setLoading(false); setSetup(false);
    setBusy(true);setNotice('');
    exitChat();setProfiles([]);setConversations([]);setMessages([]);
    setLatest({});setUnread({});readCache.current={};setPassword('');
    historyWarmStamps.current={};inboxMediaWarm.current.clear();
    avatarCacheEpoch.current++;setAvatarUrls({});
    if(accountId)forgetUserChatPresentation(accountId);
    warmedChatWindows.current.clear();signedMediaLifetimes.current.clear();
    let signoutTimeout:ReturnType<typeof setTimeout>|undefined;
    try {
      if(accountId)await retireCurrentPush(supabase,accountId);
      const {error}=await Promise.race([
        supabase.auth.signOut({ scope: 'local' }),
        new Promise<{error:Error}>((resolve)=>{signoutTimeout=setTimeout(()=>resolve({error:new Error('signout_timeout')}),4500);}),
      ]);
      if(error && error.name!=='AuthSessionMissingError'){
        setNotice('Локальный выход выполнен. Серверный выход не подтверждён.');
      }
    }catch{
      setNotice('Локальный выход выполнен. Серверный выход не подтверждён.');
    }finally{
      if(signoutTimeout)clearTimeout(signoutTimeout);
      // Even if Supabase returns Auth session missing or the network fails,
      // ensure a cold PWA restart cannot reopen from stale local credentials.
      clearStoredConnectAuth();
      if(accountId)void wipeUserHistory(accountId).catch(()=>{});
      setBusy(false);
    }
  }

  const keyboardOpen = frame ? window.innerHeight - frame.height - frame.top > 130 : false;
  const screenStyle: CSSProperties | undefined = frame ? { height: `${frame.height}px`, top: `${frame.top}px`, paddingBottom: keyboardOpen ? '0px' : undefined } : undefined;
  return <div className={'connect-app ' + theme + (keyboardOpen ? ' keyboard-open' : '')} data-visual-scene={visualScene} ref={shellRef} style={{...screenStyle,...waveStyles(accent), '--accent':accent,'--accent2':accent} as CSSProperties}>
    <ConnectUiCoordinator root={shellRef} closeChat={closeChatMenu} closeList={closeListMenu}/><ConnectCallBridge/>
    {splashVisible && <ConnectSplashScreen ready={!loading && (!user || directoryReady)} onComplete={finishSplash}/>}
    {user && authGate==='verified' && connectionStatus!=='online' && <div role="status" aria-live="polite"
      style={{position:'fixed',zIndex:1500,top:'calc(env(safe-area-inset-top, 0px) + 10px)',left:'50%',transform:'translateX(-50%)',
        background:'rgba(22,27,34,.9)',color:'#fff',border:'1px solid rgba(255,255,255,.16)',borderRadius:20,
        padding:'5px 12px',fontSize:12,lineHeight:1.4,whiteSpace:'nowrap',pointerEvents:'none',boxShadow:'0 3px 14px rgba(0,0,0,.17)'}}>
      {connectionStatus==='offline'?'Нет соединения':'Восстанавливаем соединение…'}</div>}
    {supabase && user && authGate==='verified' && !setup && <ConnectPushGuardian supabase={supabase} userId={user.id}/>}
    {!supabase ? <div className="connection-error"><Icon name="info" size={32}/><h2>Подключение не настроено</h2><p>Проверьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в Vercel.</p></div>
      : loading || authGate==='checking' ? <div className="loading-screen"><img src="/icon-192.png" alt=""/><p>Подключаем Connect…</p></div>
        : authGate==='offline' ? <div className="login-screen" role="status">
            <div className="login-brand"><img src="/icon-192.png" alt=""/><h1>Connect</h1></div>
            <div className="login-form"><h2>Проверка входа</h2><p className="login-hint">Сервер авторизации недоступен. Переписки и настройки закрыты до подтверждения сессии.</p><button className="primary-action" type="button" onClick={()=>void verifyAuth()}>Повторить проверку</button><button className="settings-action secondary" type="button" onClick={()=>void logout()}>Выйти и войти заново</button></div>
          </div>
        : !user || authGate!=='verified' || setup ? <div className="login-screen">
          <div className="login-brand"><img src="/icon-192.png" alt=""/><h1>Connect</h1><p>Личные разговоры. Только свои.</p></div>
          <form className="login-form" onSubmit={setup ? savePassword : login}>
            <h2>{setup ? 'Создать пароль' : 'Вход в Connect'}</h2>
            {setup ? <input className="field" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Новый пароль (от 8 символов)"/>
              : <><input className="field" type="email" aria-label="Электронная почта" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Электронная почта"/><input className="field" type="password" aria-label="Пароль" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль"/></>}
            <button className="primary-action" disabled={busy} type="submit">{busy ? 'Подключение…' : setup ? 'Сохранить пароль' : 'Войти'}</button>
            <p className="login-hint">Вход доступен только участникам с учётной записью.</p>
          </form>
          {!setup && <button type="button" className="connect-invite-register" onClick={() => window.dispatchEvent(new Event('connect:open-registration-invite'))}>У меня есть код приглашения</button>}
        </div>
          : profileView && viewedProfile ? <div className="profile-view">
            {profileMediaOpen ? <ConnectProfileMedia key={`${profileView}:${profileMediaOpen}`} client={supabase!} userId={profileView} viewerId={user.id} isOwner={profileView===user.id} kind={profileMediaOpen} onBack={()=>setProfileMediaOpen(null)} onAvatar={selectAvatar}/> : <>
            <header className="profile-top"><button className="icon-btn" type="button" onClick={()=>setProfileView(null)} aria-label="Назад"><Icon name="back" size={25}/></button><strong>{profileView===user.id?'Мой профиль':'Профиль'}</strong></header>
            <div className="profile-content">
              <div className="profile-hero">
                <Avatar size="lg" name={viewedProfile.display_name} id={viewedProfile.id} url={avatarUrls[viewedProfile.id]}/>
                <h2>{viewedProfile.display_name}</h2>
                <p>{viewedProfile.bio || 'Информация о себе не указана'}</p>
                <ConnectMusicStatus client={supabase!} profileId={viewedProfile.id}/>
                {profileView===user.id && <><button type="button" className="avatar-change" disabled={busy} onClick={()=>avatarInput.current?.click()}><Icon name="camera" size={17}/> Изменить фото</button><input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{selectAvatar(e.target.files?.[0]);e.currentTarget.value='';}}/></>}
              </div>
              <nav className="connect-profile-library-links" aria-label="Медиатека профиля">
                <button type="button" className="connect-profile-library-link" onClick={()=>setProfileMediaOpen('photos')}><span className="connect-profile-library-link-icon" aria-hidden="true">▧</span><span className="connect-profile-library-link-text"><strong>{profileView===user.id ? 'Мои фото' : 'Фото'}</strong><small>{profileView===user.id ? 'Коллекция фотографий и выбор аватара' : 'Фотографии пользователя'}</small></span><span className="connect-profile-library-link-arrow" aria-hidden="true">›</span></button>
                <button type="button" className="connect-profile-library-link" onClick={()=>setProfileMediaOpen('videos')}><span className="connect-profile-library-link-icon" aria-hidden="true">▶</span><span className="connect-profile-library-link-text"><strong>{profileView===user.id ? 'Мои видео' : 'Видео'}</strong><small>{profileView===user.id ? 'Мои видеозаписи' : 'Видеозаписи пользователя'}</small></span><span className="connect-profile-library-link-arrow" aria-hidden="true">›</span></button>
                <button type="button" className="connect-profile-library-link" onClick={()=>setProfileMediaOpen('music')}><span className="connect-profile-library-link-icon" aria-hidden="true">♫</span><span className="connect-profile-library-link-text"><strong>{profileView===user.id ? 'Моя музыка' : 'Музыка'}</strong><small>{profileView===user.id ? 'Треки и встроенный аудиоплеер' : 'Музыка и встроенный плеер'}</small></span><span className="connect-profile-library-link-arrow" aria-hidden="true">›</span></button>
              </nav>
              {profileView===user.id ? <form className="profile-edit connect-profile-edit-inline" onSubmit={saveProfile}>
                <section className="connect-profile-edit-section"><span className="connect-profile-library-link-icon"><Icon name="user" size={24}/></span><div className="connect-profile-edit-fields"><label htmlFor="connect-profile-name">Имя</label><input id="connect-profile-name" maxLength={60} required value={editName} onChange={e=>setEditName(e.target.value)}/></div></section>
                <section className="connect-profile-edit-section"><span className="connect-profile-library-link-icon"><Icon name="info" size={24}/></span><div className="connect-profile-edit-fields"><label htmlFor="connect-profile-bio">Информация о себе</label><textarea id="connect-profile-bio" maxLength={160} rows={3} value={editBio} onChange={e=>setEditBio(e.target.value)} placeholder="Расскажите немного о себе"/></div></section>
                <small>{editBio.length}/160 · Фото JPG, PNG или WebP до 2 МБ</small>
                <button type="submit" className="primary-action" disabled={busy}>Сохранить изменения</button>
              </form> : <div className="profile-about"><span>О себе</span><p>{viewedProfile.bio || 'Пока ничего не рассказал(а)'}</p></div>}
            </div>
            </>}
          </div>
          : activeChat && selected ? <div className={"chat-view"+(!isNativeMediaRuntime()&&chatDisplayReady!==activeChat?" connect-chat-preparing":"")}>
            <header className="chat-header">
              <button type="button" className="icon-btn back-btn" onClick={exitChat} aria-label="Назад к чатам"><Icon name="back" size={28}/></button>
              <button type="button" className="chat-person-link" onClick={()=>selected.other && showProfile(selected.other.id)}>
                <Avatar name={currentName} id={selected.other?.id} url={selected.other ? avatarUrls[selected.other.id] : undefined}/>
                <span className="chat-header-person"><strong>{currentName}</strong><small className={typing || peerRecording || peerActivity ? 'typing-label' : ''}>{peerStatus}</small></span>
              </button>
              <ConnectCallButton peerName={currentName} disabled={!selected.other} target={selected.other?{conversationId:selected.id,peerId:selected.other.id,peerName:currentName}:undefined}/>
              <button type="button" className="icon-btn chat-clear-btn" aria-label="Меню чата" onClick={()=>setChatActions(v=>!v)}><Icon name="dots" size={23}/></button>
              {chatActions&&<div className="chat-actions-menu"><button type="button" onClick={()=>{setChatSearchOpen(true);setChatActions(false);}}>Найти в чате</button><button type="button" onClick={()=>startSelection()}>Выбрать сообщения</button><button type="button" className="destructive" onClick={()=>{setChatActions(false);clearConversation(activeChat);}}>Удалить переписку</button></div>}
            </header>
            {chatSearchOpen&&<div className="chat-search-bar"><Icon name="search" size={18}/><input autoFocus placeholder="Поиск по чату" value={chatQuery} onChange={e=>{setChatQuery(e.target.value);setSearchPosition(0)}}/><small>{searchMatches.length?`${searchPosition+1}/${searchMatches.length}`:'0'}</small><button type="button" onClick={()=>showMatch(searchPosition-1)}>↑</button><button type="button" onClick={()=>showMatch(searchPosition+1)}>↓</button><button type="button" onClick={()=>{setChatSearchOpen(false);setChatQuery('')}} aria-label="Закрыть поиск"><Icon name="close" size={17}/></button></div>}
            {selectionMode&&<div className="selection-toolbar"><button type="button" onClick={()=>{setSelectionMode(false);setSelectedIds([])}}>Отмена</button><strong>Выбрано: {selectedIds.length}</strong><button type="button" disabled={!selectedIds.length} onClick={()=>beginForward(selectedIds)}>Переслать</button><button type="button" disabled={!selectedIds.length} onClick={()=>hideMessages(selectedIds)}>У себя</button><button type="button" disabled={!selectedIds.length||selectedIds.some(id=>visibleMessages.find(m=>m.id===id)?.sender_id!==user.id)} onClick={()=>void removeForEveryone(selectedIds)}>У всех</button></div>}
            {!isNativeMediaRuntime()&&chatDisplayReady!==activeChat&&<div className="connect-chat-entry-overlay" role="status" aria-label="Подготовка переписки" style={wallpaper?{backgroundImage:`linear-gradient(#00000018,#00000018),url(${wallpaper})`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}><span className="connect-chat-entry-pulse" aria-hidden="true"><i/><i/><i/></span></div>}
            <div className={"message-scroll"+(wallpaper?" has-wallpaper":"")} style={wallpaper?{backgroundImage:`linear-gradient(#00000018,#00000018),url(${wallpaper})`}:undefined} ref={scrollRef} onScroll={trackScroll} onPointerDownCapture={()=>{historyTouched.current=true}} onWheelCapture={()=>{historyTouched.current=true}} aria-label="История сообщений">
              <div className="message-stream">
                {historyHasMore&&<button type="button" className="connect-history-more" disabled={historyLoadingMore} onClick={()=>void loadOlderChatMessages()}>{historyLoadingMore?'Загружаем…':'Предыдущие сообщения'}</button>}
                {visibleMessages.length === 0 ? <div className="empty-chat"><Icon name="message" size={32}/><span>{chatHistoryLoading||historyReadyChat!==activeChat||historyHasNewer||historyLoadingMore?'Загружаем переписку…':'Напишите первое сообщение'}</span></div> : visibleMessages.map((m,index) => {
                  const mine = m.sender_id === user.id;
                  const replied = m.reply_to ? visibleMessages.find(x => x.id === m.reply_to) : undefined;
                  return <div key={m.id} id={"msg-"+m.id} className="message-day-group">
                    {chatReadingEntry?.chatId === activeChat && chatReadingEntry.firstUnreadId === m.id
                      && <div className="connect-new-messages" role="separator"><span>Новые сообщения</span></div>}
                    {(index===0 || dayKey(visibleMessages[index-1].created_at)!==dayKey(m.created_at)) && <div className="date-separator"><span>{dayLabel(m.created_at)}</span></div>}
                    <div className={'message-row ' + (mine ? 'outgoing' : 'incoming') + (selectedIds.includes(m.id)?' is-selected':'')}>
                    {selectionMode&&<input className="message-select-check" type="checkbox" aria-label="Выбрать сообщение" checked={selectedIds.includes(m.id)} onChange={()=>selectOne(m.id)}/>}
                    {swipe?.id === m.id && <span className="swipe-reply-icon"><Icon name="reply" size={22}/></span>}
                    <div className={'bubble ' + (mine ? 'sent' : 'received') + (m.deleted_at ? ' removed' : '') + (!m.deleted_at && (stickerFromBody(forwardedMessage(m.body).text) || /^\[\[connect-custom-sticker:[0-9a-f-]{36}\]\]$/.test(forwardedMessage(m.body).text) || isKeyboardSticker(m) || (!m.attachment_path && /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(forwardedMessage(m.body).text.trim()))) ? ' sticker-bubble' : '') + (!m.deleted_at && !m.attachment_path && /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(forwardedMessage(m.body).text.trim()) ? ' emoji-only' : '') + (!m.deleted_at && (parseAlbum(m.body).length>0 || (m.attachment_path && (m.attachment_kind==='image'||m.attachment_kind==='video') && !isKeyboardSticker(m))) ? ' media-only' : '') + (!m.deleted_at && isVideoNote(m) ? ' video-note-bubble' : '') + (!m.deleted_at && !isVideoNote(m) && (parseAlbum(m.body).length>0 || (m.attachment_path && (m.attachment_kind==='image'||m.attachment_kind==='video') && !isKeyboardSticker(m))) ? ' connect-unified-media' : '') + ((m.attachment_kind==='audio'||isPlayableAudioFile(m)) ? ' voice-note-bubble' : '')}
                      style={swipe?.id===m.id ? { transform:`translate3d(${swipe.offset}px,0,0)` } : undefined}
                      onTouchStart={e => touchStart(e, m)} onTouchMove={e => touchMove(e, m)}
                      onTouchEnd={() => touchEnd(m)} onTouchCancel={() => { clearGestureTimer(); gesture.current = null; setSwipe(null); }}
                      onPointerMoveCapture={e=>{const g=gesture.current;if(g&&e.target instanceof Element&&e.target.closest('.voice-wave')&&(Math.abs(e.clientX-g.x)>8||Math.abs(e.clientY-g.y)>8)){clearGestureTimer();gesture.current=null;setSwipe(null);}}}
                      onClickCapture={e=>{if(selectionMode){e.preventDefault();e.stopPropagation();selectOne(m.id);}else if(Date.now()<suppressMessageClick.current){e.preventDefault();e.stopPropagation();}}}
                      onClick={()=>{if(selectionMode)selectOne(m.id)}}
                      onContextMenu={e => { e.preventDefault(); if(selectionMode)selectOne(m.id);else openMenu(m, e.currentTarget); }}
                      onKeyDown={e => bubbleKey(e, m)} tabIndex={m.deleted_at ? -1 : 0}
                      role="button" aria-label="Удерживайте, чтобы открыть действия с сообщением">
                      {replied && <button type="button" className="quote-box" onClick={e=>{e.stopPropagation();document.getElementById('msg-'+replied.id)?.scrollIntoView({behavior:'smooth',block:'center'});}} onTouchStart={e=>e.stopPropagation()} aria-label="Перейти к исходному сообщению"><strong>{replied.sender_id === user.id ? 'Вы' : currentName}</strong><span>{messagePreview(replied,user.id)}</span></button>}
                      <div className="bubble-body"><>
                        {forwardedMessage(m.body).from && <div className="connect-forward-compact" title={`Переслано от ${forwardedMessage(m.body).from}`}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 5l6 6-6 6"/><path d="M20 11H9a6 6 0 0 0-6 6v2"/></svg><span>от {forwardedMessage(m.body).from}</span></div>}
                        {parseAlbum(m.body).length>0 && <div className="connect-album-grid">{parseAlbum(m.body).map((item,i)=><button type="button" key={item.path} className="connect-media-thumb" onClick={e=>{e.stopPropagation();if(attachmentUrls[item.path])setMediaViewer({...item,url:attachmentUrls[item.path]})}} aria-label={`Открыть файл ${i+1}`}>{attachmentUrls[item.path]?(item.kind==='image'?(imageInChat(item.path)?<img src={imageInChat(item.path)} alt={item.name} loading="lazy" onError={()=>failedPhotoPreview(item.path)}/>:<span>Миниатюра…</span>):<><VideoThumbnail src={attachmentUrls[item.path]} path={item.path}/><span className="connect-media-play">▶</span></>):<span>Загрузка…</span>}</button>)}</div>}
                        {m.attachment_path && <div className={isKeyboardSticker(m) ? "attachment-preview keyboard-sticker-preview" : m.attachment_kind==='image' ? "attachment-preview connect-adaptive-photo" : m.attachment_kind==='video' && !isVideoNote(m) ? "attachment-preview connect-adaptive-video" : "attachment-preview"} style={m.attachment_kind==='image' && !isKeyboardSticker(m) ? connectPhotoFrameStyle(m.attachment_path) : m.attachment_kind==='video' && !isVideoNote(m) ? connectVideoFrameStyle(m.attachment_path) : undefined}>
                          {!attachmentUrls[m.attachment_path] ? (isKeyboardSticker(m) ? <span className="connect-keyboard-sticker-loading" aria-label="Загрузка стикера"/> : (isNativeMediaRuntime()?<span>Загрузка вложения…</span>:<span className="connect-media-unavailable" aria-label="Подготовка вложения">{m.attachment_kind==='video'?'▶':m.attachment_kind==='audio'?'♪':m.attachment_kind==='image'?'▧':'◇'}</span>))
                            : m.attachment_kind==='image' ? (isKeyboardSticker(m)
                              ? <img className="connect-keyboard-sticker" src={attachmentUrls[m.attachment_path]} alt="Стикер" draggable={false} loading="lazy"/>
                              : <button type="button" className="connect-media-thumb connect-adaptive-image" onClick={e=>{e.stopPropagation();setMediaViewer({url:attachmentUrls[m.attachment_path!],path:m.attachment_path!,name:m.attachment_name || 'Фото.jpg',kind:'image'})}} aria-label="Открыть фото">{imageInChat(m.attachment_path!)
                                 ? <img src={imageInChat(m.attachment_path!)} alt={m.attachment_name || 'Фото'} loading="lazy"
                                     onError={()=>failedPhotoPreview(m.attachment_path!)}
                                     onLoad={e=>{if(!supportsPhotoPreview(m.attachment_path!))connectUpdatePhotoSize(e.currentTarget,m.attachment_path!);}}/>
                                 : <span>Миниатюра…</span>}</button>)
                            : isVideoNote(m) ? <VideoNoteBubble src={attachmentUrls[m.attachment_path]} name={m.attachment_name||'Видеокружок'} path={m.attachment_path} sentAt={m.created_at} mine={mine} delivered={Boolean(currentPeerState?.delivered && currentPeerState.delivered>=m.created_at || currentPeerState?.read && currentPeerState.read>=m.created_at)} read={Boolean(currentPeerState?.read && currentPeerState.read>=m.created_at)}/>
                            : m.attachment_kind==='video' ? <ConnectInlineAutoplayVideo src={attachmentUrls[m.attachment_path]} path={m.attachment_path} onOpen={()=>setMediaViewer({url:attachmentUrls[m.attachment_path!],path:m.attachment_path!,name:m.attachment_name || 'Видео.mp4',kind:'video'})}/>
                            : m.attachment_kind==='audio' ? <div className="connect-audio-download"><VoicePlayer src={attachmentUrls[m.attachment_path]} path={m.attachment_path} byteSize={m.attachment_size||0} sentAt={m.created_at} mine={mine} delivered={Boolean(currentPeerState?.delivered && currentPeerState.delivered>=m.created_at || currentPeerState?.read && currentPeerState.read>=m.created_at)} read={Boolean(currentPeerState?.read && currentPeerState.read>=m.created_at)}/></div>
                            : isPlayableAudioFile(m) ? <VoicePlayer src={attachmentUrls[m.attachment_path]} path={m.attachment_path} byteSize={m.attachment_size||0} sentAt={m.created_at} mine={mine} fileName={m.attachment_name||'Аудиофайл'} onSave={()=>void saveAttachment(m.attachment_path!,m.attachment_name||'Аудиофайл')} delivered={Boolean(currentPeerState?.delivered&&currentPeerState.delivered>=m.created_at||currentPeerState?.read&&currentPeerState.read>=m.created_at)} read={Boolean(currentPeerState?.read&&currentPeerState.read>=m.created_at)}/>
                            : <button type="button" className="attachment-file" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Файл')}}><Icon name="file" size={23}/><span>{m.attachment_name || 'Файл'}<small>{m.attachment_size ? (m.attachment_size/1048576).toFixed(1)+' МБ' : ''} · Скачать</small></span></button>}
                        </div>}
                        {/^\[\[connect-custom-sticker:([0-9a-f-]{36})\]\]$/.test(forwardedMessage(m.body).text) ? (()=>{const id=forwardedMessage(m.body).text.match(/^\[\[connect-custom-sticker:([0-9a-f-]{36})\]\]$/)?.[1];const st=customStickers.find(x=>x.id===id);const link=st?customStickerUrl(st):'';return link?<img className="sent-sticker" src={link} alt="Стикер" loading="lazy"/>:(!st&&stickerCatalogReady?<span>Стикер недоступен</span>:<span className="connect-sticker-loading" role="status" aria-label="Загрузка стикера"><i/></span>)})() : stickerFromBody(forwardedMessage(m.body).text) ? <img className="sent-sticker" src={stickerUrl(stickerFromBody(forwardedMessage(m.body).text)!)} alt="Стикер" loading="lazy"/> : (parseAlbum(m.body).length ? null : forwardedMessage(m.body).text ? highlightMessage(forwardedMessage(m.body).text) : null)}
                      </></div>
                      {m.attachment_kind!=='audio' && !isPlayableAudioFile(m) && !isVideoNote(m) && <div className="bubble-meta">{!m.deleted_at && isPlayableAudioFile(m) && <button type="button" className="connect-inline-audio-save" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Аудиофайл')}}>Сохранить</button>}{m.edited_at && !m.deleted_at && <span>изменено · </span>}{timeLabel(m.created_at)}{mine && <MessageChecks delivered={Boolean(currentPeerState?.delivered && currentPeerState.delivered>=m.created_at || currentPeerState?.read && currentPeerState.read>=m.created_at)} read={Boolean(currentPeerState?.read && currentPeerState.read>=m.created_at)}/>}</div>}
                    </div>
                  </div>
                  </div>;
                })}
                {historyHasNewer&&<button type="button" className="connect-history-more" disabled={historyLoadingMore} onClick={()=>void loadNewerChatMessages()}>{historyLoadingMore?'Загружаем…':'Следующие сообщения'}</button>}
              </div>
            </div>
            {(showChatJump||historyHasNewer) && <button type="button" className="connect-chat-jump" onClick={jumpToReadingPoint}
              aria-label="Вниз к последнему прочитанному или последнему сообщению" title="К последнему сообщению">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v15m-7-7 7 7 7-7" />
              </svg>
            </button>}
            <form className="chat-composer" onSubmit={sendMessage}>
              {(replyTo || editing) && <div className="compose-context"><div className="context-stripe"/><div className="compose-context-text"><strong>{editing ? 'Редактирование' : `Ответ: ${replyTo?.sender_id === user.id ? 'Вы' : currentName}`}</strong><span>{editing?.body || replyTo?.body}</span></div><button type="button" className="icon-btn dismiss-context" onClick={cancelCompose} aria-label="Отменить"><Icon name="close" size={20}/></button></div>}
              {pendingFiles.length>0 && <div className="connect-album-compose">
                <div className="connect-album-heading"><strong>Выбрано: {pendingFiles.length}</strong><button type="button" onClick={()=>setPendingFiles([])}>Отмена</button></div>
                <div className="connect-album-previews">{pendingFiles.map((file,i)=><PendingAttachment key={i} file={file} onRemove={()=>setPendingFiles(prev=>prev.filter((_,j)=>j!==i))}/>)}</div>
                <button className="connect-album-send" type="button" disabled={busy} onClick={()=>void sendSelectedFiles()}>{busy?'Отправляем…':pendingFiles.length>1?'Отправить выбранное':'Отправить файл'}</button>
              </div>}
              {uploadProgress!==null && <div className="upload-status">Отправка файла: {uploadProgress}%<progress max={100} value={uploadProgress}/></div>}
              {recording && <RecordingBar started={recordingStarted.current} stream={recordingStream.current} onCancel={()=>finishRecording(false)} onSend={()=>finishRecording(true)}/>}
              <input ref={attachmentInput} type="file" multiple hidden onChange={e=>{setFilePickerOpen(false);chooseAttachments(e.currentTarget.files);e.currentTarget.value='';}}/>
              {stickerPicker && <div className="sticker-picker">
                <div className="sticker-picker-tabs">
                  {STICKER_PACKS.filter(p=>enabledPacks.includes(p.id)).map(p=><button key={p.id} type="button" className={stickerPack===p.id?'active':''} onClick={()=>{setStickerPack(p.id);setCustomPack('')}}>{p.emoji} {p.name}</button>)}
                  {customPacks.filter(p=>p.name!==IOS_FAVORITE_PACK).map(p=><button key={p.id} type="button" className={customPack===p.id?'active':''} onClick={()=>{setCustomPack(p.id);setStickerPack('speed')}}>{p.emoji} {p.name}</button>)}
                  <button type="button" className={stickerPack==='favorites'?'active':''} onClick={()=>{setStickerPack('favorites');setCustomPack('')}}>⭐</button>
                  <button type="button" className={stickerPack==='recent'?'active':''} onClick={()=>{setStickerPack('recent');setCustomPack('')}}>🕒</button>
                </div>
                <div className="sticker-grid">{!customPack && stickerPack==='favorites' && customStickers
                  .filter(st => customPacks.some(pack => pack.id===st.pack_id && pack.owner_id===user.id && pack.name===IOS_FAVORITE_PACK))
                  .map(st => <div key={'ios-saved-'+st.id} className="sticker-choice">
                    <button type="button" onClick={()=>void sendCustomSticker(st)} disabled={busy} aria-label="Отправить сохранённый стикер"><img src={customStickerUrl(st)} alt="Стикер"/></button>
                    <button type="button" className="sticker-fav" onClick={()=>void deleteCustomSticker(st)} aria-label="Удалить из избранного">★</button>
                  </div>)}{customPack?customStickers.filter(st=>st.pack_id===customPack).map(st=><button key={st.id} type="button" className="sticker-choice" onClick={()=>void sendCustomSticker(st)} disabled={busy}><img src={customStickerUrl(st)} alt="Стикер"/></button>):(stickerPack==='favorites'?stickerFavorites:stickerPack==='recent'?stickerRecent:STICKER_PACKS.find(p=>p.id===stickerPack)?.stickers.map(st=>stickerPack+':'+st.id)||[]).map(key=>{const [pack,id]=key.split(':');const found=STICKER_PACKS.find(p=>p.id===pack)?.stickers.find(st=>st.id===id);if(!found)return null;return <div key={key} className="sticker-choice"><button type="button" onClick={()=>void sendSticker(pack as StickerPackId,id)} disabled={busy} aria-label="Отправить стикер"><img src={stickerUrl({pack,id})} alt="Стикер"/></button><button type="button" className="sticker-fav" onClick={()=>toggleFavorite(key)} aria-label="В избранное">{stickerFavorites.includes(key)?'★':'☆'}</button></div>;})}</div>
              </div>}
              <div className="compose-line"><button type="button" className="composer-extra" onClick={()=>{setFilePickerOpen(false);setStickerPicker(x=>!x);}} aria-label="Стикеры"><Icon name="smile" size={24}/></button><button className="composer-extra" type="button" disabled={busy || recording || Boolean(editing)} onClick={()=>{setStickerPicker(false);filePickerOpenedAt.current=Date.now();setFilePickerOpen(true);if(activeChat)void updateActivity(activeChat,'file');attachmentInput.current?.click();}} aria-label="Прикрепить фото, видео или файл"><Icon name="plus" size={23}/></button><input ref={inputRef} type="text" autoComplete="off" enterKeyHint="send" aria-label="Сообщение" maxLength={10000} value={draft} onChange={e => changeDraft(e.target.value)} onPaste={handleComposerPaste} placeholder={editing ? 'Изменить сообщение…' : 'Сообщение…'}/><button className="send-button" type="submit" disabled={busy || !draft.trim()} aria-label={editing ? 'Сохранить' : 'Отправить'}><Icon name={editing ? 'check' : 'send'} size={23}/></button>{!draft.trim() && !editing && !recording && <button className="composer-extra" type="button" disabled={busy} onClick={()=>void openNativeVideoNote()} aria-label="Записать видеокружок"><Icon name="camera" size={22}/></button>}{!draft.trim() && !editing && <button className="composer-extra" type="button" disabled={busy} onClick={()=>recording?finishRecording(true):void beginRecording()} aria-label="Записать голосовое"><Icon name={recording?'stop':'mic'} size={22}/></button>}</div>
            </form>
          </div>
            : <><div className="main-view" ref={mainSlot}>
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
                    onClick={() => {if(listHold.current?.opened){listHold.current=null;return;}enterChat(c.id)}}><PresenceAvatar name={c.other?.display_name || 'Собеседник'} id={c.other?.id} url={c.other ? avatarUrls[c.other.id] : undefined} online={!isNativeMediaRuntime() && formatPresence(presence[c.other?.id || ''], clock) === 'В сети'}/><div className="dialog-summary"><strong>{c.other?.display_name || 'Собеседник'}</strong><span>{messagePreview(c.last, user.id)}</span></div><div className="dialog-meta"><time>{listTimeLabel(c.last?.created_at || c.created_at)}</time>{c.count > 0 && <span className="unread-pill">{c.count > 99 ? '99+' : c.count}</span>}</div></button>{listActions===c.id&&<div className="list-chat-popover"><button type="button" onClick={()=>{setListActions(null);clearConversation(c.id)}}>Удалить переписку</button><button type="button" onClick={()=>setListActions(null)}>Отмена</button></div>}</div>)}
                </div>
              </>}
              {tab === 'contacts' && <>
                <header className="simple-header"><h1>Контакты</h1><span className="subtle-counter">{contacts.length}</span></header>
                <div className="search-field"><Icon name="search" size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск контактов" aria-label="Поиск контактов"/></div>
                <div className="section-caption">МОИ КОНТАКТЫ</div>
                <div className="scroll-content contact-rows">
                  {filteredContacts.length === 0 ? <div className="empty-state"><Icon name="contacts" size={38}/><strong>{search ? 'Контакт не найден' : 'Контактов пока нет'}</strong><span>{search ? 'Попробуйте другое имя' : 'Контакты появятся после приглашения участников'}</span></div>
                    : filteredContacts.map(p => <button type="button" className="contact-row" key={p.id} disabled={busy} onClick={() => void openContact(p)}><PresenceAvatar name={p.display_name} id={p.id} url={avatarUrls[p.id]} online={!isNativeMediaRuntime() && formatPresence(presence[p.id], clock) === 'В сети'}/><span className="contact-text"><strong>{p.display_name}</strong><small>{p.bio || "Открыть переписку"}</small></span><Icon name="chevron" size={19}/></button>)}
                </div>
              </>}
              {tab === 'settings' && <>
                <header className="simple-header">{settingsPage!=='home' && <button type="button" className="icon-btn" onClick={()=>setSettingsPage('home')} aria-label="Назад"><Icon name="back" size={24}/></button>}<h1>{({home:'Настройки',appearance:'Оформление',notifications:'Уведомления',stickers:'Стикеры',members:'Участники',usage:'Хранилище и трафик',data:'Данные',privacy:'Приватность',about:'О приложении'} as Record<SettingsPage,string>)[settingsPage]}</h1></header>
                <div className="scroll-content settings-content">
                  {settingsPage==='home' && <>
                    <button type="button" className="settings-profile" onClick={()=>showProfile(user.id)}><Avatar size="lg" name={ownProfile?.display_name||'Мой профиль'} id={user.id} url={avatarUrls[user.id]}/><div><strong>{ownProfile?.display_name||'Мой профиль'}</strong><span>{ownProfile?.bio||user.email}</span></div><Icon name="chevron" size={19}/></button>
                    <div ref={settingsSlot} className="settings-group settings-menu">
                      {([{id:'appearance',icon:'sun',title:'Оформление',subtitle:'Тема, цвет и фон чатов'},{id:'stickers',icon:'message',title:'Стикеры',subtitle:'Наборы и избранное'},...(admin?[{id:'members' as SettingsPage,icon:'contacts' as IconName,title:'Управление участниками',subtitle:'Приглашения в Connect'},{id:'usage' as SettingsPage,icon:'file' as IconName,title:'Хранилище и трафик',subtitle:'Статистика Supabase'}]:[]),{id:'notifications',icon:'info',title:'Уведомления',subtitle:'Звуки и push-уведомления'},{id:'data',icon:'file',title:'Данные и хранилище',subtitle:'Экспорт и очистка'},{id:'privacy',icon:'shield',title:'Приватность',subtitle:'Безопасность переписок'},{id:'about',icon:'info',title:'О приложении',subtitle:'Версия и разработчики'}] as {id:SettingsPage;icon:IconName;title:string;subtitle:string}[]).map((item,i,items)=><div key={item.id} className={settingsMenuSegmentClasses(items,i)}>{i>0&&<div className="setting-divider"/>}<button type="button" className="settings-menu-row" onClick={()=>setSettingsPage(item.id)}><span className="setting-icon"><Icon name={item.icon} size={19}/></span><span><strong>{item.title}</strong><small>{item.subtitle}</small></span><Icon name="chevron" size={19}/></button></div>)}
                    </div><button type="button" className="logout-button" onClick={()=>void logout()}><Icon name="logout" size={20}/> Выйти из аккаунта</button>
                  </>}
                  {settingsPage==='appearance' && <>
                    <h3>Тема приложения</h3><div className="settings-group"><div className="settings-theme"><span className="setting-icon"><Icon name={theme==='dark'?'moon':'sun'} size={19}/></span><div><strong>Режим отображения</strong><small>На этом устройстве</small></div></div><div className="theme-buttons"><button type="button" className={theme==='dark'?'current':''} onClick={()=>changeTheme('dark')}>Тёмная</button><button type="button" className={theme==='light'?'current':''} onClick={()=>changeTheme('light')}>Светлая</button></div></div>
                    <h3>Темы оформления</h3>
                    <div className="settings-group connect-theme-gallery">
                      <p className="settings-hint">Выберите фон и настроение Connect. Светлая и тёмная тема, а также цвет кнопок настраиваются отдельно.</p>
                      <div className="connect-theme-grid" role="group" aria-label="Темы оформления">
                        {VISUAL_SCENES.map(scene => <button key={scene.id} type="button"
                          className={'connect-theme-choice' + (visualScene === scene.id ? ' is-selected' : '')}
                          aria-pressed={visualScene === scene.id}
                          onClick={() => changeVisualScene(scene.id)}>
                          <span className="connect-theme-thumbnail" data-preview-scene={scene.id} aria-hidden="true">
                            <span className="connect-theme-thumbnail-wave"/>
                            <span className="connect-theme-thumbnail-header"><Icon name="back" size={10}/><span>Connect</span><Icon name="dots" size={10}/></span>
                            <span className="connect-theme-thumbnail-bubble">Привет!<span>12:30 ✓</span></span>
                            <span className="connect-theme-thumbnail-bubble two">На связи<span>12:31</span></span>
                            <span className="connect-theme-thumbnail-composer"><Icon name="smile" size={11}/><span>Сообщение…</span><Icon name="send" size={11}/></span>
                            <span className="connect-theme-thumbnail-nav"><Icon name="chats" size={11}/><Icon name="contacts" size={11}/><Icon name="settings" size={11}/></span>
                          </span>
                          <span className="connect-theme-choice-label"><strong>{scene.title}</strong><small>{scene.description}</small></span>
                          {visualScene === scene.id && <span className="connect-theme-selected-mark" aria-hidden="true">✓</span>}
                        </button>)}
                      </div>
                    </div>
                    <h3>Цветовая схема</h3><div className="settings-group"><div className="accent-options">{['#087dff','#8055dc','#dc477e','#198f78','#b46b26','#cc4545','#60748b'].map(c=><button type="button" key={c} className={accent===c?'selected':''} style={{background:c}} aria-label={'Цвет '+c} onClick={()=>changeAccent(c)}>{accent===c?'✓':''}</button>)}<label className="accent-custom" title="Свой цвет">＋<input type="color" aria-label="Свой цвет" value={accent} onChange={e=>changeAccent(e.target.value)}/></label></div><p className="settings-hint">Цвет кнопок, ссылок и исходящих сообщений</p></div>
                    <h3>Фон переписок</h3><div className="settings-group wallpaper-settings"><input type="file" ref={wallpaperInput} hidden accept="image/*" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void changeWallpaper(file);}}/>{wallpaper&&<img className="wallpaper-preview" src={wallpaper} alt="Выбранный фон"/>}<button type="button" className="settings-action" onClick={()=>wallpaperInput.current?.click()}>Выбрать изображение</button>{wallpaper&&<button type="button" className="settings-action secondary" onClick={()=>void removeWallpaper()}>Удалить фон</button>}<p className="settings-hint">Фон хранится только на этом устройстве. До 12 МБ.</p></div>
                  </>}
                  {settingsPage==='notifications' && <div className="settings-group"><ConnectNotificationSettings supabase={supabase!} userId={user.id}/></div>}
                  {settingsPage==='stickers' && <><p className="settings-hint">Общие наборы доступны всем пользователям. Выбирайте, какие показывать в чате.</p><div className="settings-group">{STICKER_PACKS.map((p,i)=><div key={p.id}>{i>0&&<div className="setting-divider"/>}<label className="sticker-pack-setting"><span className="sticker-pack-emoji">{p.emoji}</span><span><strong>{p.name}</strong><small>{p.description} · {p.stickers.length} шт.</small></span><input type="checkbox" checked={enabledPacks.includes(p.id)} onChange={()=>togglePack(p.id)}/></label></div>)}</div><h3>Мои наборы</h3><div className="settings-group data-settings"><input className="field" placeholder="Название нового набора" maxLength={60} value={packName} onChange={e=>setPackName(e.target.value)}/><label className="settings-hint">Эмодзи набора <input className="field" style={{maxWidth:75}} value={packEmoji} onChange={e=>setPackEmoji(e.target.value)}/></label><label className="settings-hint"><input type="checkbox" checked={packPublic} onChange={e=>setPackPublic(e.target.checked)}/> Доступен всем участникам Connect</label><button type="button" className="settings-action" disabled={busy||!packName.trim()} onClick={()=>void createCustomPack()}>Создать набор</button></div>
                    {customPacks.filter(p=>p.owner_id===user.id).map(p=><div key={p.id} className="settings-group data-settings">
                      <strong>{p.emoji} {p.name} · {customStickers.filter(st=>st.pack_id===p.id).length} шт.</strong>
                      <small>{p.is_public?'Общий набор':'Личный набор'}</small>
                      {editingStickerPack===p.id&&<p className="settings-hint">Выберите стикеры для удаления. После подтверждения они исчезнут из всех наборов и файлового хранилища.</p>}
                      <div className={'connect-custom-grid'+(editingStickerPack===p.id?' is-editing':'')}>
                        {customStickers.filter(st=>st.pack_id===p.id).map(st=><button key={st.id} type="button" disabled={busy}
                          title={editingStickerPack===p.id?'Выбрать или снять выбор':'Редактировать набор'}
                          aria-pressed={editingStickerPack===p.id?selectedStickerIds.includes(st.id):undefined}
                          onClick={()=>{if(editingStickerPack===p.id)toggleStickerSelection(st.id);else{setEditingStickerPack(p.id);setSelectedStickerIds([st.id]);}}}>
                          <img src={customStickerUrl(st)} alt={st.name||'Стикер'}/>
                          {editingStickerPack===p.id&&<span className="connect-sticker-check" aria-hidden="true">{selectedStickerIds.includes(st.id)?'✓':'○'}</span>}
                        </button>)}
                      </div>
                      <button className="settings-action secondary" type="button" disabled={busy} onClick={()=>{
                        if(editingStickerPack===p.id){setEditingStickerPack(null);setSelectedStickerIds([]);}
                        else{setEditingStickerPack(p.id);setSelectedStickerIds([]);}
                      }}>{editingStickerPack===p.id?'Готово':'Редактировать стикеры'}</button>
                      {editingStickerPack===p.id&&<button className="settings-action" type="button"
                        disabled={busy||selectedStickerIds.length===0}
                        onClick={()=>void deleteCustomStickers(customStickers.filter(st=>st.pack_id===p.id&&selectedStickerIds.includes(st.id)))}>
                        Удалить выбранные ({selectedStickerIds.length})
                      </button>}
                      <label className={'settings-action connect-sticker-upload-action'+(busy?' is-busy':'')}>
                        <span>Добавить стикеры</span>
                        <input type="file" className="connect-sticker-upload-input"
                          accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                          multiple disabled={busy} aria-label={'Добавить стикеры в набор '+p.name}
                          onChange={e=>{
                            // Snapshot FileList BEFORE clearing the native input: it is a live collection.
                            const input=e.currentTarget;
                            const selected=Array.from(input.files||[]);
                            input.value='';
                            if(selected.length)void uploadCustomStickers(p.id,selected);
                          }}/>
                      </label>
                      <button className="settings-action secondary" type="button" disabled={busy} onClick={()=>void deleteCustomPack(p)}>Удалить набор</button>
                       
                    </div>)}
                    <p className="settings-hint">В чате нажмите ☺ рядом с полем сообщения. Есть избранное и недавно отправленные.</p></>}
                  {settingsPage==='usage' && admin && <ConnectAdminUsage supabase={supabase!} userId={user.id}/>}
                  {settingsPage==='members' && admin && <div className="settings-group data-settings"><strong>Приглашения</strong><p className="settings-hint">Создавайте одноразовые коды для новых участников. Код действует 24 часа.</p><button type="button" className="settings-action" onClick={()=>window.dispatchEvent(new Event('connect:open-invitations'))}>Коды приглашений</button><button type="button" className="settings-action" onClick={()=>window.dispatchEvent(new Event('connect:open-hidden-invitations'))}>Коды для скрытых</button><div style={{marginTop:20}}><ConnectHiddenMembers request={authenticatedRequest} onChanged={()=>void loadDirectory()}/></div></div>}
                  {settingsPage==='data' && <><CacheSettings userId={user.id}/><div className="settings-group data-settings"><strong>Локальные данные</strong><p className="settings-hint">Сбросит тему, цвет, фон и настройки стикеров на этом устройстве. Переписки, файлы и голосовые на сервере останутся.</p><button type="button" className="settings-action secondary" onClick={clearLocalPreferences}>Очистить локальные настройки</button></div><div className="settings-group data-settings"><strong>Экспорт переписки</strong><p className="settings-hint">Экспорт всех доступных переписок в JSON (до 50 000 сообщений). Файлы вложений в архив не входят.</p><button type="button" className="settings-action" disabled={busy||conversations.length===0} onClick={()=>void exportChats()}>Экспортировать переписки</button></div></>}
                  {settingsPage==='privacy' && <><div className="settings-group data-settings"><strong>Личные переписки</strong><p className="settings-hint">Сообщения доступны участникам диалога в рамках настроенных правил доступа. Это не означает сквозное шифрование.</p></div><div className="settings-group data-settings"><strong>Удаление аккаунта</strong><p className="settings-hint">Учётная запись и личные данные будут удалены. Отправленные сообщения останутся у собеседников от имени «Удалённый пользователь».</p><button type="button" className="settings-action secondary" disabled={busy} onClick={()=>void deleteMyAccount()}>Удалить аккаунт навсегда</button></div></>}
                  {settingsPage==='about' && <div className="settings-group data-settings"><strong>Connect Messenger</strong><p>Версия 3.0</p><p><strong>Разработчики: Алина и Кирилл</strong></p><p className="settings-hint">Мессенджер для личного общения.</p></div>}
                </div>
              </>}
            </div><nav ref={navSlot} className="bottom-nav" aria-label="Основная навигация">
              {([{ id: 'chats' as const, label: 'Чаты', icon: 'chats' as const }, { id: 'contacts' as const, label: 'Контакты', icon: 'contacts' as const }, { id: 'settings' as const, label: 'Настройки', icon: 'settings' as const }]).map(item => <button type="button" key={item.id} className={'nav-tab' + (tab === item.id ? ' selected' : '')} onClick={() => switchTab(item.id)}><span className="nav-symbol"><Icon name={item.icon} size={24}/>{item.id === 'chats' && unreadTotal > 0 && <em className="connect-nav-count" aria-hidden="true">{unreadTotal > 99 ? '99+' : unreadTotal}</em>}</span><small>{item.label}</small></button>)}
            </nav></>}
    {authGate==='verified' && user && crop && <AvatarCropper url={crop.url} saving={busy} onCancel={closeCrop} onSave={blob=>void uploadAvatar(new File([blob],'avatar.jpg',{type:'image/jpeg'}))}/>}
    {notice && <button type="button" className="notice-toast"  role="status" onClick={() => setNotice('')}>{notice} <Icon name="close" size={16}/></button>}
    {authGate==='verified' && user && forwardIds.length>0&&<div className="forward-overlay"><div className="forward-dialog"><header><strong>Переслать сообщения</strong><button type="button" onClick={()=>setForwardIds([])}><Icon name="close" size={21}/></button></header><p>Выберите получателя · {forwardIds.length} сообщ.</p><div className="forward-contacts">{contacts.map(p=><button type="button" key={p.id} disabled={busy} onClick={()=>void forwardTo(p)}><Avatar name={p.display_name} id={p.id} url={avatarUrls[p.id]}/><span>{p.display_name}</span><Icon name="chevron" size={18}/></button>)}</div></div></div>}
    {authGate==='verified' && user && videoNoteOpen && <VideoNoteRecorder onClose={()=>{setVideoNoteRecording(false);setVideoNoteOpen(false)}} onRecordingChange={setVideoNoteRecording} onSend={file=>{setVideoNoteRecording(false);setVideoNoteOpen(false);void sendAttachment(file)}}/>}
    {authGate==='verified' && user && mediaViewer && <ConnectGalleryViewer
      items={galleryIndex>=0?gallery:[...gallery,mediaViewer]}
      currentPath={mediaViewer.path}
      onClose={()=>setMediaViewer(null)}
      onStep={stepGallery}
      onSave={item=>saveAttachment(item.path,item.name)}
      onFetch={async item=>{
        if(!supabase)throw new Error('Хранилище недоступно');
        const {data,error}=await supabase.storage.from('connect-attachments').download(item.path);
        if(error||!data)throw error||new Error('Файл недоступен');
        return data;
      }}
      onForward={item=>{if(item.messageId){beginForward([item.messageId]);setMediaViewer(null);}}}
      onJump={item=>{
        if(!item.messageId)return;
        const id=item.messageId;
        setMediaViewer(null);
        requestAnimationFrame(()=>{
          const node=document.getElementById('msg-'+id);
          if(node)node.scrollIntoView({block:'center',behavior:'smooth'});
          else setNotice('Сообщение не найдено в загруженной истории');
        });
      }}
    />}
    {authGate==='verified' && user && menuMessage && <div className="context-overlay" role="presentation" onClickCapture={e=>{if(Date.now()<suppressMessageClick.current){e.preventDefault();e.stopPropagation();}}} onPointerDownCapture={()=>{suppressMessageClick.current=0;clearGestureTimer();gesture.current=null;}} onKeyDownCapture={()=>{suppressMessageClick.current=0;}}><button className="context-backdrop" aria-label="Закрыть меню" type="button" onClick={() => setMenuMessage(null)}/><div className={"floating-menu menu-"+menuSide} role="dialog" aria-modal="true" aria-label="Действия с сообщением" style={{ top: `${menuTop}px` }}>
      {isKeyboardSticker(menuMessage) && <button type="button" onClick={() => void saveKeyboardStickerFavorite(menuMessage)} disabled={busy}><Icon name="plus" size={22}/>Добавить в избранное</button>}
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
