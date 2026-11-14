/* Browser API behavior only. Manual iPhone lock may still suspend WebRTC. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../components/ConnectAudioCalls.tsx'), 'utf8');
const tree = ts.createSourceFile('calls.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, walk);
}
walk(tree);
function fixture() {
  const handlers = new Map();
  const locks = [];
  const document = {
    visibilityState: 'visible',
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
  };
  const navigator = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_2 like Mac OS X)',
    audioSession: { type: 'auto' },
    wakeLock: { async request(type) {
      assert.equal(type, 'screen');
      const listeners = [];
      const lock = {
        released: false,
        addEventListener(type, fn) { if (type === 'release') listeners.push(fn); },
        async release() { this.released = true; for (const fn of listeners) fn(); },
      };
      locks.push(lock);
      return lock;
    } },
  };
  const context = vm.createContext({ window: {}, navigator, document });
  for (const name of ['configureCallAudioSession', 'holdIosCallScreenAwake']) {
    assert.ok(functions.has(name), name);
    vm.runInContext(ts.transpileModule(functions.get(name), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, context);
  }
  return { context, navigator, document, handlers, locks };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const f = fixture();
  f.context.configureCallAudioSession('play-and-record');
  assert.equal(f.navigator.audioSession.type, 'play-and-record');
  f.context.configureCallAudioSession('auto');
  assert.equal(f.navigator.audioSession.type, 'auto');
  const dispose = f.context.holdIosCallScreenAwake();
  await tick();
  assert.equal(f.locks.length, 1);
  f.document.visibilityState = 'hidden';
  await f.locks[0].release();
  f.document.visibilityState = 'visible';
  f.handlers.get('visibilitychange')();
  await tick();
  assert.equal(f.locks.length, 2, 'restore wake lock after foregrounding');
  dispose();
  await tick();
  assert.equal(f.locks[1].released, true, 'release wake lock after call');
  assert.equal(f.handlers.size, 0);
  const native = fixture(); native.context.window.ConnectAndroid = {};
  native.context.configureCallAudioSession('play-and-record');
  assert.equal(native.navigator.audioSession.type, 'auto');
  native.context.holdIosCallScreenAwake()();
  await tick();
  assert.equal(native.locks.length, 0, 'do not change Android native behavior');
  console.log('PASS: iOS PWA audio session and Screen Wake Lock lifecycle');
})().catch(error => { console.error(error); process.exitCode = 1; });
