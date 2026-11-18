# Connect: архитектурный аудит и подготовленные исправления

База исходников: `b400ecc2057848d00998b04db813bcb2440ff79e`, 18 ноября 2026. После указания пользователя реализация и проверка выполнялись одним агентом. Рабочая БД, опубликованные функции, remote branches и main в этой сессии не изменялись; локальные изменения не закоммичены.

## Общая оценка

Проект имеет работоспособное функциональное ядро, но развивался серией частных исправлений. Наиболее опасны были разное понимание живой сессии, владения ресурсами и подтверждённой серверной операции. Отсутствие общего контракта превращало временную ошибку сети в потерю состояния, ложную отправку или неполную очистку.

Предлагаемая версия сохраняет стек и пользовательские функции. Общие границы теперь выражены кодом: verified session, поколения операций, стабильные UUID, собственники push/очередей, отдельные cache metadata и GC retirement. Импортные циклы проверяются автоматически. Большой координатор экранов и исторический CSS ещё требуют дисциплины при дальнейшем развитии: размер файла сам по себе не доказывает ошибку, но новые доменные протоколы следует добавлять в выделенные модули.

Отсутствие любых недостатков доказать нельзя. Ниже отделены подтверждённые исправления от непроверенных на рабочих устройствах/платформе условий. E2EE не включалось и не заявляется.

## Топ-10 исходных рисков

1. **F02** — Отозванная сессия сохраняет доступ к API/RPC.
2. **F17** — Удаление аккаунта стирает peer history/частично повреждает профиль.
3. **F11** — GC удаляет файл после конкурентного появления ссылки.
4. **F03** — Push installation остаётся связанной с прежним аккаунтом.
5. **F04** — Web Push endpoint допускает серверный запрос на посторонний адрес.
6. **F07** — Поздняя операция меняет другой контекст.
7. **F09** — Потеря finish оставляет серверный звонок active.
8. **F05** — Общий feed даёт неверный unread и лишний сетевой трафик.
9. **F13** — Upload/commit/retry создают orphan или дубли.
10. **F08** — Учёт кеша может выгрузить мобильную вкладку.

## Подробные результаты

### F01. Backend отсутствовал в проверяемом исходном контракте

**Критичность исходного дефекта:** Высокая. **Место:** `supabase/baseline/connect.sql:5` (begin;).

Схема/RLS и часть Edge Functions существовали только в Supabase. История отдельных patch SQL не воспроизводила действующее состояние. Причина — выпуск исправлений вне единого source of truth; следствие — непроверяемый rebuild и опасное применение старых миграций.

**Исправление:** Добавлены schema-only baseline, снимок типов, четыре активные Edge Functions, gateway config, отдельный Deno lock и preflight применимости upgrades. Исторические maintenance endpoint сохранены справочно. Секреты, cron credentials и пользовательские данные в snapshot не входят.

**Объём:** Восстановление контракта, не перепись backend. **Проверка:** `backend-baseline.test.cjs; backend-upgrade.test.cjs`.

### F02. Разные определения авторизованной сессии

**Критичность исходного дефекта:** Критическая. **Место:** `lib/server/admin.ts:26` (export async function authenticatedUser).

Часть API доверяла getUser/JWT без проверки живой auth.sessions и блокировки. SECURITY DEFINER RPC обходили табличные RLS. Причина — независимые проверки в каждом маршруте; отзыв сессии не означал немедленного запрета прямых операций.

**Исправление:** Общий authenticatedUser/HttpError, проверка session ID после валидации JWT, различение 401/403/503, ограничительные RLS для прямых таблиц/Storage, проверки внутри RPC звонков и общий Edge auth.

**Объём:** Локальные API изменения + системный SQL guard; перепись Auth не нужна. **Проверка:** `server-security.test.cjs; live-session-rls.test.cjs; edge-authorization.test.cjs`.

### F03. Владение push-установкой и logout

**Критичность исходного дефекта:** Высокая. **Место:** `supabase/migrations/20261118141042_connect_session_push_security.sql:30` (create or replace function public.connect_register_push_device).

Регистрация по пользователю не гарантировала единственного владельца endpoint и привязки к конкретной сессии. Выход при сетевой ошибке мог оставить адрес другого аккаунта пригодным для push.

**Исправление:** Уникальность endpoint, атомарная перепривязка, session FK/cascade, targets только с точной живой сессией; logout снимает текущую установку и сразу блокирует worker identity. Legacy без session ID не заимствует сессию другого устройства: открытие клиента повторно регистрирует push.

**Объём:** Локальная миграция и общий lifecycle. **Проверка:** `push-ownership.test.cjs; push-session.test.cjs; app-badge-push.test.cjs`.

