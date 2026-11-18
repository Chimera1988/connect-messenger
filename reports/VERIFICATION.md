# Проверка пакета

Финальный последовательный прогон выполнен на Node 22.23.5. Typecheck, архитектура, Deno и production build прошли; **222/222 regression/integration тестов и 1/1 сквозной тест PWA** прошли без пропусков. Команды и критерии:

- Node 22.23.5, зависимости по lockfile, Playwright 1.58.2 и его Chromium.
- `npm run typecheck -- --incremental false`: без ошибок.
- `npm run check:architecture`: нет циклов runtime imports и client→privileged server imports.
- `npm test`: автоматически обнаруженные regression/integration, SQL/RLS, реальные браузерные media/cache, WebRTC/Opus; ни один провал не игнорируется.
- Deno 2.5.6 `npm run check:edge`: отдельный strict check с frozen lockfile.
- `npm run build`: production сборка с изолированными публичными test values.
- `npm run test:e2e`: production PWA, мобильный Chromium, все внешние service запросы перехвачены. Черновики, одинаковые имена, call IDs, offline verification без remount, cold notification intent, logout.
- Installer: SHA-256, source drift до записи, path guard, повторное применение; полный dry-run на отдельном checkout исходной версии.
- Backend: исходное и целевое определения функций, повтор всех пяти upgrades, отказ при неизвестном schema drift. Отдельные guards запрещают backend без подтверждения/backup ID и публикацию до проверок.

До изменений исходные `typecheck` и `npm test` проходили. Полное обнаружение старых тестов выявило нестабильность media-recovery: закреплённый Playwright принимал async Promise в waitForFunction за truthy значение. Исправлено ожидание реального результата; проверки декодирования и восстановления не ослаблены.

Тестовые Auth/Storage границы в PGlite — синтетические; реальные GoTrue/Storage API и физические iOS/Android в этой сессии не испытывались. Рабочая БД/remote Git не изменялись. Абсолютное отсутствие дефектов не заявляется.

Installer dry-run: 189 проверенных путей дважды применены к отдельному checkout базы без ошибок; повторное применение не меняет целевой результат. Изменённый исходник, повреждённый payload и выход за корень отвергаются до записи. YAML делит payload на короткие шаги (каждый run меньше лимита GitHub 21 000 символов).

Production dependency audit: исходно 10 advisories (1 high, 9 moderate); после lockfile overrides PostCSS 8.5.23 и uuid 11.1.1 — **0 advisories**. Next.js 15.5.28 / Firebase Admin 13 сохранены. Проверены CommonJS UUID API и инициализация реального Firebase Messaging SDK без запросов к сервису.

GitHub Actions: actionlint 1.7.7 с проверкой официального checksum — без ошибок; исполнены точные shell-шаги staging/apply из standalone YAML на чистой базе, сверены все 189 целевых хешей.

Полный npm audit (production + development): 0 info/low/moderate/high/critical advisories на момент финальной проверки.
