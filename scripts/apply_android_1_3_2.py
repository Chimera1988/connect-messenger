#!/usr/bin/env python3
"""Idempotent, guarded patch for Connect Messenger PWA (Android 1.3.2).
This changes only three display/audio behavior points; Android updates are separate.
"""
from pathlib import Path

def change(path: str, old: str, new: str, label: str):
    file = Path(path)
    source = file.read_text(encoding='utf-8')
    if new in source:
        print(f'Skipping {label}: already applied')
        return
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one anchor, found {count}; no change saved')
    file.write_text(source.replace(old, new, 1), encoding='utf-8')
    print(f'Updated {label}')

change('components/ConnectAudioCalls.tsx',
       "    if (phase === 'incoming') soundRef.current?.start('incoming');",
       "    if (phase === 'incoming') {\n      // Android uses the selected native NotificationChannel sound; avoid a second browser ringtone.\n      if (window.ConnectAndroid) soundRef.current?.stop();\n      else soundRef.current?.start('incoming');\n    }",
       'Android native-only incoming ringtone')

change('components/ConnectCallsHub.tsx',
       '''      .connect-call-missed-dot { width: 9px; height: 9px; border-radius: 50%; background: #fa465e;
        position: absolute; top: 5px; right: calc(50% - 17px); box-shadow: 0 0 0 2px rgba(15,22,35,.9); }''',
       '''      .connect-app .bottom-nav .nav-symbol { position: relative; }
      .connect-app .bottom-nav .connect-nav-count {
        position: absolute; top: -8px; right: -12px; min-width: 18px; height: 18px;
        display: inline-flex; align-items: center; justify-content: center;
        padding: 0 4px; box-sizing: border-box; border-radius: 999px;
        font: 650 10px/1 system-ui, -apple-system, sans-serif; font-style: normal;
        background: color-mix(in srgb, var(--accent) 27%, #263649);
        color: var(--text); border: 1px solid color-mix(in srgb, var(--accent) 45%, rgba(215,230,250,.45));
        box-shadow: 0 1px 5px rgba(0,0,0,.22); pointer-events: none;
      }''',
       'neutral nav counters styling')

change('components/ConnectCallsHub.tsx',
       '''{unseenMissed > 0 && <span className="connect-call-missed-dot" aria-hidden="true"/>}''',
       '''{unseenMissed > 0 && <span className="connect-nav-count" aria-hidden="true">{unseenMissed > 99 ? '99+' : unseenMissed}</span>}''',
       'missed calls count display')

change('app/page.tsx',
       '''{item.id === 'chats' && unreadTotal > 0 && <em className="nav-dot"/>}''',
       '''{item.id === 'chats' && unreadTotal > 0 && <em className="connect-nav-count" aria-hidden="true">{unreadTotal > 99 ? '99+' : unreadTotal}</em>}''',
       'unread messages count display')