### F04. Произвольный адрес Web Push

**Критичность исходного дефекта:** Высокая. **Место:** `lib/server/push-destination.ts:13` (export function validPushSubscription).

Переданный endpoint мог превратить привилегированный сервер в отправителя запросов на произвольный HTTPS адрес. Причина — принятие валидного URL за допустимый адрес push-провайдера.

**Исправление:** Проверяются известные HTTPS провайдеры, отсутствие credentials/порта/fragment, форма ключей и совпадение endpoint. Проверка применяется при регистрации и перед отправкой legacy данных. Привилегированные операции имеют атомарные DB rate limits.

**Объём:** Локальный валидатор и интеграция маршрутов. **Проверка:** `push-destination.test.cjs; call-push-delivery.test.cjs; server-security.test.cjs`.

### F05. Неполная inbox-модель и постоянные опросы

**Критичность исходного дефекта:** Высокая. **Место:** `lib/chat/use-inbox.ts:12` (export function useInbox).

Общие последние 1000 messages каждые 3 секунды не давали точный unread старых чатов; открытый чат независимо получал 200 сообщений. Состояния и presence повторно запрашивались. Причина — общий feed использовался как индекс диалогов и как счётчик.

**Исправление:** Отдельная RLS summary RPC: последняя запись и точный count по диалогу, local read/clear/hide. Realtime invalidation + сериализованная адаптивная сверка, пауза в фоне, восстановление на online/visibility. Presence обновляется событиями; read receipt инвалидирует точный счётчик, а не считает по одной summary-записи.

**Объём:** Заменена inbox подсистема; tuple-history сохранена. **Проверка:** `inbox-summary.test.cjs; reconciler.test.cjs; history-browser.test.cjs; app.e2e.cjs`.

### F06. Большой координатор и DOM как скрытый API

**Критичность исходного дефекта:** Средняя. **Место:** `components/ConnectUiSlots.tsx:6` (export default function ConnectUiSlots).

Home совмещал представление, медиа и транспорт. CallBridge искал собеседника по имени в DOM; CallsHub/игра/тема наблюдали весь document. Это давало скрытые связи и неверный выбор при одинаковых именах.

**Исправление:** Явные target IDs, общий контекст, UI slots, чистое вычисление темы и callbacks меню. Выделены primitives, голос, видео, камера, аватар, модель, preview, attachments, delivery и inbox transport. Крупный координатор экранов сохранён; дальнейшее дробление допустимо только по владельцам состояния, а не произвольным строкам.

**Объём:** Поэтапное разделение, не тотальная перепись UI. **Проверка:** `browser-client.test.cjs; app.e2e.cjs; check:architecture; существующие UI browser tests`.

### F07. Поздний ответ менял другой чат/аккаунт

**Критичность исходного дефекта:** Высокая. **Место:** `lib/session-scope.ts:4` (export class SessionScope).

Асинхронные send/upload/directory/receipt callbacks захватывали прежний контекст. После A→B→A одного сравнения chat ID недостаточно. Общие composer/receipt refs не выражали владельца.

**Исправление:** Поколения сессии и навигации, синхронная invalidation, отдельные черновики/файлы по owner+chat, guards перед UI writes, очистка receipt refs на reset. Панель приглашений также использует общую verified identity/admin роль и не принимает поздний список email после reset. Очереди доставки проверяют текущую SDK identity до повтора и не отбрасывают чужие намерения под новым токеном.

**Объём:** Общий примитив владения + локальные guards; хранение истории не переписано. **Проверка:** `session-scope.test.cjs; chat-send-context.test.cjs; composer-store.test.cjs; invitation-lifecycle.test.cjs; message-delivery.test.cjs; app.e2e.cjs`.

### F08. Учёт кеша загружал все binary records

**Критичность исходного дефекта:** Высокая. **Место:** `lib/media-cache.ts:102` (async function entries).

getAll бинарного object store для stats/trim масштабировал RAM по объёму сохранённых файлов. На мобильном устройстве это могло вызвать выгрузку вкладки и потерю UI state.

**Исправление:** Отдельный metadata store/index user, cursor migration, атомарная запись объекта+метаданных, сериализация trim, ограничение idle object URLs. Бинарные данные читаются по одному запрошенному ключу.

**Объём:** Локальная эволюция IDB v4; прежние данные читаются. **Проверка:** `cache-accounting.test.cjs; cache-browser.test.cjs; media-recovery.test.cjs; pwa-media-egress.test.cjs`.

### F09. Намерение завершить звонок терялось при ошибке RPC

