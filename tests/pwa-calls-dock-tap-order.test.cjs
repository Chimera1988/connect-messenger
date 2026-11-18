'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = process.cwd();
const hub = fs.readFileSync(path.join(root,'components/ConnectCallsHub.tsx'),'utf8');
const page = require('./helpers/app-source.cjs')();
const liquid = fs.readFileSync(path.join(root,'app/liquid-glass.css'),'utf8');
const handler = hub.indexOf('    function onOtherTab(');
const begin = handler >= 0 ? hub.lastIndexOf('  useEffect(() => {',handler) : -1;
const end = hub.indexOf('  }, [open]);',handler);
assert.ok(handler >= 0 && begin >= 0 && end > handler,'Cannot locate the live CallsHub tab-close effect');
const body = hub.slice(begin+'  useEffect(() => {\n'.length,end);
const factory = ts.transpileModule(
  'function install(open,setOpen,setPickerOpen,document,window) {\n'+body+'\n}',
  {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.None},reportDiagnostics:true}
);
assert.deepEqual((factory.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[], 'CallsHub effect must parse as TypeScript');
const install = new Function(factory.outputText+'\nreturn install;')();

function makeDocument() {
  const handlers = [];
  return {
    handlers,
    addEventListener(type,callback,capture=false) {handlers.push({type,callback,capture:Boolean(capture)});},
    removeEventListener(type,callback,capture=false) {
      const idx=handlers.findIndex(x=>x.type===type&&x.callback===callback&&x.capture===Boolean(capture));
      assert.notEqual(idx,-1,'must remove the exact matching listener');handlers.splice(idx,1);
    },
    dispatch(type,target) {for(const h of [...handlers])if(h.type===type)h.callback({target});}
  };
}

function withFakeElement(run) {
  const old = global.Element;
  global.Element=class FakeElement {
    constructor(kind){this.kind=kind;}
    closest(selector){
      if(selector==='.bottom-nav .nav-tab:not(.connect-calls-tab)' && this.kind==='root-tab')return this;
      return null;
    }
  };
  try {run();} finally {global.Element=old;}
}

test('RED/GREEN: PWA changes main tabs BEFORE closing the Calls portal, not on pointerdown',()=>withFakeElement(()=>{
  const doc=makeDocument(),log=[];
  const cleanup=install(true,()=>log.push('close-calls'),()=>log.push('close-picker'),doc,{});
  assert.ok(doc.handlers.some(h=>h.type==='click'&&h.capture===false),'PWA must listen to completed clicks in bubble phase');
  assert.ok(!doc.handlers.some(h=>h.type==='pointerdown'),'PWA must not close Calls during pointerdown');
  for(const tab of ['contacts','settings','chats']){
    const target=new Element('root-tab');
    doc.dispatch('pointerdown',target);
    assert.deepEqual(log,[],`pointerdown must not close Calls before ${tab} receives click`);
    log.push('select-'+tab);
    doc.dispatch('click',target);
    assert.deepEqual(log.slice(-3),['select-'+tab,'close-calls','close-picker'],`root ${tab} click must precede closing the Calls portal`);
    log.length=0;
  }
  doc.dispatch('click',new Element('calls-tab'));
  assert.deepEqual(log,[],'clicking Calls must never close itself');
  cleanup();
  assert.equal(doc.handlers.length,0,'listeners must be cleaned up');
}));

test('PWA fix preserves existing Android native pointerdown handling',()=>withFakeElement(()=>{
  const doc=makeDocument(),log=[];
  const cleanup=install(true,()=>log.push('close-calls'),()=>log.push('close-picker'),doc,{ConnectAndroid:{register:()=>{}}});
  assert.ok(doc.handlers.some(h=>h.type==='pointerdown'&&h.capture===true),'Android must retain its existing early capture behavior');
  doc.dispatch('pointerdown',new Element('root-tab'));
  assert.deepEqual(log,['close-calls','close-picker']);
  cleanup();assert.equal(doc.handlers.length,0);
}));

test('nested edge gestures and the inert moving highlight remain unchanged',()=>{
  assert.match(page,/function connectAllowHistorySwipe\(/);
  assert.match(page,/if\(!connectAllowHistorySwipe\(history\.entries\[history\.cursor\],target,direction\)\)return/);
  assert.match(page,/if\(!currentView \|\| \(!currentView\.chat && !currentView\.profile && !currentView\.media && currentView\.settings==='home'\)\)return/);
  assert.match(liquid,/\.bottom-nav::before\s*\{[^}]*pointer-events:none/s);
  assert.match(liquid,/\.bottom-nav:has\(> \.connect-calls-tab.selected\)::before/);
});

test('Chromium: rapid root-tab taps keep their intended target while Calls dismisses afterwards',async()=>{
  const {chromium}=require('playwright-core');
  const browser=await chromium.launch({executablePath:process.env.CONNECT_TEST_CHROMIUM_EXECUTABLE||undefined,args:['--no-sandbox']});
  try {
    const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
    await p.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><div class="connect-app" data-connect-pwa-list-parity="true" style="--accent:#198f78"><div class="main-view"></div><nav class="bottom-nav">
      <button class="nav-tab selected" data-tab="chats">Чаты</button>
      <button class="nav-tab" data-tab="contacts">Контакты</button>
      <button class="nav-tab" data-tab="settings" style="order:3">Настройки</button>
      <button class="nav-tab connect-calls-tab" data-tab="calls" style="order:2">Звонки</button>
      </nav></div>`);
    for(const css of ['app/globals.css','app/liquid-glass.css']) await p.addStyleTag({content:fs.readFileSync(path.join(root,css),'utf8')});
    await p.evaluate(js => {
      const install = new Function(js+'\nreturn install;')();
      window.__events=[];
      window.__callsOpen=true;
      window.__cleanup=install(true,()=>{window.__events.push('close-calls');window.__callsOpen=false;},()=>window.__events.push('close-picker'),document,window);
      const dock=document.querySelector('.bottom-nav');
      dock.addEventListener('click',event=>{
        const button=event.target.closest('.nav-tab');
        if(!button)return;
        window.__events.push('select-'+button.dataset.tab);
        dock.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('selected',t===button));
      });
    },factory.outputText);
    for(const tab of ['contacts','settings','chats']){
      await p.locator(`.bottom-nav [data-tab="${tab}"]`).tap();
      const state=await p.evaluate(()=>({events:[...window.__events],active:document.querySelector('.bottom-nav .nav-tab.selected')?.dataset.tab}));
      assert.deepEqual(state.events.slice(-3),['select-'+tab,'close-calls','close-picker'],`wrong click order on ${tab}`);
      assert.equal(state.active,tab,`wrong tab selected after ${tab}`);
      await p.evaluate(()=>window.__events.length=0);
    }
    await p.evaluate(()=>window.__cleanup());
    await p.close();
  } finally { await browser.close(); }
});
