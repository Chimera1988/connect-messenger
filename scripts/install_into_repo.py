#!/usr/bin/env python3
"""Apply the PWA audio calls UI integration to an unpacked Connect Messenger repo.

Run in project root after copying the packaged component, CSS, route and SQL file.
Backs up page.tsx and layout.tsx; refuses unknown source shapes; idempotent.
"""
from pathlib import Path
import sys

root = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
page = root / 'app' / 'page.tsx'
layout = root / 'app' / 'layout.tsx'

if not page.exists() or not layout.exists():
    raise SystemExit('Нужна папка Connect Messenger с app/page.tsx и app/layout.tsx')

old_page = page.read_text(encoding='utf-8')
new_page = old_page
imp = "import ConnectAudioCalls from '../components/ConnectAudioCalls';"
if imp not in new_page:
    anchor = "'use client';"
    if new_page.count(anchor) != 1:
        raise SystemExit('Не удалось найти точку импорта в app/page.tsx')
    new_page = new_page.replace(anchor, anchor + '\n\n' + imp, 1)

mount = '<ConnectAudioCalls client={supabase} userId={user?.id || null} conversationId={selected?.id || null} peerId={selected?.other?.id || null} peerName={currentName}/>'
if mount not in new_page:
    # Current Connect root: JSX returns app shell before the login/chat branches.
    line = next((s for s in new_page.splitlines() if "return <div className={'connect-app '" in s and 'as CSSProperties}>' in s), None)
    if not line or new_page.count(line) != 1:
        raise SystemExit('Не удалось найти оболочку Connect в app/page.tsx. Изменения не применены.')
    new_page = new_page.replace(line, line + '\n    ' + mount, 1)

old_layout = layout.read_text(encoding='utf-8')
new_layout = old_layout
css_imp = "import './calls.css';"
if css_imp not in new_layout:
    anchor = "import './liquid-glass.css';" if "import './liquid-glass.css';" in new_layout else "import './globals.css';"
    if new_layout.count(anchor) != 1:
        raise SystemExit('Не удалось найти импорт CSS в app/layout.tsx. Изменения не применены.')
    new_layout = new_layout.replace(anchor, anchor + '\n' + css_imp, 1)

for f,old,new in [(page,old_page,new_page),(layout,old_layout,new_layout)]:
    if old != new:
        backup = f.with_suffix(f.suffix + '.before-audio-calls.bak')
        if not backup.exists(): backup.write_text(old, encoding='utf-8')
        f.write_text(new, encoding='utf-8')
        print('Изменён:', f.relative_to(root))
    else: print('Уже установлен:', f.relative_to(root))

print('Готово. Запустите npm run build и проверьте вызов между двумя открытыми PWA.')
