'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import * as tus from 'tus-js-client';

export type ProfileMediaKind = 'photos' | 'videos' | 'music';

type MediaItem = { path: string; name: string; mime: string; url: string; createdAt: string };
type Props = {
  client: SupabaseClient;
  userId: string;
  kind: ProfileMediaKind;
  onBack: () => void;
  onAvatar: (file: File) => void;
  isOwner: boolean;
};

const BUCKET = 'connect-profile-media';
const TITLES: Record<ProfileMediaKind, string> = { photos: 'Мои фото', videos: 'Мои видео', music: 'Моя музыка' };
const ACCEPT: Record<ProfileMediaKind, string> = {
  photos: 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif',
  videos: 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm',
  music: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/flac,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac',
};
const EXTENSIONS: Record<ProfileMediaKind, string[]> = {
  photos: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  videos: ['mp4', 'mov', 'webm'],
  music: ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'flac', 'webm'],
};
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
  ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
};
const MAX_SIZE = 100 * 1024 * 1024;

// Keep signed audio/video/image requests on the working same-origin proxy
// when Connect is opened through its alternate DuckDNS domain.
function playbackUrl(url: string) {
  if (typeof window === 'undefined' || window.location.hostname !== 'connect-chat.duckdns.org') return url;
  const root = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  try {
    const source = new URL(url);
    const base = new URL(root);
    if (source.hostname === base.hostname) return `${window.location.origin}/supabase${source.pathname}${source.search}${source.hash}`;
    if (source.hostname === base.hostname.replace(/\.supabase\.co$/, '.storage.supabase.co'))
      return `${window.location.origin}/supabase-storage${source.pathname}${source.search}${source.hash}`;
  } catch { /* Signed URL may already be relative. */ }
  return url;
}

function extension(name: string) { return name.split('.').pop()?.toLowerCase() || ''; }
function validFile(file: File, kind: ProfileMediaKind) {
  return EXTENSIONS[kind].includes(extension(file.name)) && file.size > 0 && file.size <= MAX_SIZE;
}
function encodeName(name: string) {
  const ext = extension(name);
  const clipped = name.length <= 70 ? name : name.slice(0, 68 - ext.length) + '.' + ext;
  const bytes = new TextEncoder().encode(clipped);
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function decodeName(name: string) {
  const suffix = name.split('~').slice(1).join('~');
  const encoded = suffix.replace(/\.[^.]*$/, '');
  if (!encoded) return name;
  try {
    const raw = atob(encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4));
    return new TextDecoder().decode(Uint8Array.from(raw, char => char.charCodeAt(0)));
  } catch { return name; }
}
function bytesLabel(size: number) { return `${(size / 1024 / 1024).toFixed(1)} МБ`; }

