const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const page=require('./helpers/app-source.cjs')();
const liquid=read('app/liquid-glass.css');
const journal=read('app/call-journal-editor.css');
const marker='CONNECT_PWA_LIST_PARITY_GESTURE_V1_20261114';

test('dock does not participate in PWA edge history; other edge swipes keep working',()=>{
  assert.match(page,/shell\.setAttribute\('data-connect-pwa-list-parity','true'\)/);
  const begin=page.indexOf("    let started:{x:number;y:number;edge:'back'|'forward'}|null=null;");
  const finish=page.indexOf("    shell.addEventListener('touchstart',start",begin);
  assert.ok(begin>=0&&finish>begin,'could not find current native gesture handlers');
  const source=page.slice(begin,finish);
  const helperStart=page.indexOf('function connectAllowHistorySwipe(');
  const helperEnd=page.indexOf('\n}',helperStart)+2;
  assert.ok(helperStart>=0 && helperEnd>helperStart,'missing scoped gesture policy');
  const helper=page.slice(helperStart,helperEnd);
  const factoryCode=`${helper}\nfunction harness(ctx) { const {shell,crop,mediaViewer,videoNoteOpen,menuMessage,forwardIds,selectionMode,stickerPicker,chatSearchOpen,chatActions,connectSwipeDirection,gestureHistory,conversations,profiles,activeChat,exitChat,enterChat,setActiveChat,showProfile,setProfileView,setProfileMediaOpen,setTab,setSettingsPage,setSearch,setListActions,setStickerPicker}=ctx; ${source}; return {start,end}; }`;
  const result=ts.transpileModule(factoryCode,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true});
  assert.deepEqual((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  const factory=new Function(result.outputText+';return harness;')();
  const originalElement=global.Element, originalDocument=global.document;
  global.Element=class FakeElement {constructor(nav){this.nav=nav;} closest(selector){return this.nav&&selector.includes('.bottom-nav')?this:null;}};
  global.document={querySelector:()=>null};
  try {
    function setup(){
      const state={calls:0};
      const history={current:{cursor:1,restoring:false,entries:[{tab:'chats',chat:null,profile:null,media:null,settings:'home'},{tab:'contacts',chat:null,profile:null,media:null,settings:'home'}]}};
      const shell={getBoundingClientRect:()=>({left:0,right:390}),querySelector:s=>s==='.bottom-nav'?{getBoundingClientRect:()=>({top:720})}:null};
      const ctx={shell,crop:null,mediaViewer:null,videoNoteOpen:false,menuMessage:null,forwardIds:[],selectionMode:false,stickerPicker:false,chatSearchOpen:false,chatActions:false,gestureHistory:history,conversations:[],profiles:[],activeChat:null,connectSwipeDirection:(edge,dx,dy)=>edge==='back'&&dx>=70&&Math.abs(dx)>Math.abs(dy)*1.3?-1:0,exitChat:()=>{},enterChat:()=>{},setActiveChat:()=>{},showProfile:()=>{},setProfileView:()=>{},setProfileMediaOpen:()=>{},setTab:()=>{state.calls++},setSettingsPage:()=>{},setSearch:()=>{},setListActions:()=>{},setStickerPicker:()=>{}};
      return {h:factory(ctx),state,history};
    }
    const ev=(x,y,nav=false)=>({target:new global.Element(nav),touches:[{clientX:x,clientY:y}],changedTouches:[{clientX:x,clientY:y}],preventDefault(){this.prevented=true;}});
    let t=setup();t.h.start(ev(6,730,true));t.h.end(ev(120,730,true));assert.equal(t.history.current.cursor,1,'nav gestures must not navigate');
    t=setup();t.h.start(ev(6,726,false));t.h.end(ev(120,726,false));assert.equal(t.history.current.cursor,1,'bottom dock hit band must not navigate');
    t=setup();t.h.start(ev(6,150,false));t.h.end(ev(120,725,true));assert.equal(t.history.current.cursor,1,'touch ending in nav must not navigate');
    t=setup();t.h.start(ev(6,150,false));t.h.end(ev(120,150,false));assert.equal(t.history.current.cursor,1,'root tabs must never navigate by swiping');assert.equal(t.state.calls,0);
    t=setup();t.history.current.entries=[{tab:'settings',chat:null,profile:null,media:null,settings:'home'},{tab:'settings',chat:null,profile:null,media:null,settings:'appearance'}];
    t.h.start(ev(6,150,false));t.h.end(ev(120,150,false));assert.equal(t.history.current.cursor,0,'swiping back inside Settings must still navigate');assert.equal(t.state.calls,1);
  }finally{global.Element=originalElement;global.document=originalDocument;}
});

test('PWA-only selectors cover both comparison lists and preserve native wrapper',()=>{
  assert.match(liquid,/\/\* CONNECT_PWA_LIST_PARITY_GESTURE_V1_20261114/);
  assert.match(journal,/\/\* CONNECT_PWA_LIST_PARITY_GESTURE_V1_20261114/);
  assert.match(liquid,/\.connect-app\[data-connect-pwa-list-parity="true"\] \.chat-rows \.dialog-row/);
  assert.match(journal,/\.connect-app\[data-connect-pwa-list-parity="true"\] \.connect-pwa-call-journal \.connect-call-history-item/);
  for(const [name,src] of [['Chats',liquid],['Calls',journal]]){
    assert.match(src,/min-height:66px/);
    assert.match(src,/font-size:16px/);
    assert.match(src,/font-size:12px/);
    assert.match(src,/width:46px/);
    assert.match(src,/rgba\(37,54,78,\.35\)/);
    assert.match(src,/rgba\(255,255,255,\.76\)/);
  }
  assert.equal((page.match(/shell\.setAttribute\('data-connect-pwa-list-parity','true'\)/g)||[]).length,1);
});

test('Chromium: Chats and Calls cards match Contacts across themes and narrow screens',async()=>{
  const {chromium}=require('playwright-core');
  const browser=await chromium.launch({executablePath:process.env.CONNECT_TEST_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
  try{
    for(const width of [320,375,390,430])for(const mode of ['dark','light']){
      const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
      await p.setContent(`<div class="connect-app ${mode==='light'?'light':''}" data-connect-pwa-list-parity="true" style="--accent:#198f78;--glass-stroke:rgba(198,225,255,.14)"><div class="main-view">
        <div class="contact-rows"><button class="contact-row"><span class="connect-presence-avatar"><span class="person-avatar avatar-md">A</span></span><span class="contact-text"><strong>Тестировщик )</strong><small>Тестовый аккаунт</small></span></button></div>
        <div class="chat-rows"><div class="dialog-entry"><button class="dialog-row"><span class="connect-presence-avatar"><span class="person-avatar avatar-md">A</span></span><div class="dialog-summary"><strong>Тестировщик )</strong><span>Вы: Стикер</span></div><div class="dialog-meta"><time>21:45</time></div></button></div></div>
        <div class="test-host"><section class="connect-call-history-screen connect-pwa-call-journal"><div class="connect-call-history-list"><div class="connect-call-history-item"><span class="connect-call-history-avatar">A</span><div class="connect-call-history-details"><strong>Тестировщик )</strong><small>Исходящий · 0:42</small></div><div class="connect-call-history-actions"><div class="connect-call-history-date"><time>14 нояб. 2026 г.</time><span>21:06</span></div><button class="connect-call-redial">☎</button></div></div></div></section></div>
      </div></div>`);
      for(const css of ['globals.css','liquid-glass.css','call-journal-editor.css'])await p.addStyleTag({content:read('app/'+css)});
      const d=await p.evaluate(()=>{
        const s=sel=>getComputedStyle(document.querySelector(sel));
        const $=sel=>document.querySelector(sel);
        return {contact:{font:s('.contact-text strong').fontSize,avatar:s('.contact-row .connect-presence-avatar').width,min:s('.contact-row').minHeight,bg:s('.contact-row').backgroundImage,color:s('.contact-row').backgroundColor},chat:{font:s('.dialog-summary strong').fontSize,avatar:s('.dialog-row .connect-presence-avatar').width,min:s('.dialog-row').minHeight,bg:s('.dialog-entry').backgroundImage,color:s('.dialog-entry').backgroundColor},call:{font:s('.connect-call-history-details strong').fontSize,avatar:s('.connect-call-history-avatar').width,min:s('.connect-call-history-item').minHeight,bg:s('.connect-call-history-item').backgroundImage,color:s('.connect-call-history-item').backgroundColor},overflow:$('.connect-call-history-item').scrollWidth-$('.connect-call-history-item').clientWidth};
      });
      assert.equal(d.chat.font,d.contact.font,`chat font: ${width} ${mode}`);
      assert.equal(d.call.font,d.contact.font,`call font: ${width} ${mode}`);
      assert.equal(d.chat.avatar,d.contact.avatar,`chat avatar: ${width} ${mode}`);
      assert.equal(d.call.avatar,d.contact.avatar,`call avatar: ${width} ${mode}`);
      assert.equal(d.chat.min,d.contact.min,`chat min-height: ${width} ${mode}`);
      assert.equal(d.call.min,d.contact.min,`call min-height: ${width} ${mode}`);
      assert.equal(d.chat.bg,d.contact.bg,`chat background: ${width} ${mode}`);
      assert.equal(d.call.bg,d.contact.bg,`call background: ${width} ${mode}`);
      assert.equal(d.chat.color,d.contact.color,`chat fallback background: ${width} ${mode}`);
      assert.equal(d.call.color,d.contact.color,`call fallback background: ${width} ${mode}`);
      assert.ok(d.overflow<=3,`call card overflowing at ${width} ${mode}: ${d.overflow}px`);
      await p.close();
    }
  }finally{await browser.close()}
});
