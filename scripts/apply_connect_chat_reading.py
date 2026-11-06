#!/usr/bin/env python3
# Guarded, idempotent chat positioning fixes for Connect PWA.
# Only edits app/page.tsx and app/globals.css, preserving the existing interface.
# Run via GitHub Actions after (or together with) apply_connect_1_3_3.py.
from pathlib import Path


def replace_once(path, before, after, label):
    path = Path(path)
    source = path.read_text(encoding='utf-8')
    if after in source:
        print('Already applied:', label)
        return
    matches = source.count(before)
    if matches != 1:
        raise RuntimeError(f'{label}: expected 1 anchor, found {matches}')
    path.write_text(source.replace(before, after, 1), encoding='utf-8')
    print('Applied:', label)


page='app/page.tsx'
replace_once(page,
    "import { useCallback, useEffect, useRef, useState } from 'react';",
    "import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';",
    'Use layout effect to position chat without a visible jump')

replace_once(page,
    'type Gesture = {',
    '''type ChatReadingEntry = { chatId: string; readAt: string; firstUnreadId: string | null; anchorId: string | null };
type Gesture = {''',
    'Remember initial read boundary for each conversation')

replace_once(page,
    '''  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);''',
    '''  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [chatReadingEntry, setChatReadingEntry] = useState<ChatReadingEntry | null>(null);
  const [showChatJump, setShowChatJump] = useState(false);
  const chatPositionedRef = useRef<string | null>(null);
  const scrollCheckFrame = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);''',
    'Add safe scroll/reading UI state')

replace_once(page,
    '''    let alive = true;
    setMessages([]); setTyping(false); setPeerRecording(false); setMenuMessage(null);
    previousLast.current = ''; stickToBottom.current = true;
    const id = activeChat;''',
    '''    let alive = true;
    let firstLoad = true;
    let firstLoadPending = false;
    setMessages([]); setTyping(false); setPeerRecording(false); setMenuMessage(null);
    setChatReadingEntry(null); setShowChatJump(false);
    chatPositionedRef.current = null;
    previousLast.current = ''; stickToBottom.current = false;
    const id = activeChat;''',
    'Do not auto-scroll or mark as read while conversation opens')

replace_once(page,
    '''      if (!alive || document.visibilityState === 'hidden') return;
      const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(500);
      if (!alive) return;
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as Message[]).reverse();''',
    '''      if (!alive || document.visibilityState === 'hidden' || firstLoadPending) return;
      if (firstLoad) firstLoadPending = true;
      const [messageResult, entryStateResult] = await Promise.all([
        supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(500),
        firstLoad ? supabase.from('conversation_user_state').select('last_read_at')
          .eq('conversation_id', id).eq('user_id', user.id).maybeSingle() : Promise.resolve(null),
      ]);
      if (!alive) return;
      const { data, error } = messageResult;
      if (error) { firstLoadPending = false; setNotice(error.message); return; }
      const incoming = ((data || []) as Message[]).reverse();
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
        if (displayed.at(-1)?.sender_id === user.id) anchorIndex = displayed.length - 1;
        setChatReadingEntry({ chatId:id, readAt,
          firstUnreadId:unreadIndex >= 0 ? displayed[unreadIndex].id : null,
          anchorId:displayed[anchorIndex]?.id || null });
      }''',
    'Find the latest read / own message and first unread message on entry')

replace_once(page,
    '''      const last = incoming.at(-1); if (last) void markRead(id, last.created_at);''',
    '''      // Read receipts are updated from messages actually shown in the viewport.''',
    'Do not acknowledge off-screen messages from the polling request')

replace_once(page,
    '''      if (payload.eventType === 'INSERT') void markRead(id, m.created_at);''',
    '''      if (payload.eventType === 'INSERT' && chatPositionedRef.current === id && stickToBottom.current)
        void markRead(id, m.created_at);''',
    'Only acknowledge live messages while viewing the bottom of the chat')

replace_once(page,
    '''      alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [activeChat, user?.id, markRead]);''',
    '''      alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible);
      if (scrollCheckFrame.current !== null) cancelAnimationFrame(scrollCheckFrame.current);
      scrollCheckFrame.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeChat, user?.id, markRead]);''',
    'Cancel scroll tracking on conversation change')

