const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const src=require('./helpers/app-source.cjs')();
const css=fs.readFileSync('app/globals.css','utf8');

test('iOS sticker uploads use a direct native file input, not an async synthetic click',()=>{
  const marker='CONNECT_PWA_STICKER_PICKER_IOS_FIX_20261115';
  assert(src.includes(marker), 'iOS picker patch marker missing');
  assert(!src.includes("setTimeout(()=>document.getElementById('connect-sticker-upload')"), 'Old asynchronous file picker still present');
  assert(!src.includes('type="file"\n                        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg" multiple hidden'), 'Old hidden picker still present');
  assert(src.includes('<label className={\'settings-action connect-sticker-upload-action\''));
  assert(src.includes('className="connect-sticker-upload-input"'));
  assert(src.includes('accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"'));
  assert(src.includes('multiple disabled={busy}'));
  assert(css.includes('.connect-sticker-upload-input{position:absolute;inset:0;'));
  assert(css.includes('opacity:0;cursor:pointer;z-index:1;'));
});

test('each pack receives the files actually chosen, and FileList is copied before input reset',()=>{
  assert(src.includes('async function uploadCustomStickers(packId:string,files:File[])'));
  assert(src.includes('const pack=customPacks.find(p=>p.id===packId);'));
  assert(src.includes('const selected=Array.from(input.files||[]);'));
  assert(src.includes("input.value='';\n                            if(selected.length)void uploadCustomStickers(p.id,selected);"));
  assert(!src.includes('if(!supabase||!user||!customPack||!files?.length||busy)return;'));
  assert(src.includes("setNotice('Обрабатываю '+Math.min(files.length,30)+' стикер(ов)…');"));
});

test('PWA page parses as valid TSX after the upload patch',()=>{
  const source=ts.createSourceFile('page.tsx',src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.equal(source.parseDiagnostics.length,0,source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});
