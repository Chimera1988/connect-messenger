'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type User } from '@supabase/supabase-js';
import type { FormEvent, TouchEvent, KeyboardEvent, CSSProperties } from 'react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } })
  : null;

const MESSAGE_COLUMNS = 'id,conversation_id,sender_id,body,created_at,edited_at,deleted_at,reply_to';
type Tab = 'chats' | 'contacts' | 'settings';
type Profile = { id: string; display_name: string; is_blocked: boolean };
type Conversation = { id: string; user_a: string; user_b: string; created_at: string };
type Message = {
  id: string; conversation_id: string; sender_id: string; body: string; created_at: string;
  edited_at: string | null; deleted_at: string | null; reply_to: string | null;
};
type Gesture = { id: string; x: number; y: number; dx: number; dy: number; timer: number | null; opened: boolean };
type IconName = 'chats' | 'contacts' | 'settings' | 'back' | 'search' | 'write' | 'send' | 'reply' |
  'edit' | 'copy' | 'trash' | 'close' | 'check' | 'moon' | 'sun' | 'logout' | 'shield' | 'info' | 'chevron' | 'arrow' | 'message';

function Icon({ name, size = 22, stroke = 1.9 }: { name: IconName; size?: number; stroke?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, React.ReactNode> = {
    chats: <><path d="M20 11.4a7.5 7.5 0 0 1-7.9 7.5 8.2 8.2 0 0 1-3.3-.7L4 20l1.2-4.5A7.6 7.6 0 1 1 20 11.4Z"/></>,
    contacts: <><circle cx="12" cy="8" r="3.5"/><path d="M4.8 20v-1.4a7.2 7.2 0 0 1 14.4 0V20"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m9.5 2.8-.5 2a8 8 0 0 0-1.8 1L5.3 5l-2 3.5 1.6 1.5a7.9 7.9 0 0 0 0 2.1l-1.6 1.5 2 3.5 1.9-.8a8 8 0 0 0 1.8 1l.5 2h5l.5-2a8 8 0 0 0 1.8-1l1.9.8 2-3.5-1.6-1.5a7.9 7.9 0 0 0 0-2.1l1.6-1.5-2-3.5-1.9.8a8 8 0 0 0-1.8-1l-.5-2z"/></>,
    back: <path d="m14.7 5-7 7 7 7"/>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 5 5"/></>,
    write: <><path d="M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="m12 12 8-8a2.1 2.1 0 0 0-3-3l-8 8-.8 3.8z"/></>,
    send: <><path d="m3.2 3.7 17.5 8.3-17.5 8.3 2.6-8.3z"/><path d="M5.8 12H20"/></>,
    reply: <><path d="M9.5 9 4 14l5.5 5"/><path d="M4 14h9c5 0 7 2 7 6"/></>,
    edit: <><path d="M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/><path d="m12 12 8-8a2.1 2.1 0 0 0-3-3l-8 8-.8 3.8z"/></>,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v6m4-6v6"/></>,
    close: <path d="M5 5 19 19M19 5 5 19"/>,
    check: <path d="m4 12 5.5 5.5L20 6"/>,
    moon: <path d="M20.4 15.8A8.7 8.7 0 0 1 8.2 3.6 8.7 8.7 0 1 0 20.4 15.8Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M19 5l-1.5 1.5m-11 11L5 19"/></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5"/><path d="M13 8l4 4-4 4m4-4H9"/></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 11 2 2 4-4"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
    chevron: <path d="m9 5 7 7-7 7"/>,
    arrow: <path d="m5 12 14 0m-6-6 6 6-6 6"/>,
    message: <><path d="M20 11.4a7.5 7.5 0 0 1-7.9 7.5 8.2 8.2 0 0 1-3.3-.7L4 20l1.2-4.5A7.6 7.6 0 1 1 20 11.4Z"/><path d="M8 11h8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}

const avatarColors = ['#2369b1', '#985ab2', '#b56e48', '#327e89', '#6c73b7', '#599467'];
function Avatar({ name, id, size = 'md' }: { name: string; id?: string; size?: 'sm' | 'md' | 'lg' }) {
  let seed = 0; for (const char of id || name) seed += char.charCodeAt(0);
  const color = avatarColors[seed % avatarColors.length];
  return <span className={'person-avatar avatar-' + size} style={{ background: `linear-gradient(140deg,${color},#1b283d)` }} aria-hidden="true">{Array.from(name.trim())[0]?.toLocaleUpperCase('ru-RU') || '?'}</span>;
}
function timeLabel(iso: string) { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }); }
function listTimeLabel(iso: string) {
  const date = new Date(iso); const today = new Date();
  if (date.toDateString() === today.toDateString()) return timeLabel(iso);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function messagePreview(m?: Message, selfId?: string) {
  if (!m) return 'Начните переписку';
  return (m.sender_id === selfId ? 'Вы: ' : '') + (m.deleted_at ? 'Сообщение удалено' : m.body.replace(/\s+/g, ' '));
}

export default function Home() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [tab, setTab] = useState<Tab>('chats');
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState(''); const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latest, setLatest] = useState<Record<string, Message>>({});
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menuMessage, setMenuMessage] = useState<Message | null>(null);
  const [menuTop, setMenuTop] = useState(150);
  const [swipe, setSwipe] = useState<{ id: string; offset: number } | null>(null);
  const [search, setSearch] = useState('');
  const [frame, setFrame] = useState<{ height: number; top: number } | null>(null);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const activeChatRef = useRef<string | null>(null);
  const readCache = useRef<Record<string, string>>({});
  const lastKeypress = useRef(0); const lastTypingSent = useRef(0);
  const previousLast = useRef(''); const stickToBottom = useRef(true);
  const invited = typeof window !== 'undefined' && /type=(invite|recovery)/.test(window.location.hash + window.location.search);

  useEffect(() => { try { if (localStorage.getItem('connect-theme') === 'light') setTheme('light'); } catch { /* Private browsing */ } }, []);
  function changeTheme(next: 'dark' | 'light') { setTheme(next); try { localStorage.setItem('connect-theme', next); } catch { /* no storage */ } }

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
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setUser(data.session?.user || null); setLoading(false);
      if (error) setNotice(error.message);
      if (invited && data.session) setSetup(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      setUser(session?.user || null); setLoading(false);
      if (event === 'PASSWORD_RECOVERY' || (invited && session)) setSetup(true);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [invited]);

  const loadDirectory = useCallback(async () => {
    if (!supabase || !user) return;
    const [p, c] = await Promise.all([
      supabase.from('profiles').select('id,display_name,is_blocked'),
      supabase.from('conversations').select('id,user_a,user_b,created_at').order('created_at', { ascending: false }),
    ]);
    if (p.error) setNotice(p.error.message); else setProfiles((p.data || []) as Profile[]);
    if (c.error) setNotice(c.error.message); else setConversations((c.data || []) as Conversation[]);
  }, [user?.id]);
  useEffect(() => { void loadDirectory(); }, [loadDirectory]);

  const markRead = useCallback(async (id: string, iso: string) => {
    if (!supabase || !user) return;
    if (readCache.current[id] && readCache.current[id] >= iso) return;
    readCache.current[id] = iso;
    setUnread(prev => prev[id] ? { ...prev, [id]: 0 } : prev);
    const { error } = await supabase.from('conversation_user_state').upsert(
      { conversation_id: id, user_id: user.id, last_read_at: iso },
      { onConflict: 'conversation_id,user_id' },
    );
    if (error) console.error('Read receipt:', error.message);
  }, [user?.id]);

  const updateTyping = useCallback(async (id: string, value: boolean) => {
    if (!supabase || !user) return;
    const { error } = await supabase.from('conversation_user_state').upsert(
      { conversation_id: id, user_id: user.id, typing_until: value ? new Date(Date.now() + 6000).toISOString() : null },
      { onConflict: 'conversation_id,user_id' },
    );
    if (error) console.error('Typing:', error.message);
  }, [user?.id]);

  // Realtime has a 3s polling fallback for mobile Safari when WebSockets are suspended.
  useEffect(() => {
    if (!supabase || !user) return;
    let alive = true;
    const refresh = async () => {
      if (!alive || document.visibilityState === 'hidden') return;
      const [msgResult, statesResult] = await Promise.all([
        supabase.from('messages').select(MESSAGE_COLUMNS).order('created_at', { ascending: false }).limit(1000),
        supabase.from('conversation_user_state').select('conversation_id,user_id,last_read_at,typing_until'),
      ]);
      if (!alive) return;
      if (msgResult.error || statesResult.error) { setNotice(msgResult.error?.message || statesResult.error?.message || 'Ошибка обновления'); return; }
      const recent = (msgResult.data || []) as Message[];
      const states = statesResult.data || [];
      const newest: Record<string, Message> = {}; const counts: Record<string, number> = {};
      const serverRead: Record<string, string> = {};
      for (const row of states) if (row.user_id === user.id) serverRead[row.conversation_id] = row.last_read_at;
      for (const [id, at] of Object.entries(serverRead)) if (!readCache.current[id] || readCache.current[id] < at) readCache.current[id] = at;
      const current = activeChatRef.current;
      setTyping(Boolean(current && states.some(st => st.conversation_id === current && st.user_id !== user.id && st.typing_until && new Date(st.typing_until).getTime() > Date.now())));
      for (const m of recent) {
        if (!newest[m.conversation_id]) newest[m.conversation_id] = m;
        if (m.conversation_id !== current && m.sender_id !== user.id && m.created_at > (readCache.current[m.conversation_id] || '')) counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
      }
      setLatest(newest); setUnread(counts);
    };
    void refresh(); const interval = window.setInterval(() => { void refresh(); }, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') { void refresh(); void loadDirectory(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [user?.id, loadDirectory]);

  useEffect(() => {
    if (!supabase || !activeChat || !user) return;
    let alive = true;
    setMessages([]); setTyping(false); setMenuMessage(null);
    previousLast.current = ''; stickToBottom.current = true;
    const id = activeChat;
    void supabase.from('conversation_user_state').upsert({ conversation_id: id, user_id: user.id }, { onConflict: 'conversation_id,user_id', ignoreDuplicates: true });
    const refresh = async () => {
      if (!alive || document.visibilityState === 'hidden') return;
      const { data, error } = await supabase.from('messages').select(MESSAGE_COLUMNS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(500);
      if (!alive) return;
      if (error) { setNotice(error.message); return; }
      const incoming = ((data || []) as Message[]).reverse();
      setMessages(prev => prev.length === incoming.length && prev.every((m, i) =>
        m.id === incoming[i].id && m.body === incoming[i].body && m.edited_at === incoming[i].edited_at && m.deleted_at === incoming[i].deleted_at
      ) ? prev : incoming);
      const last = incoming.at(-1); if (last) void markRead(id, last.created_at);
    };
    void refresh();
    const channel = supabase.channel('connect-chat-' + id).on('postgres_changes', {
      event: '*', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + id,
    }, payload => {
      if (!alive || payload.eventType === 'DELETE') return;
      const m = payload.new as Message;
      if (!m?.id) return;
      setMessages(prev => {
        const exists = prev.some(x => x.id === m.id);
        return exists ? prev.map(x => x.id === m.id ? m : x) : [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
      if (payload.eventType === 'INSERT') void markRead(id, m.created_at);
    }).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const interval = window.setInterval(() => { void refresh(); }, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [activeChat, user?.id, markRead]);

  useEffect(() => {
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

  const contacts = profiles.filter(p => !p.is_blocked && p.id !== user?.id);
  const chats = conversations.map(c => ({
    ...c,
    other: profiles.find(p => p.id === (c.user_a === user?.id ? c.user_b : c.user_a)),
    last: latest[c.id], count: unread[c.id] || 0,
  })).sort((a, b) => (b.last?.created_at || b.created_at).localeCompare(a.last?.created_at || a.created_at));
  const selected = chats.find(c => c.id === activeChat);
  const currentName = selected?.other?.display_name || 'Собеседник';
  const filteredChats = chats.filter(c => (c.other?.display_name || '').toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU')));
  const filteredContacts = contacts.filter(p => p.display_name.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU')));
  const unreadTotal = Object.values(unread).reduce((sum, n) => sum + n, 0);

  function enterChat(id: string) { setActiveChat(id); setTab('chats'); setSearch(''); setReplyTo(null); setEditing(null); setDraft(''); setMenuMessage(null); }
  function exitChat() { setActiveChat(null); setReplyTo(null); setEditing(null); setDraft(''); setMenuMessage(null); setTyping(false); }
  function switchTab(t: Tab) { setTab(t); setSearch(''); setNotice(''); }
  async function openContact(p: Profile) {
    if (!supabase || !user || busy) return;
    setBusy(true); setNotice('');
    let chat = conversations.find(c => (c.user_a === user.id && c.user_b === p.id) || (c.user_b === user.id && c.user_a === p.id));
    if (!chat) {
      const [a, b] = [user.id, p.id].sort();
      const { data, error } = await supabase.from('conversations').upsert({ user_a: a, user_b: b }, { onConflict: 'user_a,user_b' }).select('id,user_a,user_b,created_at').single();
      if (error || !data) { setBusy(false); setNotice('Не удалось открыть чат: ' + (error?.message || 'Ошибка')); return; }
      chat = data as Conversation; setConversations(prev => [chat!, ...prev.filter(c => c.id !== chat!.id)]);
    }
    setBusy(false); enterChat(chat.id);
  }

  function startReply(m: Message) { setReplyTo(m); setEditing(null); setMenuMessage(null); inputRef.current?.focus(); }
  function startEdit(m: Message) { setEditing(m); setReplyTo(null); setDraft(m.body); setMenuMessage(null); inputRef.current?.focus(); }
  function cancelCompose() { setEditing(null); setReplyTo(null); setDraft(''); }
  async function copyText(m: Message) {
    try { await navigator.clipboard.writeText(m.body); setNotice('Текст скопирован'); }
    catch { setNotice('Не удалось скопировать текст'); }
    setMenuMessage(null);
  }
  async function deleteMessage(m: Message) {
    if (!supabase || !user || busy || m.sender_id !== user.id || m.deleted_at) return;
    setMenuMessage(null);
    if (!window.confirm('Удалить это сообщение у обоих участников?')) return;
    setBusy(true);
    const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id).eq('sender_id', user.id);
    setBusy(false);
    if (error) { setNotice('Не удалось удалить: ' + error.message); return; }
    setMessages(prev => prev.map(x => x.id === m.id ? { ...x, body: '', deleted_at: new Date().toISOString() } : x));
  }
  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user || !activeChat || !draft.trim() || busy) return;
    const body = draft.trim(); setBusy(true); setNotice('');
    if (editing) {
      const { error } = await supabase.from('messages').update({ body }).eq('id', editing.id).eq('sender_id', user.id);
      setBusy(false); if (error) { setNotice('Не удалось изменить: ' + error.message); return; }
      setMessages(prev => prev.map(m => m.id === editing.id ? { ...m, body, edited_at: new Date().toISOString() } : m));
      cancelCompose(); return;
    }
    const { data, error } = await supabase.from('messages').insert({ conversation_id: activeChat, sender_id: user.id, body, reply_to: replyTo?.id || null }).select(MESSAGE_COLUMNS).single();
    setBusy(false); if (error || !data) { setNotice('Не удалось отправить: ' + (error?.message || 'Ошибка')); return; }
    setDraft(''); setReplyTo(null); lastKeypress.current = 0; void updateTyping(activeChat, false);
    const m = data as Message;
    setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
    setLatest(prev => ({ ...prev, [activeChat]: m }));
    requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }

  function openMenu(m: Message, element: HTMLElement) {
    if (m.deleted_at) return;
    const rect = element.getBoundingClientRect(); const root = shellRef.current?.getBoundingClientRect();
    const height = root?.height || window.innerHeight;
    const optionsHeight = m.sender_id === user?.id ? 270 : 166;
    setMenuTop(Math.min(Math.max(76, rect.top - (root?.top || 0) - 14), Math.max(76, height - optionsHeight - 22)));
    setMenuMessage(m); setSwipe(null);
    try { if ('vibrate' in navigator) navigator.vibrate(9); } catch { /* iOS doesn't support vibration */ }
  }
  function clearGestureTimer() { if (gesture.current?.timer !== null && gesture.current?.timer !== undefined) window.clearTimeout(gesture.current.timer); if (gesture.current) gesture.current.timer = null; }
  function touchStart(e: TouchEvent<HTMLDivElement>, m: Message) {
    if (m.deleted_at || !e.touches[0]) return;
    clearGestureTimer(); const touch = e.touches[0]; const element = e.currentTarget;
    gesture.current = { id: m.id, x: touch.clientX, y: touch.clientY, dx: 0, dy: 0, opened: false, timer: window.setTimeout(() => {
      if (gesture.current?.id === m.id) { gesture.current.opened = true; openMenu(m, element); }
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
    const g = gesture.current; if (!g || g.id !== m.id) return;
    clearGestureTimer(); gesture.current = null; setSwipe(null);
    if (!g.opened && g.dx > 58 && g.dx > Math.abs(g.dy) * 1.3 && !m.deleted_at) startReply(m);
  }
  function bubbleKey(e: KeyboardEvent<HTMLDivElement>, m: Message) {
    if ((e.key === 'Enter' || e.key === ' ') && !m.deleted_at) { e.preventDefault(); openMenu(m, e.currentTarget); }
  }

  async function login(e: FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setBusy(true); setNotice(''); const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false); if (error) setNotice('Не удалось войти: ' + error.message);
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
    await supabase?.auth.signOut(); exitChat(); setProfiles([]); setConversations([]); setMessages([]);
    setLatest({}); setUnread({}); readCache.current = {}; setPassword(''); setNotice('');
  }

  const screenStyle: CSSProperties | undefined = frame ? { height: `${frame.height}px`, top: `${frame.top}px` } : undefined;
  return <div className={'connect-app ' + theme} ref={shellRef} style={screenStyle}>
    {!supabase ? <div className="connection-error"><Icon name="info" size={32}/><h2>Подключение не настроено</h2><p>Проверьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY в Vercel.</p></div>
      : loading ? <div className="loading-screen"><img src="/icon-192.png" alt=""/><p>Подключаем Connect…</p></div>
        : !user || setup ? <div className="login-screen">
          <div className="login-brand"><img src="/icon-192.png" alt=""/><h1>Connect</h1><p>Личные разговоры. Только свои.</p></div>
          <form className="login-form" onSubmit={setup ? savePassword : login}>
            <h2>{setup ? 'Создать пароль' : 'Вход в Connect'}</h2>
            {setup ? <input className="field" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Новый пароль (от 8 символов)"/>
              : <><input className="field" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Электронная почта"/><input className="field" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Пароль"/></>}
            <button className="primary-action" disabled={busy} type="submit">{busy ? 'Подключение…' : setup ? 'Сохранить пароль' : 'Войти'}</button>
            <p className="login-hint">Вход доступен только участникам с учётной записью.</p>
          </form>
        </div>
          : activeChat && selected ? <div className="chat-view">
            <header className="chat-header">
              <button type="button" className="icon-btn back-btn" onClick={exitChat} aria-label="Назад к чатам"><Icon name="back" size={28}/></button>
              <Avatar name={currentName} id={selected.other?.id}/>
              <div className="chat-header-person"><strong>{currentName}</strong><small className={typing ? 'typing-label' : ''}>{typing ? 'печатает…' : 'Личный чат'}</small></div>
            </header>
            <div className="message-scroll" ref={scrollRef} onScroll={trackScroll} aria-label="История сообщений">
              <div className="message-stream">
                {messages.length === 0 ? <div className="empty-chat"><Icon name="message" size={32}/><span>Напишите первое сообщение</span></div> : messages.map(m => {
                  const mine = m.sender_id === user.id;
                  const replied = m.reply_to ? messages.find(x => x.id === m.reply_to) : undefined;
                  return <div key={m.id} className={'message-row ' + (mine ? 'outgoing' : 'incoming')}>
                    {swipe?.id === m.id && <span className="swipe-reply-icon"><Icon name="reply" size={22}/></span>}
                    <div className={'bubble ' + (mine ? 'sent' : 'received') + (m.deleted_at ? ' removed' : '')}
                      style={{ transform: `translate3d(${swipe?.id === m.id ? swipe.offset : 0}px,0,0)` }}
                      onTouchStart={e => touchStart(e, m)} onTouchMove={e => touchMove(e, m)}
                      onTouchEnd={() => touchEnd(m)} onTouchCancel={() => { clearGestureTimer(); gesture.current = null; setSwipe(null); }}
                      onContextMenu={e => { e.preventDefault(); openMenu(m, e.currentTarget); }}
                      onKeyDown={e => bubbleKey(e, m)} tabIndex={m.deleted_at ? -1 : 0}
                      role={m.deleted_at ? undefined : 'button'} aria-label={m.deleted_at ? 'Сообщение удалено' : 'Удерживайте, чтобы открыть действия с сообщением'}>
                      {m.reply_to && <div className="quote-box"><strong>{replied?.sender_id === user.id ? 'Вы' : currentName}</strong><span>{!replied ? 'Исходное сообщение' : replied.deleted_at ? 'Сообщение удалено' : replied.body}</span></div>}
                      <div className="bubble-body">{m.deleted_at ? 'Сообщение удалено' : m.body}</div>
                      <div className="bubble-meta">{m.edited_at && !m.deleted_at && <span>изменено · </span>}{timeLabel(m.created_at)}</div>
                    </div>
                  </div>;
                })}
              </div>
            </div>
            <form className="chat-composer" onSubmit={sendMessage}>
              {(replyTo || editing) && <div className="compose-context"><div className="context-stripe"/><div className="compose-context-text"><strong>{editing ? 'Редактирование' : `Ответ: ${replyTo?.sender_id === user.id ? 'Вы' : currentName}`}</strong><span>{editing?.body || replyTo?.body}</span></div><button type="button" className="icon-btn dismiss-context" onClick={cancelCompose} aria-label="Отменить"><Icon name="close" size={20}/></button></div>}
              <div className="compose-line"><input ref={inputRef} type="text" autoComplete="off" enterKeyHint="send" aria-label="Сообщение" maxLength={10000} value={draft} onChange={e => changeDraft(e.target.value)} placeholder={editing ? 'Изменить сообщение…' : 'Сообщение…'}/><button className="send-button" type="submit" disabled={busy || !draft.trim()} aria-label={editing ? 'Сохранить' : 'Отправить'}><Icon name={editing ? 'check' : 'send'} size={23}/></button></div>
            </form>
          </div>
            : <><div className="main-view">
              {tab === 'chats' && <>
                <header className="home-header"><div className="home-brand"><img src="/icon-192.png" alt=""/><h1>Connect</h1></div><button type="button" className="icon-btn new-chat" aria-label="Начать новый чат" onClick={() => switchTab('contacts')}><Icon name="write" size={24}/></button></header>
                <div className="section-heading"><h2>Чаты</h2>{unreadTotal > 0 && <span className="heading-count">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}</div>
                <div className="search-field"><Icon name="search" size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск по чатам" aria-label="Поиск по чатам"/></div>
                <div className="scroll-content chat-rows">
                  {filteredChats.length === 0 ? <div className="empty-state"><Icon name="chats" size={38}/><strong>{search ? 'Ничего не найдено' : 'Пока нет переписок'}</strong><span>{search ? 'Попробуйте другое имя' : 'Откройте «Контакты» и начните разговор'}</span></div>
                    : filteredChats.map(c => <button type="button" className="dialog-row" key={c.id} onClick={() => enterChat(c.id)}><Avatar name={c.other?.display_name || 'Собеседник'} id={c.other?.id}/><div className="dialog-summary"><strong>{c.other?.display_name || 'Собеседник'}</strong><span>{messagePreview(c.last, user.id)}</span></div><div className="dialog-meta"><time>{listTimeLabel(c.last?.created_at || c.created_at)}</time>{c.count > 0 && <span className="unread-pill">{c.count > 99 ? '99+' : c.count}</span>}</div></button>)}
                </div>
              </>}
              {tab === 'contacts' && <>
                <header className="simple-header"><h1>Контакты</h1><span className="subtle-counter">{contacts.length}</span></header>
                <div className="search-field"><Icon name="search" size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Поиск контактов" aria-label="Поиск контактов"/></div>
                <div className="section-caption">МОИ КОНТАКТЫ</div>
                <div className="scroll-content contact-rows">
                  {filteredContacts.length === 0 ? <div className="empty-state"><Icon name="contacts" size={38}/><strong>{search ? 'Контакт не найден' : 'Контактов пока нет'}</strong><span>{search ? 'Попробуйте другое имя' : 'Контакты появятся после приглашения участников'}</span></div>
                    : filteredContacts.map(p => <button type="button" className="contact-row" key={p.id} disabled={busy} onClick={() => void openContact(p)}><Avatar name={p.display_name} id={p.id}/><span className="contact-text"><strong>{p.display_name}</strong><small>Написать сообщение</small></span><Icon name="chevron" size={19}/></button>)}
                </div>
              </>}
              {tab === 'settings' && <>
                <header className="simple-header"><h1>Настройки</h1></header>
                <div className="scroll-content settings-content"><div className="settings-profile"><Avatar size="lg" name={user.email?.split('@')[0] || 'Мой профиль'} id={user.id}/><div><strong>{profiles.find(p => p.id === user.id)?.display_name || 'Мой профиль'}</strong><span>{user.email}</span></div></div>
                  <h3>Оформление</h3><div className="settings-group"><div className="settings-theme"><span className="setting-icon"><Icon name={theme === 'dark' ? 'moon' : 'sun'} size={19}/></span><div><strong>Тема приложения</strong><small>Удобная для чтения</small></div></div><div className="theme-buttons"><button type="button" className={theme === 'dark' ? 'current' : ''} onClick={() => changeTheme('dark')}>Тёмная</button><button type="button" className={theme === 'light' ? 'current' : ''} onClick={() => changeTheme('light')}>Светлая</button></div></div>
                  <h3>Приложение</h3><div className="settings-group"><div className="settings-static"><span className="setting-icon"><Icon name="shield" size={19}/></span><div><strong>Личные переписки</strong><small>Диалоги доступны их участникам</small></div></div><div className="setting-divider"/><div className="settings-static"><span className="setting-icon"><Icon name="info" size={19}/></span><div><strong>О Connect</strong><small>Версия 1.0 · Интерфейс iPhone</small></div></div></div>
                  <button type="button" className="logout-button" onClick={() => void logout()}><Icon name="logout" size={20}/> Выйти из аккаунта</button>
                </div>
              </>}
            </div><nav className="bottom-nav" aria-label="Основная навигация">
              {([{ id: 'chats' as const, label: 'Чаты', icon: 'chats' as const }, { id: 'contacts' as const, label: 'Контакты', icon: 'contacts' as const }, { id: 'settings' as const, label: 'Настройки', icon: 'settings' as const }]).map(item => <button type="button" key={item.id} className={'nav-tab' + (tab === item.id ? ' selected' : '')} onClick={() => switchTab(item.id)}><span className="nav-symbol"><Icon name={item.icon} size={24}/>{item.id === 'chats' && unreadTotal > 0 && <em className="nav-dot"/>}</span><small>{item.label}</small></button>)}
            </nav></>}
    {notice && <button type="button" className="notice-toast" role="status" onClick={() => setNotice('')}>{notice} <Icon name="close" size={16}/></button>}
    {menuMessage && <div className="context-overlay" role="presentation"><button className="context-backdrop" aria-label="Закрыть меню" type="button" onClick={() => setMenuMessage(null)}/><div className="floating-menu" role="dialog" aria-modal="true" aria-label="Действия с сообщением" style={{ top: `${menuTop}px` }}>
      <button type="button" onClick={() => startReply(menuMessage)}><Icon name="reply" size={23}/>Ответить</button>
      {menuMessage.sender_id === user?.id && <button type="button" onClick={() => startEdit(menuMessage)}><Icon name="edit" size={22}/>Редактировать</button>}
      <button type="button" onClick={() => void copyText(menuMessage)}><Icon name="copy" size={22}/>Скопировать текст</button>
      {menuMessage.sender_id === user?.id && <><div className="menu-separator"/><button type="button" className="destructive" onClick={() => void deleteMessage(menuMessage)}><Icon name="trash" size={22}/>Удалить у всех</button></>}
    </div></div>}
  </div>;
}