replace_once(page,
    '''  useEffect(() => {
    if (!activeChat || !messages.length) return;
    const last = messages[messages.length - 1];
    void markRead(activeChat, last.created_at);
    if (previousLast.current === last.id) return; // edits/deletions do not force a scroll
    const initial = previousLast.current === '';
    previousLast.current = last.id;
    const shouldScroll = initial || stickToBottom.current || last.sender_id === user?.id;
    if (shouldScroll) requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) { el.scrollTop = el.scrollHeight; stickToBottom.current = true; }
    });
  }, [activeChat, messages, user?.id, markRead]);
  function trackScroll() {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 110;
  }''',
    '''  // Position before paint; a chat with unread messages starts at its read
  // boundary, not at an arbitrary retained browser scroll offset.
  useLayoutEffect(() => {
    if (!activeChat || !messages.length || chatReadingEntry?.chatId !== activeChat
        || chatPositionedRef.current === activeChat) return;
    const root = scrollRef.current;
    if (!root) return;
    const anchor = chatReadingEntry.anchorId
      ? root.querySelector<HTMLElement>('#msg-' + chatReadingEntry.anchorId) : null;
    if (anchor) {
      const scrollOffset = anchor.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTop = Math.max(0, root.scrollTop + scrollOffset - 14);
    } else root.scrollTop = root.scrollHeight;
    chatPositionedRef.current = activeChat;
    const below = root.scrollHeight - root.scrollTop - root.clientHeight;
    stickToBottom.current = below < 110;
    setShowChatJump(below > 170);
    requestAnimationFrame(() => { if (chatPositionedRef.current === activeChat) trackScroll(); });
  }, [activeChat, chatReadingEntry, messages.length]);

  useEffect(() => {
    if (!activeChat || !messages.length || chatPositionedRef.current !== activeChat) return;
    const last = messages[messages.length - 1];
    if (previousLast.current === last.id) return; // edits/deletions never force a jump
    const initial = previousLast.current === '';
    previousLast.current = last.id;
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

  function trackScroll() {
    const el = scrollRef.current;
    if (!el || !activeChat || chatPositionedRef.current !== activeChat) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = remaining < 110;
    setShowChatJump(remaining > 170);
    // Throttle the read-receipt scan to one animation frame per scroll burst.
    if (scrollCheckFrame.current !== null || document.visibilityState !== 'visible') return;
    scrollCheckFrame.current = requestAnimationFrame(() => {
      scrollCheckFrame.current = null;
      if (!el.isConnected || chatPositionedRef.current !== activeChat) return;
      const viewport = el.getBoundingClientRect();
      const nodes = el.querySelectorAll<HTMLElement>('.message-day-group[id^="msg-"]');
      for (let i = nodes.length - 1; i >= 0; i--) {
        const rect = nodes[i].getBoundingClientRect();
        if (rect.top >= viewport.bottom - 15 || rect.bottom <= viewport.top + 8) continue;
        const visiblePixels = Math.min(rect.bottom, viewport.bottom) - Math.max(rect.top, viewport.top);
        if (visiblePixels < Math.min(rect.height * 0.55, 72)) continue;
        const m = messages.find(message => message.id === nodes[i].id.slice(4));
        if (m && m.sender_id !== user?.id) { void markRead(activeChat, m.created_at); break; }
      }
    });
  }

  function jumpToReadingPoint() {
    const root = scrollRef.current;
    if (!root || !activeChat) return;
    const readAt = readCache.current[activeChat] || chatReadingEntry?.readAt || '';
    const last = messages.at(-1);
    const target = [...messages].reverse().find(m => m.created_at <= readAt
      || (last?.sender_id === user?.id && m.id === last.id));
    const node = target ? root.querySelector<HTMLElement>('#msg-' + target.id) : null;
    // Earlier in history: return to the last read message (or my last sent one).
    // Below that point: continue to the latest message. Never jump backwards.
    if (node && node.getBoundingClientRect().top > root.getBoundingClientRect().bottom - 25) {
      const offset = node.getBoundingClientRect().top - root.getBoundingClientRect().top;
      root.scrollTo({ top:root.scrollTop + offset - 15, behavior:'smooth' });
    } else root.scrollTo({ top:root.scrollHeight, behavior:'smooth' });
  }''',
    'Stable initial scroll, viewport-based reads and an adaptive down-arrow')