export default function ConnectProfileMedia({ client, userId, kind, onBack, onAvatar, isOwner }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedSong, setSelectedSong] = useState<string | null>(null);
  const [preview, setPreview] = useState<MediaItem | null>(null);
  const directory = `${userId}/${kind}`;
  const heading = isOwner ? TITLES[kind] : ({ photos: 'Фото', videos: 'Видео', music: 'Музыка' } as const)[kind];

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: listError } = await client.storage.from(BUCKET).list(`${userId}/${kind}`, {
      limit: 100, sortBy: { column: 'created_at', order: 'desc' },
    });
    if (listError) {
      setError('Не удалось открыть медиатеку: ' + listError.message);
      setLoading(false);
      return;
    }
    const files = (data || []).filter(row => row.id && row.name);
    const resolved = await Promise.all(files.map(async row => {
      const path = `${userId}/${kind}/${row.name}`;
      const signed = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (!signed.data?.signedUrl) return null;
      const name = decodeName(row.name);
      const ext = extension(name);
      return { path, name, mime: MIME[ext] || 'application/octet-stream', url: playbackUrl(signed.data.signedUrl),
        createdAt: row.created_at || '' } as MediaItem;
    }));
    setItems(resolved.filter((item): item is MediaItem => item !== null));
    setLoading(false);
  }, [client, userId, kind]);

  useEffect(() => { void load(); }, [load]);

  async function upload(files: File[]) {
    if (!isOwner || busy || !files.length) return;
    if (files.length > 12) { setError('За один раз можно загрузить до 12 файлов.'); return; }
    setError(''); setNotice(''); setBusy(true);
    let completed = 0;
    try {
      for (const file of files) {
        if (!validFile(file, kind)) throw new Error(`Неподдерживаемый формат или размер: ${file.name}. Максимум ${bytesLabel(MAX_SIZE)}.`);
        const ext = extension(file.name);
        const path = `${directory}/${Date.now()}-${crypto.randomUUID()}~${encodeName(file.name)}.${ext}`;
        const contentType = kind === 'music' && ext === 'webm' ? 'audio/webm' : MIME[ext] || file.type || 'application/octet-stream';
        setUploadProgress(0);
        if (file.size <= 6 * 1024 * 1024) {
          const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, {
            contentType, upsert: false,
          });
          if (uploadError) throw uploadError;
        } else {
          const { data: { session } } = await client.auth.getSession();
          if (!session) throw new Error('Сессия завершена. Войдите снова.');
          const root = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
          const proxy = window.location.hostname === 'connect-chat.duckdns.org';
          const endpoint = proxy
            ? `${window.location.origin}/supabase-storage/storage/v1/upload/resumable`
            : `${root.replace('.supabase.co', '.storage.supabase.co')}/storage/v1/upload/resumable`;
          await new Promise<void>((resolve, reject) => {
            const request = new tus.Upload(file, {
              endpoint,
              retryDelays: [0, 3000, 5000, 10000, 20000],
              headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'false' },
              uploadDataDuringCreation: true,
              removeFingerprintOnSuccess: true,
              metadata: { bucketName: BUCKET, objectName: path, contentType },
              chunkSize: 6 * 1024 * 1024,
              onError: reject, onSuccess: () => resolve(),
              onProgress: (done, total) => setUploadProgress(Math.round(done / total * 100)),
            });
            request.start();
          });
        }
        completed++;
      }
      setNotice(completed === 1 ? 'Файл добавлен.' : `Загружено файлов: ${completed}.`);
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)) + (completed ? ` · Успешно загружено: ${completed}` : ''));
    } finally {
      setBusy(false); setUploadProgress(null); await load();
    }
  }

  async function remove(item: MediaItem) {
    if (!isOwner || busy || !window.confirm(`Удалить «${item.name}» из своей медиатеки?`)) return;
    setBusy(true); setError('');
    try {
      const { error: removeError } = await client.storage.from(BUCKET).remove([item.path]);
      if (removeError) throw removeError;
      if (selectedSong === item.path) setSelectedSong(null);
      if (preview?.path === item.path) setPreview(null);
      setNotice('Файл удалён.');
    } catch (e) { setError('Не удалось удалить: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); await load(); }
  }

  async function makeAvatar(item: MediaItem) {
    if (!isOwner || busy || !['image/jpeg', 'image/png', 'image/webp'].includes(item.mime)) return;
    setBusy(true); setError('');
    try {
      const { data, error: downloadError } = await client.storage.from(BUCKET).download(item.path);
      if (downloadError || !data) throw downloadError || new Error('Не удалось прочитать фотографию');
      onAvatar(new File([data], item.name, { type: item.mime }));
    } catch (e) { setError('Не удалось открыть редактор аватара: ' + (e instanceof Error ? e.message : String(e))); }
    finally { setBusy(false); }
  }

  const song = items.find(item => item.path === selectedSong) || items[0];
  return <>
    <header className="profile-top"><button type="button" className="icon-btn" onClick={onBack} aria-label="Вернуться в мой профиль"><span aria-hidden="true" style={{ fontSize: 30, lineHeight: 1 }}>‹</span></button><strong>{heading}</strong></header>
    <div className="connect-profile-media-page">
      <div className="connect-profile-media-toolbar">
        <div><strong>{heading}</strong><small>{isOwner ? 'Медиатека профиля' : 'Медиа пользователя'} · {items.length} файлов</small></div>
        {isOwner && <><button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>+ Добавить</button>
        <input ref={inputRef} type="file" accept={ACCEPT[kind]} multiple hidden onChange={e => {
          const files = Array.from(e.currentTarget.files || []);
          e.currentTarget.value = '';
          void upload(files);
        }}/></>}
      </div>
      {busy && <div className="connect-profile-media-info" role="status">Загрузка или обработка файла…{uploadProgress !== null ? ` ${uploadProgress}%` : ''}</div>}
      {error && <div className="connect-profile-media-error" role="alert">{error}</div>}
      {notice && <div className="connect-profile-media-info" role="status">{notice}</div>}
      {loading ? <div className="connect-profile-media-empty">Загружаем медиатеку…</div> : items.length === 0 ? <div className="connect-profile-media-empty">{isOwner ? <>Здесь пока пусто. Нажми «Добавить», чтобы загрузить {kind === 'photos' ? 'фотографии' : kind === 'videos' ? 'видео' : 'музыку'}.</> : 'Пользователь ещё ничего не добавил.'}</div> : <>
        {kind === 'photos' && <div className="connect-profile-photo-grid">{items.map(item => <article key={item.path} className="connect-profile-media-item">
          <button type="button" className="connect-profile-photo-thumb" onClick={() => setPreview(item)} aria-label={`Открыть ${item.name}`}><img loading="lazy" src={item.url} alt={item.name}/></button>
          <div className="connect-profile-media-item-caption" title={item.name}>{item.name}</div>
          {isOwner && <div className="connect-profile-media-item-actions"><button type="button" disabled={busy || !['image/jpeg','image/png','image/webp'].includes(item.mime)} onClick={() => void makeAvatar(item)}>На аватар</button><button type="button" disabled={busy} onClick={() => void remove(item)}>Удалить</button></div>}
        </article>)}</div>}
        {kind === 'videos' && <div className="connect-profile-video-list">{items.map(item => <article key={item.path} className="connect-profile-media-item">
          <video src={item.url} playsInline controls preload="metadata" className="connect-profile-video-player" aria-label={item.name}/>
          <div className="connect-profile-media-item-info"><strong title={item.name}>{item.name}</strong>{isOwner && <button type="button" disabled={busy} onClick={() => void remove(item)}>Удалить</button>}</div>
        </article>)}</div>}
        {kind === 'music' && <>
          {song && <div className="connect-profile-music-player"><small>Сейчас выбрано</small><strong>{song.name}</strong><audio key={song.path} src={song.url} controls preload="metadata" aria-label={`Прослушать ${song.name}`}/></div>}
          <div className="connect-profile-track-list">{items.map((item, index) => <div key={item.path} className={'connect-profile-track' + (song?.path === item.path ? ' selected' : '')}>
            <button type="button" className="connect-profile-track-select" onClick={() => setSelectedSong(item.path)} aria-label={`Выбрать трек ${item.name}`}><span aria-hidden="true">♪</span><span><strong>{item.name}</strong><small>Трек {index + 1}</small></span></button>
            {isOwner && <button type="button" disabled={busy} className="connect-profile-track-delete" onClick={() => void remove(item)} aria-label={`Удалить ${item.name}`}>Удалить</button>}
          </div>)}</div>
        </>}
      </>}
      <p className="connect-profile-media-hint">{isOwner ? 'Медиа доступны другим участникам Connect при просмотре твоего профиля. Максимум 100 МБ на файл.' : 'Медиа этого пользователя доступны для просмотра и прослушивания только участникам Connect.'}</p>
    </div>
    {preview && <div className="connect-profile-photo-overlay" role="dialog" aria-modal="true" aria-label="Просмотр фотографии" onClick={() => setPreview(null)}>
      <button type="button" className="connect-profile-photo-close" onClick={() => setPreview(null)}>Закрыть</button>
      <img src={preview.url} alt={preview.name} onClick={e => e.stopPropagation()}/>
      {isOwner && <button type="button" disabled={busy || !['image/jpeg','image/png','image/webp'].includes(preview.mime)} onClick={e => { e.stopPropagation(); void makeAvatar(preview); setPreview(null); }}>Сделать аватаром</button>}
    </div>}
  </>;
}