**Критичность исходного дефекта:** Высокая. **Место:** `lib/calls/finish.ts:11` (export function queueCallFinish).

Локальная очистка происходила перед одиночным RPC; его ошибка оставляла сервер active до старого fallback. На втором устройстве поздняя отмена могла конфликтовать с принятым ответом.

**Исправление:** Постоянные отдельные finish intents по owner/call/proof, идемпотентный повтор, owned finish с отпечатком исходного answer. Двусторонние leases освобождают зависшие обновлённые звонки; legacy peer сохраняет совместимый fallback.

**Объём:** Выделен протокол завершения; ICE/WebRTC не переписаны. **Проверка:** `call-finish-recovery.test.cjs; call-device-ownership.test.cjs; call-lease.test.cjs; call-rtc.integration.cjs`.

### F10. Ручные workflow и неполный набор проверок

**Критичность исходного дефекта:** Высокая. **Место:** `scripts/test-all.cjs:3` (function discover).

npm test перечислял часть файлов вручную; старые installers делали прямой push в main. Проверка могла быть зелёной при непройденных новых регрессиях.

**Исправление:** Автоматическое обнаружение regression/integration и отдельное обнаружение e2e, обязательные push/PR проверки, Deno/SQL/WebRTC/build/production flow, архитектурный guard. Три конкурирующих main-push installers архивированы. Новый installer публикует только проверенный PR.

**Объём:** Замена механизма CI/установки, без замены тестовых движков. **Проверка:** `test-discovery.test.cjs; installer.test.cjs; backend-apply-guards.test.cjs`.

### F11. GC check/delete без межоперационного барьера

**Критичность исходного дефекта:** Критическая. **Место:** `supabase/migrations/20261118143901_connect_gc_account_protocol.sql:49` (create or replace function public.connect_gc_prepare).

После проверки отсутствия ссылки её можно было добавить до Storage remove. Несколько workers могли обрабатывать одну задачу. Retained references в начале LIMIT могли блокировать более поздние доступные задачи.

**Исправление:** Общий advisory lock, retirement guard на новые ссылки/Storage, worker lease и проверяемый ack. Отбор допустимых кандидатов выполняется до LIMIT. Worker удаляет оригинал и производные через Storage API; повтор после lost response безопасен.

**Объём:** Переработан протокол GC/ссылок; сервис Storage сохранён. **Проверка:** `gc-account-protocol.test.cjs; gc-candidates.test.cjs; backend-upgrade.test.cjs`.

### F12. Позднее разрешение микрофона и повторный старт

**Критичность исходного дефекта:** Высокая. **Место:** `components/chat/VideoNoteRecorder.tsx:8` (function VideoNoteRecorder).

Permission promise мог завершиться после ухода/выхода; два тапа запрашивали два потока. Shared recorder refs позволяли старому onstop менять новую запись.

**Исправление:** Генерация операции, стартовый lock, локальные chunks, проверка recorder identity, reset cleanup треков/таймеров; native поздний результат также проверяет scope. Компонент камеры выделен с сохранением форматов и ориентации; позднее разрешение переключения камеры после закрытия останавливает новый поток, а начало записи не пересекается с переключением.

**Объём:** Локальный lifecycle fix и выделение представления. **Проверка:** `recording-lifecycle.test.cjs; camera-lifecycle.test.cjs; media-lifecycle.test.cjs; существующие voice/video browser tests`.

### F13. Дублирование upload и неверное признание неудачи

**Критичность исходного дефекта:** Высокая. **Место:** `lib/chat/attachments.ts:13` (export async function deliverAttachments).

Файлы/альбомы имели параллельные реализации; INSERT failure оставлял orphan, выбор файлов очищался при ошибке. Потерянный ответ мог дублировать сообщение. Подпись URL после успешного commit могла превратить успех в ложную ошибку.

**Исправление:** Единая подготовка/перенос/commit, отмена TUS/fetch, upload lease и отложенная компенсация, стабильный UUID и outbox, сохранение выбора при настоящей ошибке. Необязательная подпись URL не меняет статус commit.

**Объём:** Объединены дублирующие реализации, UI callbacks сохранены. **Проверка:** `attachment-delivery.test.cjs; message-delivery.test.cjs; upload-cancel.test.cjs; pwa-media-optimizer.test.cjs`.

### F14. Недостижимая web-ветка в Android настройках

**Критичность исходного дефекта:** Низкая. **Место:** `components/ConnectNotificationSettings.tsx:135` (async function activate).

Первоначальная формулировка о двух одновременно работающих PWA push реализациях была чрезмерной. Фактически PWA уже использовала общий reconcile; дублирующий web-код находился внутри native-only компонента.

