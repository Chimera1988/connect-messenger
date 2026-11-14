const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname,'..');
const page = fs.readFileSync(path.join(root,'app/page.tsx'),'utf8');
const call = fs.readFileSync(path.join(root,'components/ConnectAudioCalls.tsx'),'utf8');
const liquid = fs.readFileSync(path.join(root,'app/liquid-glass.css'),'utf8');
const callsCss = fs.readFileSync(path.join(root,'app/calls.css'),'utf8');

function findFunction(source,name){
  const tree=ts.createSourceFile('test.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(tree.parseDiagnostics,[],`TSX parse errors in ${name}`);
  let item;
  function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)item=node;ts.forEachChild(node,walk);}
  walk(tree);
  assert.ok(item,`Missing ${name}`);
  return item.getText(tree);
}

test('RED/GREEN: gestures distinguish back, forward, scroll and short drag',()=>{
  const declaration=findFunction(page,'connectSwipeDirection');
  const js=ts.transpileModule(declaration+'\nglobalThis.connectSwipeDirection=connectSwipeDirection;',{
    compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true
  });
  assert.deepEqual((js.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
  const swipe=new Function(`${js.outputText};return globalThis.connectSwipeDirection;`)();
  assert.equal(swipe('back',95,9),-1);
  assert.equal(swipe('forward',-95,10),1);
  assert.equal(swipe('back',-95,1),0);
  assert.equal(swipe('forward',95,1),0);
  assert.equal(swipe('back',65,1),0);
  assert.equal(swipe('back',100,90),0);
});

test('navigation has a bounded history, restores chat through existing actions, and excludes message swipes',()=>{
  assert.match(page,/gestureHistory\s*=\s*useRef/);
  assert.match(page,/history\.entries=\[\.\.\.history\.entries\.slice\(0,history\.cursor\+1\),view\]\.slice\(-24\)/);
  assert.match(page,/history\.restoring=true/);
  assert.match(page,/if\(activeChat && target\.chat!==activeChat\)exitChat\(\)/);
  assert.match(page,/if\(target\.chat && target\.chat!==activeChat\)enterChat\(target\.chat\)/);
  assert.match(page,/target\.closest\('[^']*\.bubble/);
  assert.match(page,/shell\.addEventListener\('touchstart',start,\{passive:true\}\)/);
  assert.match(page,/shell\.addEventListener\('touchend',end,\{passive:false\}\)/);
  assert.match(page,/if\(!user\?\.id \|\| isNativeMediaRuntime\(\)\)return/);
});

test('gesture listeners use native DOM Event, not imported React TouchEvent',()=>{
  const after=page.split('// Keep one in-memory navigation stack.')[1] || '';
  assert.match(after,/function start\(e: Event\)/);
  assert.match(after,/function end\(e: Event\)/);
  assert.match(after,/const touches=\(e as Event & \{touches:TouchList\}\)\.touches/);
  assert.match(after,/const changedTouches=\(e as Event & \{changedTouches:TouchList\}\)\.changedTouches/);
  assert.doesNotMatch(after,/function (?:start|end)\(e:TouchEvent\)/);
});

test('contact and chats search never uses iOS autozoom font or rectangular focused-input outline',()=>{
  assert.match(liquid,/\.connect-app \.main-view \.search-field input\s*\{[^}]*font-size:\s*16px !important/s);
  assert.match(liquid,/\.connect-app \.main-view \.search-field input:focus-visible\s*\{[^}]*outline:\s*none !important/s);
});

test('chat menus and call journal menu share the same panel color',()=>{
  const selector=liquid.split('/* CONNECT_PWA_NAV_MENUS_CALL_V1_20261114: native-size iOS search; unified list menus. */')[1];
  assert.ok(selector,'menu theme patch missing');
  for(const name of ['.chat-actions-menu','.floating-menu','.list-chat-popover','.connect-call-editor-popup'])
    assert.ok(selector.includes(name),`missing ${name}`);
  assert.match(selector,/background:\s*var\(--panel\) !important/);
});

test('audio call can minimize only after answer and retains an always-mounted audio element',()=>{
  assert.match(call,/const \[minimized,setMinimized\]=useState\(false\)/);
  assert.match(call,/compactCall=minimized && \(phase==='active'\|\|phase==='reconnecting'\)/);
  assert.match(call,/onClick=\{\(\)=>\{setAudioRouteOpen\(false\);setMinimized\(true\);\}\}/);
  assert.match(call,/aria-label="Вернуться к разговору" onClick=\{\(\)=>setMinimized\(false\)\}/);
  assert.match(call,/\{calling && compactCall && <button/);
  assert.match(call,/\{calling && !compactCall && <div/);
  assert.match(call,/<audio ref=\{remoteAudioRef\} className="connect-call-audio" autoPlay\/>/);
  const cleanup=findFunction(call,'cleanup');
  assert.doesNotMatch(cleanup,/setMinimized/);
  assert.match(call,/if\(phase==='idle'\)setMinimized\(false\)/);
});

test('call chrome uses live selected theme variables rather than a fixed blue dialog',()=>{
  const themed=callsCss.split('/* CONNECT_PWA_NAV_MENUS_CALL_V1_20261114: call UI follows all seven themes. */')[1];
  assert.ok(themed,'call palette patch missing');
  assert.match(themed,/\.connect-app \.connect-call-modal\s*\{[^}]*var\(--wave-primary, var\(--accent\)\)/s);
  assert.match(themed,/\.connect-app \.connect-call-mini\s*\{[^}]*z-index:21000/s);
  assert.match(themed,/--glass-surface-strong/);
  assert.match(themed,/--v4-border/);
});

test('Chromium: search focus, all context menus, and call card share intended live theme',async()=>{
  const {chromium}=require('playwright-core');
  const browser=await chromium.launch({args:['--no-sandbox']});
  try {
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3});
    await page.setContent(`<div class="connect-app" data-visual-scene="sunset" style="--accent:#b46b26;--wave-primary:#f4a951;--wave-secondary:#efbf7c">
      <div class="main-view"><div class="search-field"><input aria-label="Поиск контактов" /></div><div class="chat-actions-menu">Найти в чате</div></div>
      <div class="floating-menu">Переслать</div><div class="connect-call-editor-popup">Выбрать</div>
      <div class="connect-call-modal">Звонок</div><button class="connect-call-mini">Вернуться</button>
    </div>`);
    for(const file of ['globals.css','liquid-glass.css','calls.css','call-journal-editor.css'])
      await page.addStyleTag({content:fs.readFileSync(path.join(root,'app',file),'utf8')});
    await page.locator('input').focus();
    const appearance=await page.evaluate(()=>{
      const css=s=>getComputedStyle(document.querySelector(s));
      return {font:css('.search-field input').fontSize,outline:css('.search-field input').outlineStyle,
        chat:css('.chat-actions-menu').backgroundColor,other:css('.floating-menu').backgroundColor,
        journal:css('.connect-call-editor-popup').backgroundColor,
        modal:css('.connect-call-modal').backgroundImage,mini:css('.connect-call-mini').zIndex};
    });
    assert.equal(appearance.font,'16px');
    assert.equal(appearance.outline,'none');
    assert.equal(appearance.chat,appearance.other);
    assert.equal(appearance.chat,appearance.journal);
    assert.equal(appearance.mini,'21000');
    await page.locator('.connect-app').evaluate(el=>{
      el.style.setProperty('--accent','#8055dc');
      el.style.setProperty('--wave-primary','#a17afb');
      el.style.setProperty('--wave-secondary','#7e9cf6');
    });
    const violet=await page.locator('.connect-call-modal').evaluate(el=>getComputedStyle(el).backgroundImage);
    assert.notEqual(violet,appearance.modal,'Call modal must respond to selected palette');
  } finally {await browser.close();}
});
