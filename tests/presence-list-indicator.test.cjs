const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');

const source = require('./helpers/app-source.cjs')();
const css = fs.readFileSync(path.join(__dirname,'../app/globals.css'),'utf8');
const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function sourceOf(name) {
  const found = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(found, `${name} missing`);
  return found.getText(tree);
}

function testedFunctions() {
  const functions = ['dayKey','dayLabel','timeLabel','formatPresence','PresenceAvatar'].map(sourceOf).join('\n');
  const transpiled = ts.transpileModule(functions,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,module:ts.ModuleKind.None},
    fileName:'presence.tsx',reportDiagnostics:true,
  });
  assert.deepEqual((transpiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error),[]);
  const Avatar = ({name}) => React.createElement('span',{className:'person-avatar'},name);
  return new Function('React','Avatar',`${transpiled.outputText}\nreturn {PresenceAvatar,formatPresence};`)(React,Avatar);
}

test('presence lease is consistent with existing chat header',()=>{
  const {formatPresence}=testedFunctions();
  const now = Date.parse('2026-11-14T12:00:00Z');
  const current = {last_seen_at:new Date(now-10000).toISOString(),online_until:new Date(now+45000).toISOString()};
  assert.equal(formatPresence(current,now),'В сети');
  assert.notEqual(formatPresence({...current,online_until:new Date(now-1000).toISOString()},now),'В сети');
  assert.notEqual(formatPresence(undefined,now),'В сети');
});

test('online avatar has an accessible small dot; offline avatar retains old markup',()=>{
  const {PresenceAvatar}=testedFunctions();
  const htmlOn = renderToStaticMarkup(React.createElement(PresenceAvatar,{name:'Тест',online:true}));
  const htmlOff = renderToStaticMarkup(React.createElement(PresenceAvatar,{name:'Тест',online:false}));
  assert.match(htmlOn,/connect-presence-avatar/);
  assert.match(htmlOn,/connect-presence-dot/);
  assert.match(htmlOn,/aria-label="В сети"/);
  assert.doesNotMatch(htmlOff,/connect-presence-avatar|connect-presence-dot/);
  assert.match(htmlOff,/person-avatar/);
});

test('both Chats and Contacts use the same presence, scoped to PWA',()=>{
  const chat = source.split('filteredChats.map(c =>')[1]?.split("{tab === 'contacts'")[0]||'';
  const contact = source.split('filteredContacts.map(p =>')[1]?.split("{tab === 'settings'")[0]||'';
  assert.ok(chat.includes("online={!isNativeMediaRuntime() && formatPresence(presence[c.other?.id || ''], clock) === 'В сети'}"),'Chat list missing PWA presence lease');
  assert.ok(contact.includes("online={!isNativeMediaRuntime() && formatPresence(presence[p.id], clock) === 'В сети'}"),'Contacts missing PWA presence lease');
  assert.match(css,/\.connect-app \.connect-presence-dot\s*\{[^}]*width:12px;height:12px;[^}]*background:var\(--accent\);border:2px solid var\(--bg\);/s);
});
