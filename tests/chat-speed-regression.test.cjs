const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const page=require('./helpers/app-source.cjs')();
const cache=fs.readFileSync('lib/media-cache.ts','utf8');
const css=fs.readFileSync('app/globals.css','utf8');

test('chat has a single integrated performance patch without dropping the existing security/access layer',()=>{
  assert(page.includes('prefetchStickerWebp')&&page.includes('prefetchChatAudio')&&page.includes('VoicePlayer'));
  assert(page.includes('connect-delete-forever'));
  assert(page.includes('connect-sticker-webp-convert'));
});
test('sticker metadata is presented before all remote signatures finish; cache persists stable paths',()=>{
  assert(page.includes('stickerPriority.current.has'));
  assert(page.includes("resolveCachedMedia(identity,viewer)"));
  assert(page.includes("prefetchStickerWebp(signed,viewer)"));
  assert(!page.includes('await Promise.all(items.map(async st=>{const {data}='));
  assert(page.includes('setStickerCatalogReady(true)'));
  assert(cache.includes("id?.startsWith('connect-stickers/')"));
  assert(cache.includes('await remember(url,user,2*1024*1024,false)'));
  assert(css.includes('.connect-sticker-loading'));
});
test('voice playback is not starved by eager waveform decoding or eager metadata requests',()=>{
  const player=fs.readFileSync('components/chat/VoicePlayer.tsx','utf8');
  assert(player.includes('preload="none"'));
  assert(!player.includes('new AudioContext()'));
  assert(!player.includes('await fetch(src, { signal: controller.signal })'));
  assert(player.includes("refreshMediaUrl(identity)"));
  assert(player.includes('setBuffering(true)'));
  assert(player.includes('Загружаю аудио'));
  assert(player.includes('await audio.play()'));
});
test('Android signs media progressively rather than blocking all attachments with Promise.all',()=>{
  const start=page.indexOf('// Android also needs progressive, bounded signing');
  assert(start>=0);
  const section=page.slice(start,page.indexOf('if(!activeChat||historyReadyChat!==activeChat)return;',start));
  assert(section.includes('setAttachmentUrls(prev=>prev[path]?prev:'));
  assert(section.includes('Math.min(4,missing.length)'));
  assert(!section.includes('Promise.all(missing.map(async'));
  assert(section.includes('prefetchChatAudio'));
});
test('text is shown immediately and failed send restores draft; server id replaces temporary id',()=>{
  const begin=page.indexOf('async function sendMessage(e: FormEvent)');
  assert(begin>=0);
  const chunk=page.slice(begin,page.indexOf('// CONNECT_PWA_CHAT_MEDIA_ENTRY_V2',begin));
  assert(chunk.indexOf('setMessages(prev=>[...prev,optimistic]')>=0);
  assert(chunk.indexOf('setMessages(prev=>[...prev,optimistic]')<chunk.indexOf("deliverMessage(supabase,"));
  assert(chunk.includes('setDraft(current=>current||body)'));
  assert(chunk.includes('const without=prev.filter(x=>x.id!==tempId)'));
  assert(page.includes("m.id.startsWith('local-')"));
  assert(page.includes('const replaceOptimistic=optimistic&&'));
});
test('media prefetch stays size-limited and isolated to per-user stable keys',()=>{
  assert(cache.includes('export async function prefetchChatAudio('));
  assert(cache.includes('declaredSize>1024*1024'));
  assert(cache.includes("id?.startsWith('connect-attachments/')"));
  assert(cache.includes('const key = user + \':\' + id'));
});
test('browser cache never evicts a valid blob on a synthetic premature image error',()=>{
  assert(cache.includes('CONNECT_PWA_MEDIA_CACHE_NATIVE_IMAGE_ERRORS_FIX3_20261115'));
  assert(!cache.includes("el.dispatchEvent(new Event('error'))"));
  assert(cache.includes("document.addEventListener('error', failed, true)"));
  assert(cache.includes("if (originals.has(el.src)) await clearCachedMedia('temporary', id)"));
});
