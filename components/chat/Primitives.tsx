'use client';
import type { IconName } from '../../lib/chat/model';


function Icon({ name, size = 22, stroke = 1.9 }: { name: IconName; size?: number; stroke?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: stroke, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<IconName, React.ReactNode> = {
    chats: <><path d="M4.6 9.8c-1.7 1.5-2.3 3.9-1.5 6.1.3.8.7 1.4 1.2 2l-1 2.6 3.1-.9c1.1.5 2.2.6 3.3.5"/><path d="M12.7 3.3c4.2 0 7.6 3.3 7.6 7.4 0 1.5-.4 2.9-1.1 4.1l.9 3.5-3.5-1.1c-1.2.7-2.6 1.1-4 1.1-4.2 0-7.6-3.3-7.6-7.6s3.4-7.4 7.7-7.4Z"/></>,
    contacts: <><circle cx="7.7" cy="8.2" r="2.3"/><circle cx="16.2" cy="7.9" r="2.55"/><path d="M3.1 18.7v-.6c0-2.7 2.1-4.6 4.6-4.6 1.1 0 2.1.3 2.9.9"/><path d="M11.3 19.3v-.7c0-2.8 2.2-4.7 4.9-4.7s4.9 1.9 4.9 4.7v.7h-9.8Z"/></>,
    settings: <><path d="M10.4 2.4h3.2l.65 2.2c.64.2 1.25.46 1.8.78l2.1-.97 2.25 2.25-.98 2.08c.32.56.58 1.16.77 1.8l2.21.66v3.2l-2.21.65c-.19.65-.45 1.25-.77 1.81l.98 2.08-2.25 2.25-2.1-.97c-.55.32-1.16.58-1.8.77l-.65 2.21h-3.2l-.65-2.21c-.64-.19-1.25-.45-1.81-.77l-2.08.97-2.25-2.25.97-2.08c-.32-.56-.58-1.16-.77-1.81l-2.21-.65v-3.2l2.21-.66c.19-.64.45-1.24.77-1.8l-.97-2.08 2.25-2.25 2.08.97c.56-.32 1.17-.58 1.81-.78z"/><circle cx="12" cy="12.8" r="2.9"/></>,
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
    camera: <><path d="M3.6 7h3.1l1.7-2.5h7.2L17.3 7h3.1c.85 0 1.5.65 1.5 1.5v10.4c0 .9-.65 1.6-1.5 1.6H3.6c-.85 0-1.5-.7-1.5-1.6V8.5c0-.85.65-1.5 1.5-1.5Z"/><circle cx="12" cy="13.4" r="3.65"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    smile: <><circle cx="12" cy="12" r="9.1"/><circle cx="8.4" cy="9.6" r="1" fill="currentColor" stroke="none"/><circle cx="15.6" cy="9.6" r="1" fill="currentColor" stroke="none"/><path d="M7.8 14.2h8.4c-.7 2.35-2.25 3.8-4.2 3.8s-3.5-1.45-4.2-3.8Z" fill="currentColor" stroke="none"/></>,
    plus: <path d="M12 3.4v17.2M3.4 12h17.2"/>,
    mic: <><rect x="9.2" y="2" width="5.6" height="13.2" rx="2.8"/><path d="M5.3 10.2v1.2a6.7 6.7 0 0 0 13.4 0v-1.2M12 18v4m-3.7 0h7.4"/></>,
    stop: <rect x="5" y="5" width="14" height="14" rx="3"/>,
    file: <><path d="M6 2h8l5 5v15H6zM14 2v5h5"/></>,
    play: <path d="m8 5 11 7-11 7z"/>,
    dots: <><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></>,
    forward: <><path d="M13 5l7 7-7 7M20 12H9a5 5 0 0 0-5 5v2"/></>,
    message: <><path d="M20 11.4a7.5 7.5 0 0 1-7.9 7.5 8.2 8.2 0 0 1-3.3-.7L4 20l1.2-4.5A7.6 7.6 0 1 1 20 11.4Z"/><path d="M8 11h8"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...common}>{paths[name]}</svg>;
}


const avatarColors = ['#2369b1', '#985ab2', '#b56e48', '#327e89', '#6c73b7', '#599467'];

function Avatar({ name, id, size = 'md', url }: { name: string; id?: string; size?: 'sm' | 'md' | 'lg'; url?: string }) {
  let seed = 0; for (const char of id || name) seed += char.charCodeAt(0);
  const color = avatarColors[seed % avatarColors.length];
  return <span className={'person-avatar avatar-' + size} style={{ background: `linear-gradient(140deg,${color},#1b283d)` }} aria-hidden="true">{url ? <img src={url} alt="" loading="lazy"/> : (Array.from(name.trim())[0]?.toLocaleUpperCase('ru-RU') || '?')}</span>;
}

// CONNECT_PWA_ONLINE_BADGES_V1_20261114: reuse the chat header presence lease.
// Offline/native entries render the original Avatar without an extra wrapper.
function PresenceAvatar({ name, id, url, online }: { name:string; id?:string; url?:string; online:boolean }) {
  if (!online) return <Avatar name={name} id={id} url={url}/>;
  return <span className="connect-presence-avatar"><Avatar name={name} id={id} url={url}/><span className="connect-presence-dot" role="img" aria-label="В сети"/></span>;
}

function MessageChecks({delivered,read}:{delivered:boolean;read:boolean}){
  return <span className={'delivery-checks'+(read?' is-read':'')} aria-label={read?'Прочитано':delivered?'Доставлено':'Отправлено'}>
    <svg viewBox="0 0 22 16" width="19" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="m2 8 4 4 7-8"/>{delivered&&<path d="m8 8 4 4 8-9"/>}</svg>
  </span>;
}
export { Avatar,avatarColors,Icon,MessageChecks,PresenceAvatar };