**Исправление:** Удалена недостижимая web-активация; работающий reconcile/diagnostics сохранён, добавлена проверка владельца SDK session. Это исправление оценки аудита, а не выдуманная перепись push.

**Объём:** Локальное удаление dead branch. **Проверка:** `connect-push-repair.test.cjs; push-diagnostics.test.cjs`.

### F15. Click уведомления не доводил intent до чата

**Критичность исходного дефекта:** Средняя. **Место:** `lib/chat/use-push-navigation.ts:5` (export function usePushNavigation).

Worker отправлял conversation intent, но приложение не имело полного потребителя для warm/cold старта. Произвольный ID нельзя открывать до проверки личности и списка доступных чатов.

**Исправление:** Typed intent, очередь до подтверждения Auth/directory, проверка owner/membership/UUID, очистка URL-параметров после обработки.

**Объём:** Локальная интеграция navigation lifecycle. **Проверка:** `push-navigation.test.cjs; app.e2e.cjs`.

### F16. Музыка переживала смену аккаунта

**Критичность исходного дефекта:** Высокая. **Место:** `components/ConnectMusicSystem.tsx:166` (sessionScope.onReset).

Музыкальный provider жил выше экрана, независимо получал SDK identity и сохранял общий playback. Скрытие UI не останавливало аудио/декодер и приватный playlist.

**Исправление:** Общая verified identity, reset пауза/удаление src/load/таймеров/playlist, сохранение воспроизведения по владельцу. Между экранами музыка продолжает работать.

**Объём:** Локальный lifecycle fix; музыкальные функции сохранены. **Проверка:** `media-lifecycle.test.cjs; typecheck; проверка lifecycle wiring`.

### F17. Удаление аккаунта повреждало профиль и историю peer

**Критичность исходного дефекта:** Критическая. **Место:** `app/api/account/delete/route.ts:6` (export async function POST).

API заранее затирал имя/bio/avatar и при Auth failure восстанавливал только is_blocked. Действующий auth-delete trigger удалял диалог целиком вопреки обещанию UI сохранить историю собеседника.

**Исправление:** До Auth delete нет предварительного изменения профиля. Password-check session закрывается. В одной транзакции Auth удаления остаётся обезличенный profile tombstone, заканчиваются активные звонки, удаляются личные настройки; peer messages/calls и живые file references сохраняются.

**Объём:** Системная правка SQL semantics + локальный route fix. **Проверка:** `account-delete-atomic.test.cjs; gc-account-protocol.test.cjs; backend-upgrade.test.cjs`.

### F18. Слабые контракты типов и накопившийся структурный долг

**Критичность исходного дефекта:** Средняя. **Место:** `lib/native-bridge.d.ts:2` (type NativeCommands).

БД/Native commands были слабо типизированы, Deno код не проверялся Next tsc, неиспользуемые приглашения и огромные UI фрагменты усложняли сопровождение. CSS содержит исторические native/iOS overrides.

**Исправление:** Generated DB snapshot + typed shared client/upgrade overlay, command/result map Native, отдельная строгая проверка Deno, удалены доказанно неиспользуемые invite paths/imports. Удалено одно буквально идентичное CSS правило; совместимые overrides сохранены и проверены браузером.

**Объём:** Локальная типизация и поэтапная декомпозиция; массовая замена CSS/стека не обоснована. **Проверка:** `typecheck; check:edge; check:architecture; UI/media browser regressions`.

### F19. Production зависимости с опубликованными advisories

**Критичность:** высокая для PostCSS, средняя для UUID-цепочки. **Место:** `package.json` → `overrides`, `package-lock.json` → PostCSS/uuid и их потребители Next/Firebase. Исходный audit: 10 advisories. Уязвимые операции PostCSS связаны с обработкой недоверенного CSS/source maps, UUID — с bounds check в определённых API; это не доказательство эксплуатации текущей PWA.

Причина — закреплённые транзитивные зависимости без отдельного security gate. Исправлено минимальными overrides: PostCSS 8.5.23, уязвимые UUID → 11.1.1; основные версии Next 15 / Firebase Admin 13 сохранены. Проверены CommonJS UUID API и реальная инициализация Firebase Messaging, затем весь regression/build. Новый `audit:prod` блокирует появление high/critical advisories в CI. Итоговый production audit: 0 advisories. Перепись модулей не нужна.

## Места с накопившимися заплатками

