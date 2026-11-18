const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const page=require('./helpers/app-source.cjs')();
const liquid=read('app/liquid-glass.css');
const previous=read('tests/pwa-list-parity-gesture.test.cjs');
const marker='CONNECT_PWA_DOCK_MOTION_NESTED_GESTURES_V1_20261114';

function extractFunction(name){
  const ast=ts.createSourceFile('page.tsx',page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics,[],'page must parse as TSX');
  let found;
  function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit)}
  visit(ast);
  assert.ok(found,`missing ${name}`);
  return found.getText(ast);
}

function getAllowed(){
  const source=extractFunction('connectAllowHistorySwipe');
  const result=ts.transpileModule(source+`\nglobalThis.__gesturePolicy=connectAllowHistorySwipe;`,{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
  assert.deepEqual((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  return new Function(result.outputText+`;return globalThis.__gesturePolicy;`)();
}

const v=(tab,opts={})=>({tab,chat:null,profile:null,media:null,settings:'home',...opts});

test('gesture policy prevents root-tab switching, but preserves chat and submenu back',()=>{
  const allowed=getAllowed();
  for(const t of ['chats','contacts','settings'])for(const other of ['chats','contacts','settings']){
    assert.equal(allowed(v(t),v(other),-1),false,`root back ${t}->${other}`);
    assert.equal(allowed(v(t),v(other),1),false,`root forward ${t}->${other}`);
  }
  const chat=v('chats',{chat:'conversation-1'});
  assert.equal(allowed(chat,v('chats'),-1),true);
  assert.equal(allowed(chat,v('contacts'),-1),true,'back from chat opened via Contacts');
  assert.equal(allowed(chat,v('chats'),1),false,'no accidental forward swipe inside chat');
  assert.equal(allowed(chat,v('chats',{chat:'conversation-2'}),-1),false,'never change conversation via edge swipe');
  const settings=v('settings',{settings:'appearance'});
  assert.equal(allowed(settings,v('settings'),-1),true,'back from appearance settings');
  assert.equal(allowed(settings,v('chats'),-1),false,'submenu must not switch tabs');
  assert.equal(allowed(settings,v('settings',{settings:'notifications'}),1),true,'submenu forward');
  assert.equal(allowed(settings,v('settings'),1),false,'no forward to root from submenu');
  const media=v('chats',{profile:'user-1',media:'photos',chat:'conversation-1'});
  assert.equal(allowed(media,v('chats',{profile:'user-1',chat:'conversation-1'}),-1),true,'media to profile');
  assert.equal(allowed(v('chats',{profile:'user-1'}),v('chats',{profile:'user-1',media:'music'}),1),true,'forward inside profile');
});

test('event guard rejects any swipe starting at root or on lower dock, without changing chat touch controls',()=>{
  assert.match(page,/const currentView=gestureHistory\.current\.entries\[gestureHistory\.current\.cursor\]/);
  assert.match(page,/if\(!currentView \|\| \(!currentView\.chat && !currentView\.profile && !currentView\.media && currentView\.settings==='home'\)\)return/);
  assert.match(page,/connectAllowHistorySwipe\(history\.entries\[history\.cursor\],target,direction\)/);
  assert.match(page,/target\.closest\('\.bottom-nav,\.nav-tab,\.connect-calls-tab'\)/);
  assert.match(page,/dock && touches\[0\]\.clientY>=dock\.getBoundingClientRect\(\)\.top-12/);
  assert.match(page,/function touchStart\(e: TouchEvent<HTMLDivElement>, m: Message\)/);
  assert.match(previous,/root tabs must never navigate by swiping/);
  assert.match(previous,/swiping back inside Settings must still navigate/);
});

test('PWA-only CSS defines an inert animated selection capsule in a fixed four-tab order',()=>{
  assert.match(liquid,new RegExp(`\\/\\* ${marker}`));
  assert.match(liquid,/\.bottom-nav::before\s*\{[^}]*pointer-events:none/s);
  assert.match(liquid,/\.bottom-nav:has\(> \.connect-calls-tab\)::before\s*\{[^}]*\/ 4\)/s);
  for(const pct of ['100%','200%','300%'])assert.ok(liquid.includes(`transform:translate3d(${pct},0,0)`),`missing ${pct} selection target`);
  assert.match(liquid,/\.bottom-nav > \.nav-tab\s*\{[^}]*z-index:1/s);
  assert.match(liquid,/\.bottom-nav > \.nav-tab\s*\{[^}]*background:transparent !important/s);
  assert.match(liquid,/@media\(prefers-reduced-motion:reduce\)/);
});

test('Chromium: dock capsule tracks all four tabs, never covers taps, and honors themes and reduced motion',async()=>{
  const {chromium}=require('playwright-core');
  const browser=await chromium.launch({args:['--no-sandbox']});
  try{
    for(const width of [320,390,430])for(const theme of ['dark','light']){
      const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
      await p.setContent(`<meta name="viewport" content="width=device-width, initial-scale=1"><div class="connect-app ${theme==='light'?'light':''}" data-connect-pwa-list-parity="true" style="--accent:#198f78;--wave-primary:#0ad9b7;--wave-secondary:#65acf4"><div class="main-view"></div><nav class="bottom-nav"><button type="button" class="nav-tab selected"><span class="nav-symbol">◯</span><small>Чаты</small></button><button type="button" class="nav-tab"><span class="nav-symbol">◯</span><small>Контакты</small></button><button type="button" class="nav-tab"><span class="nav-symbol">◯</span><small>Настройки</small></button><button type="button" class="nav-tab connect-calls-tab" style="order:2"><span class="nav-symbol">◯</span><small>Звонки</small></button></nav></div>`);
      for(const name of ['globals.css','liquid-glass.css'])await p.addStyleTag({content:read('app/'+name)});
      await p.addStyleTag({content:'.bottom-nav > .nav-tab:nth-child(1){order:0}.bottom-nav > .nav-tab:nth-child(2){order:1}.bottom-nav > .nav-tab:nth-child(3){order:3}'});
      const tabs=p.locator('.bottom-nav > .nav-tab');
      const selectedOrder=[0,1,3,2]; // DOM order, visual order: Chats, Contacts, Calls, Settings
      for(const idx of selectedOrder){
        await tabs.evaluateAll((all,i)=>{all.forEach((el,k)=>el.classList.toggle('selected',k===i));},idx);
        await p.waitForTimeout(510);
        const value=await p.evaluate(()=>{
          const nav=document.querySelector('.bottom-nav'),active=nav.querySelector('.connect-calls-tab.selected')||nav.querySelector('.nav-tab.selected');
          const pseudo=getComputedStyle(nav,'::before'),matrix=new DOMMatrixReadOnly(pseudo.transform);
          const rect=nav.getBoundingClientRect(),act=active.getBoundingClientRect();
          const center=rect.left+parseFloat(pseudo.left)+matrix.m41+parseFloat(pseudo.width)/2;
          return {distance:Math.abs(center-(act.left+act.width/2)),pointer:pseudo.pointerEvents,width:parseFloat(pseudo.width),font:getComputedStyle(active).color,transition:pseudo.transitionDuration};
        });
        assert.ok(value.distance<4,`highlight misses tab ${idx} at ${width}px ${theme}: ${JSON.stringify(value)}`);
        assert.equal(value.pointer,'none');
      }
      let taps=0;
      await tabs.nth(1).evaluate(el=>el.addEventListener('click',()=>window.__connectTap=(window.__connectTap||0)+1));
      await tabs.nth(1).click();
      taps=await p.evaluate(()=>window.__connectTap);
      assert.equal(taps,1,`highlight must not swallow tab taps at ${width}px`);
      await p.close();
    }
    const reduced=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await reduced.setContent('<div class="connect-app" data-connect-pwa-list-parity="true"><nav class="bottom-nav"><button class="nav-tab selected">Чаты</button></nav></div>');
    await reduced.addStyleTag({content:read('app/liquid-glass.css')});
    assert.equal(await reduced.locator('.bottom-nav').evaluate(el=>getComputedStyle(el,'::before').transitionDuration),'0s');
    await reduced.close();
  }finally{await browser.close()}
});
