const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../components/ConnectAudioCalls.tsx'), 'utf8');
const tree = ts.createSourceFile('calls.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actualFunction(name) {
  let found;
  const walk = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, walk); };
  walk(tree); assert.ok(found, name);
  return ts.transpileModule(found.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}
function harness() {
  const events = [];
  const row = { id: 'call-a', caller_id: 'peer', callee_id: 'self', status: 'ringing', offer: { sdp: 'offer' } };
  const pc = {
    localDescription: null, remoteDescription: null, close() { events.push('close-peer'); },
    async setRemoteDescription(value) { this.remoteDescription = value; },
    async createAnswer() { return { sdp: 'this-device', type: 'answer' }; },
    async createOffer() { return { sdp: 'offer', type: 'offer' }; },
    async setLocalDescription(value) { this.localDescription = { ...value, toJSON: () => value }; },
  };
  const c = {
    console, clearTimeout, setTimeout, Date, Error, navigator: {}, window: {},
    callRef: { current: row }, pcRef: { current: null }, streamRef: { current: null },
    generationRef: { current: 1 }, ringTimeoutRef: { current: null }, answerPendingRef: { current: false }, outgoingPendingRef: { current: false },
    submittedAnswerRef:{current:null},iceSendingRef:{current:false},localIceRef:{current:[]},remoteIceCursorRef:{current:0},iceSyncingRef:{current:false},
    enteredRef: { current: false }, remoteAudioRef: { current: null },
    phase: 'incoming', userId: 'self', shownName: 'Peer',
    soundRef: { current: { unlock() {}, connected() { events.push('connected'); } } },
    setToast: text => events.push(['toast', text]), setPhase: text => events.push(['phase', text]),
    setError() {}, setShown() {}, setShownName() {}, setShownPeerId() {},
    friendlyError: e => e.message, isLive: status => ['ringing', 'active'].includes(status),
    traceCall(){},connectionDeadline(){},
    async notifyCallEnded(id) { events.push(['notify-end', id]); },
    async flushLocalIce() {}, async flushRemoteIce() {}, watchIce() {}, async sendIce() {},
    cleanup() { events.push('cleanup'); c.generationRef.current++; c.callRef.current = null; c.pcRef.current = null; c.answerPendingRef.current = false; },
    async finish(reason) { events.push(['finish', reason]); c.cleanup(); },
    async createPeer() { c.pcRef.current = pc; return pc; },
    client: { async rpc() { return { data: { ...row, status: 'active', answer: { sdp: 'this-device' } } }; } },
  };
  vm.createContext(c);
  const load = name => { if (name === 'createPeer') vm.runInContext(actualFunction('configureCallAudioSession'), c); vm.runInContext(actualFunction(name), c); return c[name]; };
  return { c, pc, row, events, load };
}
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('another device accepts: stop local ringing without ending the shared call', async () => {
  const h = harness();
  await h.load('onUpdatedCall')({ ...h.row, status: 'active', answer: { sdp: 'android-device' } });
  assert.ok(h.events.includes('cleanup'));
  assert.equal(h.events.some(e => Array.isArray(e) && ['finish', 'notify-end'].includes(e[0])), false);
});
test('own accepted SDP preserves this device and does not claim transport is active', async () => {
  const h = harness(); h.c.pcRef.current = h.pc; h.pc.localDescription = { sdp: 'this-device' };
  h.c.submittedAnswerRef.current={sdp:'this-device'};
  await h.load('onUpdatedCall')({ ...h.row, status: 'active', answer: { sdp: 'this-device' } });
  assert.equal(h.events.includes('cleanup'), false);
  await h.load('acceptIncoming')();
  assert.equal(h.events.some(e => Array.isArray(e) && e[0] === 'phase' && e[1] === 'active'), false);
});
test('losing answer RPC uses decline, never failed/hangup against another device', async () => {
  const h = harness(); h.c.client.rpc = async () => ({ error: { message: 'Call unavailable or already answered' } });
  await h.load('acceptIncoming')();
  assert.ok(h.events.some(e => Array.isArray(e) && e[0] === 'finish' && e[1] === 'decline'));
});
test('two taps while permission/RPC pending create a single accept', async () => {
  const h = harness(), gate = deferred(); let requests = 0;
  h.c.client.rpc = async () => { requests++; return gate.promise; };
  const accept = h.load('acceptIncoming'), first = accept(); await tick(); await accept();
  assert.equal(requests, 1); gate.resolve({ data: { ...h.row, status: 'active' } }); await first;
});
test('old accept rejection cannot stop a new call or release its microphone', async () => {
  const h = harness(), gate = deferred(); h.c.client.rpc = () => gate.promise;
  const pending = h.load('acceptIncoming')(); await tick();
  h.c.generationRef.current++; h.c.callRef.current = { id: 'new-call' };
  gate.resolve({ error: { message: 'late response' } }); await pending;
  assert.equal(h.c.callRef.current.id, 'new-call'); assert.equal(h.events.includes('cleanup'), false);
});
test('accept success arriving after cancel cleans only the orphan call ID', async () => {
  const h = harness(), gate = deferred(), sent = [];
  h.c.client.rpc = (name, args) => { sent.push([name, args]); return name.includes('answer') ? gate.promise : Promise.resolve({}); };
  const pending = h.load('acceptIncoming')(); await tick();
  h.c.generationRef.current++; h.c.callRef.current = { id: 'new-call' };
  gate.resolve({ data: { ...h.row, status: 'active' } }); await pending;
  assert.equal(h.c.callRef.current.id, 'new-call');
  assert.equal(sent.at(-1)[1].p_call_id, 'call-a'); assert.equal(sent.at(-1)[1].p_reason, 'hangup');
});
test('late microphone grant stops only the granted old stream', async () => {
  const h = harness(), gate = deferred(); let stopped = 0;
  h.c.navigator.mediaDevices = { getUserMedia: () => gate.promise }; h.c.RTCPeerConnection = function() {};
  h.c.getIceServers = async () => []; const pending = h.load('createPeer')();
  const current = { getTracks: () => [{ stop() { throw new Error('new stream must stay open'); } }] };
  h.c.generationRef.current++; h.c.streamRef.current = current;
  gate.resolve({ getTracks: () => [{ stop() { stopped++; } }] });
  await assert.rejects(pending); assert.equal(stopped, 1); assert.equal(h.c.streamRef.current, current);
});
test('late caller answer rejection cannot fail the following call', async () => {
  const h = harness(), gate = deferred(); h.c.pcRef.current = h.pc;
  h.pc.setRemoteDescription = () => gate.promise;
  const pending = h.load('onUpdatedCall')({ ...h.row, caller_id: 'self', callee_id: 'peer', status: 'active', answer: { sdp: 'remote' } });
  h.c.generationRef.current++; h.c.callRef.current = { id: 'new-call' }; gate.reject(new Error('old peer closed')); await pending;
  assert.equal(h.c.callRef.current.id, 'new-call'); assert.equal(h.events.includes('cleanup'), false);
});
test('obsolete native peer callbacks cannot send ICE, audio or terminate the current call', async () => {
  const h = harness(), old = { getTracks: () => [] };
  h.c.navigator.mediaDevices = { getUserMedia: async () => old };
  h.c.getIceServers = async () => [];
  h.pc.addTrack = () => {}; h.c.RTCPeerConnection = function() { return h.pc; };
  const peer = await h.load('createPeer')(); h.c.generationRef.current++; h.c.pcRef.current = {};
  peer.connectionState = 'failed'; peer.onconnectionstatechange();
  peer.onicecandidate({ candidate: { toJSON() { throw new Error('old ICE'); } } }); peer.ontrack({});
  assert.equal(h.events.includes('cleanup'), false);
});
test('two outgoing starts before React renders ask for a single microphone', async () => {
  const h = harness(), gate = deferred(); let requests = 0;
  h.c.phase = 'idle'; h.c.callRef.current = null; h.c.uuidPattern = /^[a-z-]+$/;
  h.c.createPeer = () => { requests++; return gate.promise; };
  const start = h.load('startOutgoing');
  const target = { conversationId: 'chat', peerId: 'peer', peerName: 'Peer' };
  const first = start(target); await start(target); assert.equal(requests, 1);
  gate.reject(new Error('permission denied')); await first;
});
test('a WebRTC constructor error releases the granted microphone', async () => {
  const h = harness(); let stopped = 0;
  h.c.navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop() { stopped++; } }] }) };
  h.c.getIceServers = async () => [];
  h.c.RTCPeerConnection = function() { throw new Error('audio device unavailable'); };
  await assert.rejects(h.load('createPeer')()); assert.equal(stopped, 1);
});
test('ICE gathering cannot make the winning device release its own accepted call',async()=>{
  const h=harness(),submitted='v=0\r\na=ice-ufrag:same\r\na=fingerprint:sha-256 SAME\r\n';
  h.c.pcRef.current=h.pc;h.c.submittedAnswerRef.current={sdp:submitted};
  h.pc.localDescription={sdp:submitted+'a=candidate:1 1 UDP 1 127.0.0.1 1234 typ host\r\n'};
  await h.load('onUpdatedCall')({...h.row,status:'active',answer:{sdp:submitted}});
  assert.equal(h.events.includes('cleanup'),false);
});
test('failed ICE insert stays queued and is retried without duplicate successful sends',async()=>{
  const h=harness();let fail=true,successful=0;
  h.c.client.from=()=>({insert:async()=>{if(fail)return{error:{message:'network'}};successful++;return{};}});
  const flush=h.load('flushLocalIce'),send=h.load('sendIce');
  await send({candidate:'first'});assert.equal(h.c.localIceRef.current.length,1);
  fail=false;await flush();await flush();assert.equal(h.c.localIceRef.current.length,0);assert.equal(successful,1);
});
test('ICE polling advances past 250 candidates and keeps one cursor per call',async()=>{
  const h=harness(),seen=[];h.c.pcRef.current=h.pc;
  h.c.receiveIce=async row=>seen.push(row.id);
  h.c.client.from=()=>{let cursor=0;const q={select(){return q},eq(){return q},neq(){return q},gt(_key,n){cursor=n;return q},order(){return q},async limit(n){return{data:Array.from({length:Math.max(0,Math.min(n,501-cursor))},(_,i)=>({id:cursor+i+1}))}}};return q;};
  await h.load('pullIce')();assert.equal(seen.length,501);assert.equal(new Set(seen).size,501);assert.equal(h.c.remoteIceCursorRef.current,501);
});
test('pre-answer callee cancellation cannot send hangup against another winning device',async()=>{
  const h=harness(),sent=[];h.c.client.rpc=async(name,args)=>{sent.push(args);return{};};
  await h.load('finish')('hangup');assert.equal(sent[0].p_reason,'decline');
});
