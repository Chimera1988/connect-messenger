const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const call=read('components/ConnectAudioCalls.tsx');
const css=read('app/calls.css');
const journal=read('app/call-journal-editor.css');
const hub=read('components/ConnectCallsHub.tsx');
const marker='CONNECT_PWA_CALL_SCREEN_JOURNAL_V2_20261114';

test('Calls journal is its own screen, not a translucent overlay',()=>{
  assert.match(journal,/\.connect-app \.main-view:has\(> \.connect-pwa-call-journal\) > :not\(\.connect-pwa-call-journal\)\s*\{\s*display:none !important;/);
  assert.match(journal,/\.connect-app \.main-view > \.connect-call-history-screen\.connect-pwa-call-journal\s*\{[\s\S]*?position:relative;[\s\S]*?background:transparent;[\s\S]*?backdrop-filter:none;/);
  assert.ok(hub.includes('connect-pwa-call-journal'),'PWA-only journal class missing');
  assert.ok(hub.includes('!window.ConnectAndroid&&!window.ConnectNative'),'native journal must remain unchanged');
  assert.ok(journal.includes(marker));
});

test('Call has a fullscreen theme-owned canvas without underlying screen bleed',()=>{
  assert.match(css,/\.connect-app \.connect-call-backdrop\.connect-pwa-call-layout\s*\{[\s\S]*?var\(--glass-background, var\(--bg\)\);[\s\S]*?backdrop-filter:none;/);
  assert.match(css,/\.connect-app \.connect-pwa-call-layout \.connect-call-modal\s*\{[\s\S]*?height:100%;[\s\S]*?border:0;[\s\S]*?border-radius:0;[\s\S]*?background:transparent;/);
  assert.ok(css.includes(marker));
});

test('Avatar, name and timer form the centered middle group',()=>{
  assert.match(call,/className="connect-call-identity"[\s\S]*?<ConnectCallAvatar className="connect-call-avatar"[\s\S]*?<h2>\{shownName[\s\S]*?<p className="connect-call-info" role="status">\{phaseTitle\[phase\]\}<\/p>\s*<\/div>/);
  assert.match(css,/\.connect-app \.connect-pwa-call-layout \.connect-call-identity\s*\{[\s\S]*?justify-content:center;/);
  assert.match(css,/\.connect-app \.connect-pwa-call-layout \.connect-call-identity \.connect-call-avatar\s*\{[\s\S]*?width:clamp\(124px, 38vw, 164px\)/);
});

test('Actions have one horizontal row, ending with End on the right',()=>{
  assert.match(css,/\.connect-app \.connect-pwa-call-layout \.connect-call-actions\s*\{[\s\S]*?display:grid;[\s\S]*?grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css,/\.connect-app \.connect-pwa-call-layout \.connect-call-actions \.connect-call-action\.hangup\s*\{\s*grid-column:3;/);
  const action=call.split('<div className="connect-call-actions">')[1]?.split('</div>')[0]||'';
  for(const command of ['toggleMute','enableRemoteAudio',"finish(incoming ? 'decline' : 'hangup')"])assert.ok(action.includes(command),command+' missing');
  assert.ok(action.indexOf('toggleMute')<action.indexOf('enableRemoteAudio'));
  assert.ok(action.indexOf('enableRemoteAudio')<action.indexOf("finish(incoming ? 'decline' : 'hangup')"));
});

test('Minimize has text only; compact call remains interactive and RTC cleanup unchanged',()=>{
  assert.match(call,/aria-label="Свернуть звонок">Свернуть<\/button>/);
  assert.ok(call.includes('connect-pwa-call-layout'),'PWA call screen class missing');
  assert.ok(call.includes('!window.ConnectAndroid && !window.ConnectNative'),'native call UI must remain unchanged');
  assert.doesNotMatch(call,/aria-label="Свернуть звонок">⌄/);
  assert.match(call,/className="connect-call-mini" aria-label="Вернуться к разговору" onClick=\{\(\)=>setMinimized\(false\)\}/);
  assert.match(call,/\<audio ref=\{remoteAudioRef\} className="connect-call-audio" autoPlay\/\>/);
  assert.match(call,/pcRef\.current\?\.close\(\)/);
});

test('Chrome layout: standalone journal and bottom row on wide/narrow mobile screens',async t=>{
  if(process.env.CONNECT_SKIP_BROWSER==='1'){t.diagnostic('Browser test runs on GitHub Actions with matching Chromium');return;}
  const {chromium}=require('playwright-core');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const [width,height] of [[390,844],[375,667],[320,568]]){
      const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
      const base=`html,body{margin:0;min-height:100%;}*{box-sizing:border-box}
      .connect-app{position:relative;display:flex;flex-direction:column;width:${width}px;height:${height}px;--bg:#080b11;--text:#eee;--muted:#a7acbb;--accent:#198f78;--wave-primary:#0ad9b7;--wave-secondary:#65acf4;--glass-background:#070c15;--panel:#152034;--glass-surface-strong:#172034;--glass-sheen:rgba(255,255,255,.08)}
      .main-view{position:relative;display:flex;flex-direction:column;min-height:0;flex:1;padding:0 16px;}`;
      await page.setContent(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="connect-app"><div class="main-view"><header class="old-chats">Чаты</header><section class="connect-call-history-screen connect-pwa-call-journal"><h1>Звонки</h1></section></div><div class="connect-call-backdrop connect-pwa-call-layout"><div class="connect-call-modal"><div class="connect-call-headline"><p class="connect-call-eyebrow">CONNECT · АУДИО</p><button class="connect-call-minimize">Свернуть</button></div><div class="connect-call-identity"><span class="connect-call-avatar">А</span><h2>Тестировщик</h2><p class="connect-call-info">Разговор · 0:14</p></div><div class="connect-call-actions"><button class="connect-call-action"><span>♪</span><span>Микрофон</span></button><button class="connect-call-action"><span>↗</span><span>Аудиовыход</span></button><button class="connect-call-action hangup"><span>×</span><span>Завершить</span></button></div><p class="connect-call-note">Звонки работают при открытой PWA.</p></div></div></div></body></html>`);
      await page.addStyleTag({content:base+'\n'+css+'\n'+journal});
      const rects=await page.evaluate(()=>{
        const box=s=>document.querySelector(s).getBoundingClientRect();
        const style=s=>getComputedStyle(document.querySelector(s));
        return { old:style('.old-chats').display, journalPosition:style('.connect-call-history-screen').position,
          journalFilter:style('.connect-call-history-screen').backdropFilter,
          backdrop:style('.connect-call-backdrop').backgroundImage,
          modal:box('.connect-call-modal').toJSON(), avatar:box('.connect-call-avatar').toJSON(),
          actionDisplay:style('.connect-call-actions').display,
          actions:['.connect-call-actions .connect-call-action:nth-child(1)','.connect-call-actions .connect-call-action:nth-child(2)','.connect-call-actions .hangup'].map(s=>box(s).toJSON()),
          minimize:document.querySelector('.connect-call-minimize').textContent};
      });
      assert.equal(rects.old,'none',`journal must hide old tab at ${width}`);
      assert.equal(rects.journalPosition,'relative');
      assert.equal(rects.journalFilter,'none');
      assert.equal(rects.actionDisplay,'grid');
      assert.ok(rects.actions[0].x < rects.actions[1].x && rects.actions[1].x<rects.actions[2].x,`${width} controls not in horizontal order`);
      assert.ok(Math.abs(rects.avatar.x+rects.avatar.width/2-width/2)<5,`${width} avatar not centered`);
      assert.ok(rects.avatar.width>=105,`${width} avatar too small`);
      assert.ok(rects.actions[0].y>rects.avatar.bottom,`${width} buttons overlap avatar`);
      assert.ok(rects.actions[0].y>height*.55,`${width} buttons not at bottom`);
      assert.equal(rects.minimize,'Свернуть');
      await page.close();
    }
  }finally{await browser.close();}
});