- `app/page.tsx`: UI, разрешения, загрузки, auth и синхронизация ранее жили вместе. Выделены доменные протоколы и media presentation; координатор остаётся крупным, новые независимые функции в него добавлять не следует.
- `.github/workflows/*seamless*`: три конкурирующих исправляющих workflow с push в main перенесены в `.github/archived-workflows/*.disabled`.
- `ConnectCallBridge`, `ConnectDynamicTheme`, `ConnectUiCoordinator`, portal discovery CallsHub/Runner: скрытое DOM взаимодействие заменено явными props/context/slots.
- `sendAttachment`/`sendAlbum`: общий `deliverAttachments`, один optimizer/upload/commit путь.
- `ConnectNotificationSettings`: удалена недостижимая web-ветка Android компонента; работающий PWA repair сохранён.
- `media-cache`: прежние фиксы ошибок декодирования сохранены как проверенные контракты. Нестабильность старого теста объяснена неверным ожиданием Promise в Playwright, а не скрыта дополнительной задержкой.
- `app/liquid-glass.css` и остальные media CSS: сохранены смысловые iOS/native fallback; удалено только подтверждённое буквальное повторение. Массовое удаление `!important` без device проверки не является безопасным рефакторингом.

## Карта зависимостей и опасные участки

Карта модулей приведена в [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md). Циклы статических runtime imports отсутствуют по автоматической проверке; это не доказательство отсутствия логических связей через события/БД.

| Участок | Ключевой инвариант |
|---|---|
| HTTP auth / RLS / SECURITY DEFINER | Тот же пользователь, существующая сессия, незаблокированный профиль |
| Scope / composer / async completion | Старое поколение не меняет новый чат/аккаунт |
| Message outbox / upload lease | Один UUID на commit; компенсация не удаляет потенциально подтверждённые файлы |
| Call answer / finish / lease | Проигравшее устройство не завершает принятый чужим устройством звонок |
| GC / Storage / profile deletion | Retirement до remove; нет новых ссылок в промежутке; peer history остаётся |
| Service worker / push registry | Session-bound installation и owner ID уведомления |
| IDB / object URLs / audio tracks | Ограниченная память и явное освобождение ресурсов |

## Приоритеты применения и дальнейшего сопровождения

1. Проверить PR и резервную копию; испытать backend на staging. Сначала применять guards/RPC/GC/account upgrades, затем выпускать PWA. Baseline не применять к существующей БД.
2. Перерегистрировать старые push installations открытием клиента. Проверить два пользователя/два устройства, отзыв сессии, смену аккаунта и push.
3. Проверить физические iOS/Android: фон/возврат, permission cancel, Bluetooth/динамик, камера/ориентация, реальные FCM/APNs/TURN. Linux Chromium и синтетический RTC это не заменяют.
4. При дальнейшем росте измерять реальные DB планы, размер каталогов и очередей, мобильную память, reconnect latency. Не обещать численное ускорение без production замера.
5. Поддерживать CI обязательным для PR; выделять следующую независимую область состояния из координатора только вместе с поведенческим контрактом. Исторические maintenance endpoint исключены из автоматического выпуска, не удалять их без проверки recovery потребностей.

## Что не следует переписывать

- Supabase как текущий источник истины и существующие participant/hidden visibility правила. Возврат dual-write/Neon path не нужен.
- Tuple paging `(created_at,id)`, локальные reading anchors и журнал удалений/tombstone barriers.
- Generation guards, очередь ICE, immutable answer identity и многоприборную защиту принятия звонка.
- Проверенные iOS media fallbacks, lazy waveform/poster, отсутствие параллельной полной загрузки streaming video/audio.
- Рабочий Web Push reconcile/diagnostics; он уже был общим PWA механизмом.
- Olm/NaCl groundwork, vault и crypto tests: сохранять изолированно, не включать собственный E2EE протокол как побочный эффект рефакторинга.
- Внешний вид/поведение игры, музыкальной библиотеки, галереи, стикеров, приглашений и native API; менялись границы владения, а не набор этих функций.

## Проверки и границы результата

Подробный итог фактических запусков хранится в `reports/VERIFICATION.md`. Проверены настоящее выполнение SQL/RLS через PGlite, реальные IndexedDB/media в Chromium, двусторонний локальный WebRTC/Opus, Node 22, TypeScript, Deno, сборка и сквозной сценарий production PWA с синтетическими service fixtures.

Не выполнены: изменение/испытание рабочей БД, отправка реальных push, звонки через рабочий TURN, физические устройства, нагрузочный замер на production. Старые уже удалённые данные кодом не восстанавливались. Проверка автора не заменяет независимое ревью. Порядок установки и backend выпуска находится в [docs/INSTALL_WORKFLOW.md](../docs/INSTALL_WORKFLOW.md) и [docs/BACKEND.md](../docs/BACKEND.md).