replace_once(page,
    '''                  return <div key={m.id} id={"msg-"+m.id} className="message-day-group">
                    {(index===0 || dayKey(visibleMessages[index-1].created_at)!==dayKey(m.created_at))''',
    '''                  return <div key={m.id} id={"msg-"+m.id} className="message-day-group">
                    {chatReadingEntry?.chatId === activeChat && chatReadingEntry.firstUnreadId === m.id
                      && <div className="connect-new-messages" role="separator"><span>Новые сообщения</span></div>}
                    {(index===0 || dayKey(visibleMessages[index-1].created_at)!==dayKey(m.created_at))''',
    'Place a subtle New messages divider before the first unread message')

replace_once(page,
    '''              </div>
            </div>
            <form className="chat-composer" onSubmit={sendMessage}>''',
    '''              </div>
            </div>
            {showChatJump && <button type="button" className="connect-chat-jump" onClick={jumpToReadingPoint}
              aria-label="Вниз к последнему прочитанному или последнему сообщению" title="К последнему сообщению">
              <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v15m-7-7 7 7 7-7" />
              </svg>
            </button>}
            <form className="chat-composer" onSubmit={sendMessage}>''',
    'Add unobtrusive tap-to-jump button above the message composer')

# The global unread counter should continue to reflect off-screen messages in
# the current chat until those messages actually enter the viewport.
replace_once(page,
    "if (m.conversation_id !== current && m.sender_id !== user.id && m.created_at > (readCache.current[m.conversation_id] || ''))",
    "if (m.sender_id !== user.id && m.created_at > (readCache.current[m.conversation_id] || ''))",
    'Unread counts represent messages not yet viewed, even in the opened chat')

css = Path('app/globals.css')
text=css.read_text(encoding='utf-8')
marker='/* Connect 1.3.3: stable chat read boundary and jump control */'
if marker not in text:
    css.write_text(text.rstrip()+'\n\n'+marker+'''
.connect-app .chat-view { position: relative; }
.connect-app .connect-new-messages { display:flex; align-items:center; justify-content:center; gap:10px; margin: 9px 0 13px; color:var(--accent2); font:600 11px/1.3 system-ui,sans-serif; letter-spacing:.015em; }
.connect-app .connect-new-messages::before,.connect-app .connect-new-messages::after { content:""; flex:1; min-width:12px; height:1px; background:color-mix(in srgb,var(--accent) 35%,transparent); }
.connect-app .connect-new-messages span { border-radius:20px; padding:6px 11px; background:color-mix(in srgb,var(--accent) 13%,var(--panel)); border:1px solid color-mix(in srgb,var(--accent) 22%,transparent); }
.connect-app .connect-chat-jump { position:absolute; right:19px; bottom:calc(75px + env(safe-area-inset-bottom)); width:39px; height:39px; border-radius:50%; z-index:6; display:grid; place-items:center; padding:0; color:var(--accent2); background:color-mix(in srgb,var(--panel) 83%,transparent); border:1px solid color-mix(in srgb,var(--accent) 23%,var(--border)); box-shadow:0 4px 17px rgba(0,0,0,.23); -webkit-backdrop-filter:blur(12px); backdrop-filter:blur(12px); }
.connect-app .connect-chat-jump:active { transform:scale(.95); }
.connect-app.light .connect-chat-jump { background:color-mix(in srgb,var(--panel) 90%,white); }
@media(max-width:380px){.connect-app .connect-chat-jump{right:12px;bottom:calc(69px + env(safe-area-inset-bottom));}}
''',encoding='utf-8')
    print('Applied: reading divider and jump-button styling')
else:
    print('Already applied: reading divider and jump-button styling')
