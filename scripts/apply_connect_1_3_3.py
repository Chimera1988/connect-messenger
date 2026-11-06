#!/usr/bin/env python3
"""Guarded, idempotent PWA fixes for Connect 1.3.3. Never replace entire large components."""
from pathlib import Path


def change(file: str, before: str, after: str, label: str):
    path = Path(file)
    source = path.read_text(encoding='utf-8')
    if after in source:
        print(f'Already applied: {label}')
        return
    if source.count(before) != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {source.count(before)}')
    path.write_text(source.replace(before, after, 1), encoding='utf-8')
    print(f'Updated: {label}')


# Both numeric badges should be children of the 24px icon slot, not of different parent boxes.
change('components/ConnectCallsHub.tsx',
       '''<span className="nav-symbol"><CallIcon /></span>{unseenMissed > 0 && <span className="connect-nav-count" aria-hidden="true">{unseenMissed > 99 ? '99+' : unseenMissed}</span>}<small>Звонки</small>''',
       '''<span className="nav-symbol"><CallIcon />{unseenMissed > 0 && <span className="connect-nav-count" aria-hidden="true">{unseenMissed > 99 ? '99+' : unseenMissed}</span>}</span><small>Звонки</small>''',
       'Align missed-call counter with chat counter')

# Do not re-enter Android's voice-call audio mode AFTER the call has already been finished.
change('components/ConnectAudioCalls.tsx',
       "    if (callRef.current) window.ConnectAndroid?.setCallState(callRef.current.id, 'ended');\n    window.ConnectAndroid?.setSpeakerphone(false);",
       "    window.ConnectAndroid?.setSpeakerphone(false);\n    if (callRef.current) window.ConnectAndroid?.setCallState(callRef.current.id, 'ended');",
       'Restore normal Android audio mode when a call ends')

# Existing call database RPC is the source of truth. The push only dismisses native UI.
change('components/ConnectAudioCalls.tsx',
       "  async function finish(reason: 'hangup' | 'decline' | 'missed' | 'failed' | 'busy' = 'hangup') {",
       '''  async function notifyCallEnded(callId: string) {
    if (!client) return;
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) return;
      const response = await fetch('/api/push/call/end', {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ callId }),
      });
      if (!response.ok) console.warn('Connect: call-end push HTTP', response.status);
    } catch {
      console.warn('Connect: call-end push could not reach the server');
    }
  }

  async function finish(reason: 'hangup' | 'decline' | 'missed' | 'failed' | 'busy' = 'hangup') {''',
       'Send Android call-ended event')
change('components/ConnectAudioCalls.tsx',
       "      if (rpcError) console.warn('Connect call state:', rpcError.message);",
       "      if (rpcError) console.warn('Connect call state:', rpcError.message);\n      else void notifyCallEnded(current.id);",
       'Dismiss native Android incoming screen on hangup')
change('components/ConnectAudioCalls.tsx',
       "    if (!isLive(next.status)) {\n      if (next.status === 'missed'",
       "    if (!isLive(next.status)) {\n      void notifyCallEnded(next.id);\n      if (next.status === 'missed'",
       'Dismiss native Android incoming screen after remote end')

# Remove the raised, outlined tile around the in-chat handset, retain the accessible tap target.
css=Path('app/calls.css')
source=css.read_text(encoding='utf-8')
marker='/* Connect 1.3.3: minimalist call icon in the chat header. */'
if marker not in source:
    css.write_text(source.rstrip()+'''\n\n'''+marker+'''
.connect-app .chat-header .connect-call-trigger {
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  border-radius: 0;
}
''',encoding='utf-8')
    print('Updated: remove outline around handset')
else:
    print('Already applied: remove outline around handset')

# ---- Additional fixes requested before the final 1.3.3 test build ----

# Browser audio files must have an inline player, even if they arrived as generic
# attachment_kind="file" (the former sender classified everything except images/videos as file).
change('app/page.tsx',
       'type Gesture = {',
       '''function isPlayableAudioFile(m: Message): boolean {
  if (m.attachment_kind !== 'file') return false;
  return (m.attachment_type || '').toLowerCase().startsWith('audio/') ||
    /\\.(?:mp3|m4a|aac|wav|ogg|oga|opus|flac|aif|aiff)$/i.test(m.attachment_name || '');
}

type Gesture = {''',
       'Detect generic MP3 and other audio attachments without changing voice-note handling')
change('app/page.tsx',
       '''                            : <button type="button" className="attachment-file" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Файл')}}><Icon name="file" size={23}/><span>{m.attachment_name || 'Файл'}<small>{m.attachment_size ? (m.attachment_size/1048576).toFixed(1)+' МБ' : ''} · Скачать</small></span></button>}''',
       '''                            : isPlayableAudioFile(m) ? <div className="connect-inline-audio-file"
                                onTouchStart={e=>e.stopPropagation()} onTouchMove={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()}>
                                <div className="connect-inline-audio-name"><Icon name="file" size={17}/><span>{m.attachment_name || 'Аудиофайл'}</span></div>
                                <audio controls preload="metadata" src={attachmentUrls[m.attachment_path]} aria-label={m.attachment_name || 'Прослушать аудиофайл'}
                                  onClick={e=>e.stopPropagation()} onContextMenu={e=>e.stopPropagation()}/>
                                <button type="button" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Аудиофайл')}}>Сохранить</button>
                              </div>
                            : <button type="button" className="attachment-file" onClick={e=>{e.stopPropagation();void saveAttachment(m.attachment_path!,m.attachment_name || 'Файл')}}><Icon name="file" size={23}/><span>{m.attachment_name || 'Файл'}<small>{m.attachment_size ? (m.attachment_size/1048576).toFixed(1)+' МБ' : ''} · Скачать</small></span></button>}''',
       'Show inline audio player while retaining a separate Save action')

