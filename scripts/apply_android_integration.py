#!/usr/bin/env python3
"""Applies validated PWA Android 1.3.1 integration to the current repository checkout.
Run via GitHub Actions (no local Python required). Idempotent on an already patched repo.
"""
from pathlib import Path


def replace_once(src: str, old: str, new: str, tag: str) -> str:
    if new in src:
        print('Already applied:', tag)
        return src
    count = src.count(old)
    if count != 1:
        raise ValueError(f'Unexpected source for {tag}: expected once, got {count}')
    return src.replace(old, new, 1)

def patch_pwa(path: Path) -> None:
    page = path / 'app/page.tsx'
    calls = path / 'components/ConnectAudioCalls.tsx'
    for f in (page, calls):
        if not f.is_file():
            raise FileNotFoundError(f)

    src = page.read_text(encoding='utf-8')
    src = replace_once(src,
        """    return () => { alive = false; subscription.unsubscribe(); };
  }, [invited]);

  async function authenticatedRequest(path:string,body?:object){""",
        """    return () => { alive = false; subscription.unsubscribe(); };
  }, [invited]);

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

  async function authenticatedRequest(path:string,body?:object){""",
        'Auto-register Android FCM token after login')
    src = replace_once(src,
        "    if (error) console.error('Read receipt:', error.message);",
        """    if (error) { delete readCache.current[id]; console.error('Read receipt:', error.message); }
    else {
      window.ConnectAndroid?.dismissConversationNotifications(id);
      // A signed-in read receipt also clears Android notifications on other devices.
      const {data:{session}}=await supabase.auth.getSession();
      if(session) void fetch('/api/push/read',{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({conversationId:id,readAt:iso})
      }).catch(()=>{});
    }""",
        'Android mark-read notification dismissal')
    src = replace_once(src,
        "  }, [user?.id]);\n\n  const updateTyping = useCallback",
        """  }, [user?.id]);

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

  const updateTyping = useCallback""",
        'Android active chat visibility')
    src = replace_once(src,
        "      for (const [id, at] of Object.entries(serverRead)) if (!readCache.current[id] || readCache.current[id] < at) readCache.current[id] = at;",
        """      for (const [id, at] of Object.entries(serverRead)) if (!readCache.current[id] || readCache.current[id] < at) readCache.current[id] = at;
      // Clear notifications for chats read on another device, on the next visible sync.
      const newestIncoming: Record<string, string> = {};
      for (const m of recent) if (m.sender_id !== user.id && !newestIncoming[m.conversation_id])
        newestIncoming[m.conversation_id] = m.created_at;
      for (const [id, at] of Object.entries(serverRead))
        if (at && newestIncoming[id] && newestIncoming[id] <= at)
          window.ConnectAndroid?.dismissConversationNotifications(id);""",
        'Cross-device read reconciliation')
    src = replace_once(src,
        "      const formats=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'];",
        """      // Android WebView records/plays Opus in WebM more reliably than MP4 audio.
      const formats=window.ConnectAndroid
        ? ['audio/webm;codecs=opus','audio/webm','audio/mp4;codecs=mp4a.40.2','audio/mp4']
        : ['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/webm'];""",
        'Android audio format')
    src = replace_once(src,
        '      recorder.start();setRecording(true);setRecordSeconds(0);',
        '      recorder.start(250);setRecording(true);setRecordSeconds(0);',
        'Android audio data slices')
    src = replace_once(src,
        "  const [phase,setPhase]=useState<VideoNotePhase>('loading');",
        "  const [phase,setPhase]=useState<VideoNotePhase>('loading');\n  const [facing,setFacing]=useState<'user'|'environment'>('user');",
        'Video note camera switch state')
    src = replace_once(src,
        "  function stop(){if(recorderRef.current?.state==='recording')recorderRef.current.stop()}\n  function cancel(){onClose()}",
        """  function stop(){if(recorderRef.current?.state==='recording')recorderRef.current.stop()}
  async function flipCamera() {
    if(phase!=='ready' || !streamRef.current) return;
    const nextFacing=facing==='user'?'environment':'user';
    try {
      const stream=await navigator.mediaDevices.getUserMedia({
        video:{facingMode:{ideal:nextFacing},width:{ideal:480},height:{ideal:480}},
        audio:{echoCancellation:true,noiseSuppression:true}
      });
      streamRef.current.getTracks().forEach(track=>track.stop());
      streamRef.current=stream;
      if(live.current){live.current.srcObject=stream;void live.current.play().catch(()=>{});}
      setFacing(nextFacing);setError('');
    } catch(e) {setError('Не удалось переключить камеру: '+(e instanceof Error?e.message:String(e)));}
  }
  function cancel(){onClose()}""",
        'Video note front/rear camera')
    src = replace_once(src,
        "        {phase==='ready'&&<button type=\"button\" className=\"connect-vnote-primary\" onClick={start}>● Записать</button>}",
        """        {phase==='ready'&&<button type="button" onClick={()=>void flipCamera()}>↻ Камера</button>}
        {phase==='ready'&&<button type="button" className="connect-vnote-primary" onClick={start}>● Записать</button>}""",
        'Video note camera button')
    src = replace_once(src,
        "  function enterChat(id: string) { resetChatTools(); setListActions(null); setActiveChat(id); setTab('chats'); setSearch(''); setReplyTo(null); setEditing(null); setDraft(''); setMenuMessage(null); }",
        """  function enterChat(id: string) { resetChatTools(); setListActions(null); setActiveChat(id); setTab('chats'); setSearch(''); setReplyTo(null); setEditing(null); setDraft(''); setMenuMessage(null); }
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
  },[conversations,user?.id]);""",
        'Open Android push in the correct chat')
    # Keep a backup until the app is built on a real developer machine/CI.

    page.write_text(src, encoding='utf-8')

    src = calls.read_text(encoding='utf-8')
    src = replace_once(src,
        "  function cleanup() {\n    soundRef.current?.stop();",
        """  function cleanup() {
    if (callRef.current) window.ConnectAndroid?.setCallState(callRef.current.id, 'ended');
    window.ConnectAndroid?.setSpeakerphone(false);
    setSpeakerOn(false);
    soundRef.current?.stop();""",
        'Dismiss Android calls after cleanup')
    src = replace_once(src,
        "  const [muted, setMuted] = useState(false);",
        "  const [muted, setMuted] = useState(false);\n  const [speakerOn, setSpeakerOn] = useState(false);",
        'Android speakerphone state')
    src = replace_once(src,
        "      callRef.current = data as CallRow; setShown(data as CallRow);\n      await flushLocalIce();",
        """      callRef.current = data as CallRow; setShown(data as CallRow);
      window.ConnectAndroid?.setCallState(row.id, 'active');
      await flushLocalIce();""",
        'Dismiss accepted Android incoming call notification')
    src = replace_once(src,
        """  function enableRemoteAudio() {
    void remoteAudioRef.current?.play().then(() => setError('')).catch(() => setError('Не удалось включить звук. Проверьте настройки Safari.'));
  }""",
        """  function enableRemoteAudio() {
    if (window.ConnectAndroid) {
      const next=!speakerOn;
      window.ConnectAndroid.setSpeakerphone(next);
      setSpeakerOn(next);
    }
    void remoteAudioRef.current?.play().then(() => setError('')).catch(() => setError('Не удалось включить звук. Проверьте настройки воспроизведения.'));
  }""",
        'Android speakerphone toggle')
    src = replace_once(src,
        '<span><Glyph name="speaker"/></span><span>Звук</span>',
        """<span><Glyph name="speaker"/></span><span>{window.ConnectAndroid ? speakerOn ? 'Обычный звук' : 'Громкая связь' : 'Звук'}</span>""",
        'Android speakerphone button label')
    src = replace_once(src,
        "  const calling = phase !== 'idle';",
        """  // Notification action intents are delivered before or after React mounts.
  // Execute them only for the matching, still-ringing call, never another caller.
  useEffect(() => {
    function handleAndroidAction() {
      const action=window.__connectAndroidPendingCall;
      if(!action || !callRef.current || action.callId!==callRef.current.id || phase!=='incoming') return;
      delete window.__connectAndroidPendingCall;
      if(action.action==='accept') void acceptIncoming();
      else if(action.action==='decline') void finish('decline');
    }
    handleAndroidAction();
    const poll=window.setInterval(handleAndroidAction,350);
    window.addEventListener('connect:android-call-action',handleAndroidAction);
    return ()=>{window.clearInterval(poll);window.removeEventListener('connect:android-call-action',handleAndroidAction);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[phase,shown?.id]);

  const calling = phase !== 'idle';""",
        'Incoming Android call action delivery')

    calls.write_text(src, encoding='utf-8')

    message_route = path / 'app/api/push/message/route.ts'
    original = message_route.read_text(encoding='utf-8')
    updated = replace_once(original,
        'conversationId:String(record.conversation_id),messageId:String(record.id)}});',
        'conversationId:String(record.conversation_id),messageId:String(record.id),createdAt:String(record.created_at||"")}});',
        'Android message notification timestamp')

    message_route.write_text(updated, encoding='utf-8')

    print('PWA core Android integration applied')


