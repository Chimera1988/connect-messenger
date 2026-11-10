'use client';
import { useEffect, useState } from 'react';
import { cacheStats, clearCachedMedia, cacheLimit, setCacheLimit, type CacheCategory } from '../lib/media-cache';
import { chatHistoryStats, wipeUserHistory } from '../lib/chat-history-cache';
const names: Record<CacheCategory, string> = { system: 'Системные элементы и аватары', photos: 'Фотографии и стикеры', videos: 'Видео и видеокружки', audio: 'Голосовые и аудиофайлы', other: 'Прочие временные файлы' };
function LocalHistoryCache({userId}:{userId:string}){
  const [info,setInfo]=useState<{chats:number;messages:number;bytes:number}|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;void chatHistoryStats(userId).then(v=>{if(active)setInfo(v)}).catch(()=>{});return()=>{active=false;};},[userId]);
  return <div className="connect-cache-row"><span>История переписок (локально)<small>{info?`${info.chats} чатов · ${info.messages} сообщений · ${Math.ceil(info.bytes/1024)} КБ`:'…'} — на сервере история не изменится</small></span><button type="button" disabled={busy||!info?.chats} onClick={()=>{
    if(!window.confirm('Очистить локальные копии переписок? Они снова загрузятся из Supabase.'))return;
    setBusy(true);void wipeUserHistory(userId).then(()=>chatHistoryStats(userId)).then(setInfo).catch(()=>{}).finally(()=>setBusy(false));
  }}>Очистить</button></div>;
}
const size = (n: number) => n < 1024 ** 2 ? (n / 1024).toFixed(0) + ' КБ' : (n / 1024 ** 2).toFixed(1) + ' МБ';
export default function CacheSettings({userId}:{userId:string}) {
    const [stats, setStats] = useState<Record<CacheCategory, number> | null>(null), [limit, setLimit] = useState('auto'), [problem, setProblem] = useState(''), [busy, setBusy] = useState(false);
    useEffect(() => { let active = true; void cacheStats().then(v => { if (active)
        setStats(v); }).catch(() => { if (active)
        setProblem('Хранилище временно недоступно'); }); setLimit(cacheLimit()); return () => { active = false; }; }, []);
    async function clear(category: CacheCategory | 'temporary') { if (!confirm('Очистить ' + (category === 'temporary' ? 'временные файлы' : names[category]) + '? Медиа загрузятся снова по необходимости.'))
        return; setBusy(true); try {
        await clearCachedMedia(category);
        setStats(await cacheStats());
        setProblem('');
    }
    catch {
        setProblem('Не удалось очистить кеш. Повторите действие.');
    }
    finally {
        setBusy(false);
    } }
    return <div className="settings-group data-settings connect-cache-settings"><strong>Управление кешем</strong><LocalHistoryCache userId={userId}/><p className="settings-hint">Ключи, авторизация, история, черновики и настройки хранятся отдельно. Ресурсы интерфейса и актуальные аватары сохраняются при обычной очистке. Браузер может удалить локальные данные при нехватке места.</p><p>Всего: {stats ? size(Object.values(stats).reduce((a, b) => a + b, 0)) : '…'}</p>{(Object.keys(names) as CacheCategory[]).map(category => <div className="connect-cache-row" key={category}><span>{names[category]}<small>{stats ? size(stats[category]) : '…'}</small></span>{category !== 'system' && <button type="button" disabled={busy || !stats?.[category]} onClick={() => void clear(category)}>Очистить</button>}</div>)}<label>Лимит временных файлов <select value={limit} onChange={e => { setLimit(e.target.value); setCacheLimit(e.target.value); void cacheStats().then(setStats); }}><option value="500">500 МБ</option><option value="1000">1 ГБ</option><option value="2000">2 ГБ</option><option value="auto">Автоматически</option></select></label><button type="button" className="settings-action secondary" disabled={busy} onClick={() => void clear('temporary')}>Очистить временные файлы</button>{problem && <p role="alert">{problem}</p>}</div>;
}