css = Path('app/globals.css')
original = css.read_text(encoding='utf-8')
marker = '/* Connect 1.3.3: inline audio file preview */'
if marker not in original:
    css.write_text(original.rstrip() + '\n\n' + marker + '''
.connect-inline-audio-file { width: min(100%, 330px); min-width: 240px; max-width: 100%; padding: 6px 2px; display:flex; flex-direction:column; gap:8px; }
.connect-inline-audio-file .connect-inline-audio-name { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--text); min-width:0; }
.connect-inline-audio-file .connect-inline-audio-name span { display:block; overflow-wrap:anywhere; min-width:0; }
.connect-inline-audio-file audio { display:block; width:100%; height:40px; border-radius:24px; }
.connect-inline-audio-file > button { align-self:flex-start; border:1px solid color-mix(in srgb,var(--accent) 26%, transparent); color:var(--text); background:color-mix(in srgb,var(--accent) 16%, transparent); padding:6px 13px; border-radius:12px; font-size:12px; }
@media(max-width:350px){.connect-inline-audio-file{min-width:0;width:100%;}}
''', encoding='utf-8')
    print('Updated: inline audio player styling')
else:
    print('Already applied: inline audio player styling')

# Android WebView preview: play the bundled native WAV in the proper notification stream.
# iOS/browser: unlock the Web Audio context on the tap and resume it before scheduling notes.
settings = Path('components/ConnectNotificationSettings.tsx')
text = settings.read_text(encoding='utf-8')
old = '''function play(sound: Sound) {
  if (sound==='silent') return;
  const Audio = window.AudioContext;
  if (!Audio) return;
  const ctx = new Audio();
  const notes = sound==='bright'?[880,1175]:sound==='gentle'?[523,659]:[740,988];
  notes.forEach((freq,i)=>{
    const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.13;
    o.type='sine';o.frequency.value=freq;
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(.08,t+.012);
    g.gain.exponentialRampToValueAtTime(.0001,t+.24);
    o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.25);
  });
  setTimeout(()=>void ctx.close(),850);
}'''
new = '''async function play(sound: Sound) {
  if (sound === 'silent') return;
  if (window.ConnectAndroid?.previewBuiltInSound) {
    window.ConnectAndroid.previewBuiltInSound(sound);
    return;
  }
  const audioWindow = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Audio = audioWindow.AudioContext || audioWindow.webkitAudioContext;
  if (!Audio) return;
  const ctx = new Audio();
  try {
    // A suspended context silently fails on some PWA/browser combinations.
    if (ctx.state === 'suspended') await ctx.resume();
    const notes = sound === 'bright' ? [880,1175] : sound === 'gentle' ? [523,659] : [740,988];
    notes.forEach((freq,i) => {
      const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.13;
      o.type='sine';o.frequency.value=freq;
      g.gain.setValueAtTime(.0001,t);
      g.gain.exponentialRampToValueAtTime(.08,t+.012);
      g.gain.exponentialRampToValueAtTime(.0001,t+.24);
      o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.25);
    });
  } finally {
    setTimeout(() => { void ctx.close().catch(() => {}); }, 850);
  }
}'''
if new not in text:
    assert text.count(old) == 1, f'Standard preview patch: expected one, found {text.count(old)}'
    text=text.replace(old,new,1)
    print('Updated: iOS/PWA and Android built-in sound preview')
else:
    print('Already applied: standard preview')
old = '      previewSound: (kind: string) => void;'
new = '      previewSound: (kind: string) => void;\n      previewBuiltInSound?: (sound: Sound) => void;'
# Correct string injection (do not write a literal backslash-n)
new = new.replace('\\n','\n')
if new not in text:
    assert text.count(old) == 1, 'Native audio preview type hook not found'
    text=text.replace(old,new,1)
    print('Updated: typed native sound preview bridge')
settings.write_text(text, encoding='utf-8')


# Proximity sensor: notify the Android bridge for BOTH caller and callee when WebRTC connects.
# Callee already reports "active" after answering, but the caller needs this signal too.
change('components/ConnectAudioCalls.tsx',
       "if (pc.connectionState === 'connected') { if (!enteredRef.current) soundRef.current?.connected(); enteredRef.current = true; setPhase('active'); setError(''); }",
       "if (pc.connectionState === 'connected') { if (!enteredRef.current) soundRef.current?.connected(); enteredRef.current = true; if (callRef.current) window.ConnectAndroid?.setCallState(callRef.current.id, 'active'); setPhase('active'); setError(''); }",
       'Enable native proximity sensor on connected calls (caller and callee)')