def patch_missed_badge(path: Path) -> None:
    file = path / 'components/ConnectCallsHub.tsx'
    src = file.read_text(encoding='utf-8')
    src = replace_once(src,
        "  const [calls, setCalls] = useState<Call[]>([]);",
        "  const [calls, setCalls] = useState<Call[]>([]);\n  const [lastViewed, setLastViewed] = useState(0);",
        'Unseen missed calls state')
    src = replace_once(src,
        "  const refreshGeneration = useRef(0);",
        """  const refreshGeneration = useRef(0);

  useEffect(() => {
    if (!userId) { setLastViewed(0); return; }
    const key = 'connect-last-viewed-calls:' + userId;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null && Number.isFinite(Number(stored))) setLastViewed(Number(stored));
      else { const now = Date.now(); localStorage.setItem(key, String(now)); setLastViewed(now); }
    } catch { setLastViewed(Date.now()); }
  }, [userId]);""",
        'Last viewed calls persisted')
    src = replace_once(src,
        "  const list = filter === 'missed' && userId ? calls.filter(call => missed(call, userId)) : calls;",
        """  const unseenMissed = userId ? calls.filter(call =>
    missed(call, userId) && Date.parse(call.ended_at || call.created_at) > lastViewed).length : 0;
  function openCalls() {
    const now = Date.now();
    setLastViewed(now);
    if (userId) try { localStorage.setItem('connect-last-viewed-calls:' + userId, String(now)); } catch {}
    setOpen(true); setFilter('all');
  }
  const list = filter === 'missed' && userId ? calls.filter(call => missed(call, userId)) : calls;""",
        'Unseen missed calls count')
    src = replace_once(src,
        "      .connect-app .bottom-nav>.connect-calls-tab svg { width: 23px; height: 23px; }",
        """      .connect-app .bottom-nav>.connect-calls-tab svg { width: 23px; height: 23px; }
      .connect-app .bottom-nav>.connect-calls-tab { position: relative; }
      .connect-call-missed-dot { width: 9px; height: 9px; border-radius: 50%; background: #fa465e;
        position: absolute; top: 5px; right: calc(50% - 17px); box-shadow: 0 0 0 2px rgba(15,22,35,.9); }""",
        'Missed call red dot CSS')
    src = replace_once(src,
        "aria-label=\"Звонки\" aria-pressed={open} onClick={() => { setOpen(true); setFilter('all'); }}>",
        'aria-label={unseenMissed ? `Звонки: пропущенных ${unseenMissed}` : "Звонки"} aria-pressed={open} onClick={openCalls}>',
        'Call tab click clears red dot')
    src = replace_once(src,
        '<span className="nav-symbol"><CallIcon /></span><small>Звонки</small>',
        '<span className="nav-symbol"><CallIcon /></span>{unseenMissed > 0 && <span className="connect-call-missed-dot" aria-hidden="true"/>}<small>Звонки</small>',
        'Call tab missed dot')
    file.write_text(src, encoding='utf-8')
    print('Missed-call badge applied')

if __name__ == '__main__':
    base = Path(__file__).resolve().parent.parent
    patch_pwa(base)
    patch_missed_badge(base)
