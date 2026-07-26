# Карта репозитория

Навигация по `taksi_proj`: что где лежит и можно ли это менять. Обзор архитектуры —
[ARCHITECTURE.md](ARCHITECTURE.md).

Обозначения в колонке «Менять»:
**✅ да** — рабочий код · **⚠️ осторожно** — менять с пониманием последствий ·
**⛔ нет** — внешнее/чужое/сгенерированное.

---

## Корень репозитория

| Путь | Что это | Менять |
|---|---|---|
| `src/` | Код приложения | ✅ да |
| `docs/` | Эта документация | ✅ да |
| `config/` | Конфиги эджектнутого CRA: `webpack.config.js`, `webpackDevServer.config.js`, `paths.js`, `env.js`, `jest/` | ⚠️ осторожно — ломает сборку |
| `scripts/` | Скрипты CRA: `start.js`, `build.js`, `test.js`. `start.js` дополнительно поднимает панель эмулятора | ⚠️ осторожно |
| `public/` | Статика CRA. Настоящий шаблон — `public/index.html`. Здесь же `mock/agadir.{json,osm}` для `API/way.ts` | ⚠️ осторожно — копируется в прод как есть |
| `lib/` | Вендорные пакеты как file-зависимости: `react-dev-utils` (нужен эджекту), `react-leaflet-fullscreen-plugin` | ⛔ нет — вендор |
| `driver-emulator/` | **Отдельный Node-проект заказчика.** См. ниже | ⛔ **не трогать** |
| `artifacts/` | Дизайн/QA-артефакты: превью маркеров, `release-checklist.md` | ⚠️ осторожно |
| `package.json` | Манифест. Тут же inline-конфиг jest | ⚠️ осторожно |
| `package-lock.json` | Лок npm v3. Восстановление — `npm ci` | ⛔ нет — генерируется |
| `tsconfig.json` | `target: es5`, `strict`, `include: ["src"]`, `noEmit` | ⚠️ осторожно |
| `pre-build.js` | Пишет `buildTimestamp` в `src/version.json`. Дёргается из `prestart`/`prebuild` | ⚠️ осторожно |
| `vercel.json` | Деплой: `buildCommand`, заголовки кэша и CORS | ⚠️ осторожно |
| `.gitignore` | Игнорит `node_modules/`, `/build`, `/coverage`, `.env.*.local`, логи, IDE. `lib/` намеренно **не** игнорится | ⚠️ осторожно |
| `node_modules/` | Зависимости | ⛔ нет |
| `build/` | Вывод сборки. Игнорится git, появляется после `npm run build` | ⛔ нет — генерируется |

### Артефакты и мусор в корне

| Путь | Что это | Менять |
|---|---|---|
| `package_fixed.json` | Устаревший альтернативный манифест. Ни на что не ссылается. Отличия от рабочего: нет `leaflet.markercluster` и его типов, нет `engines`, нет тестовых скриптов, из start/build убран `pre-build.js` | ⛔ не использовать |
| `index.html` (корневой) | **Не шаблон приложения.** Дамп страницы Яндекс-Карт (`<title>Document</title>`, разметка `ymaps-*`). Сборкой не используется. Происхождение не задокументировано | ⛔ не использовать |
| `readme.md` | 3 строки, **устарел**: требует «Node.js до v14», тогда как `package.json` объявляет `engines.node: 24.x` | ⚠️ переписать |
| `changelog.md` | Лог миграций: React 16.13→19, react-router 6, Leaflet 1.6→1.9.4, MUI | ✅ да |
| `blocks.md` | Справочник типов блоков JSON-форм и их параметров | ✅ да |
| `json-form.md` | Спецификация движка JSON-форм: выражения, операторы, разрешение `visible` | ✅ да |
| `README_EMULATOR_PROJECT_RU.txt` | Инструкция по эмулятору водителей | ✅ да |
| `FIX_REPORT_*.txt` | **39 файлов**, отчёты прошлых сессий. Раскладка: `driver-emulator/` 10, `src/` 8, `public/` 7, `scripts/` 7, `build/` 7. Уникальны только набор в `driver-emulator/` и `src/FIX_REPORT_FLOW_LOGGING_AI_DIAGNOSTICS_2026_06_01.txt`; остальные 28 — четырёхкратные копии семи оригиналов | ⛔ новых не добавлять |

### ⚠️ Следы рекурсивного копирования

`public/`, `scripts/` и `src/` содержат **побайтово идентичные копии** десяти
корневых файлов (сверено по md5): `blocks.md`, `changelog.md`, `json-form.md`,
`readme.md`, `pre-build.js`, `tsconfig.json`, `vercel.json`, `.editorconfig`,
`.eslintrc.json`, `.vercelignore`. Плюс корневой `index.html` продублирован в
`scripts/` и `src/`, а `scripts/scripts/` — вторая копия скриптов CRA.

⚠️ Одно исключение: **`src/.eslintrc.json` реально подхватывается.** Ни в корневом,
ни в `src/` eslintrc нет `"root": true`, а ESLint здесь 7.x с каскадом eslintrc — то
есть для всего под `src/` сначала грузится копия, и корневой конфиг мержится под ней.
Это касается и `npm run lint-fix`, и `ESLintPlugin` в `config/webpack.config.js`, то
есть каждой сборки. Сейчас поведение не отличается только потому, что копия побайтово
равна корневой; любая правка корневых правил для `src/` будет перекрыта этой копией.

Остальные копии конфигами не используются. Два практических следствия:

- копии в `public/` **попадают в прод** — CRA копирует `public/` в `build/` как есть
  (в `build/` уже лежат семь `FIX_REPORT` и `blocks.md`);
- `src/tsconfig.json` и `src/config/`, `src/lib/` сбивают с толку редакторы и любые
  инструменты, которые ищут конфиг, поднимаясь по дереву вверх. Настоящая сборка
  использует **корневые** `config/` и `lib/`; в `src/config/webpack.config.js` лежит
  более старая ревизия.

Чистить эти дубли — отдельная задача, не побочный эффект другой работы.

## src/ — код приложения

| Путь | Что это | Менять |
|---|---|---|
| `src/pages/Driver/Map.tsx` | **Карта водителя.** «Радар» заказов: кластеры, прибыльность, таймеры, канал Platform Core. Основной файл миграции | ✅ да |
| `src/pages/Driver/index.tsx` | Страница водителя: вкладки, вотчеры заказов, отдаёт карте `user`/`activeOrders`/`readyOrders` | ✅ да |
| `src/pages/Driver/Orders.tsx` | Списки заказов (активные/готовые/история) | ✅ да |
| `src/pages/Passenger/` | Экран пассажира: карта + форма заказа, FSM интерфейса (`uiFsm.ts`, `fsm_config.json`), `VotingForm.tsx` | ✅ да |
| `src/pages/Order/` | Детали одного заказа, `/driver-order/:id` | ✅ да |
| `src/pages/Sandbox/` | Dev-песочница | ✅ да |
| `src/components/Map/index.tsx` | **ДРУГАЯ карта.** Общая/модальная: один заказ и его водители-кандидаты. Рендерится из `pages/Passenger` и `components/modals/MapModal`. **Не путать с картой водителя**; в задачах Platform Core не трогается | ⚠️ вне задач карты водителя |
| `src/components/modals/` | Система модалок: `ModalHost`, `ModalStack`, ~20 конкретных модалок | ✅ да |
| `src/components/DriverEmulatorPanel/` | Панель браузерного эмулятора, `browserEmulator.ts` (~2500 строк) | ⚠️ осторожно |
| `src/components/` (остальное) | Примитивы и доменные виджеты | ✅ да |
| `src/state/` | Redux: 10 модулей + `rootReducer.ts` / `rootSaga.ts`. Разбор — [STATE_AND_API.md](STATE_AND_API.md) | ✅ да |
| `src/API/` | Клиент бэкенда по домену на файл | ✅ да |
| `src/tools/` | Хелперы: `markerMock.ts` (мок карты), `emulatorMode.ts`, `convert.ts`, `hooks.ts`, `maps.ts`, логгеры | ✅ да |
| `src/types/`, `src/constants/`, `src/localization/`, `src/assets/`, `src/HOCs/`, `src/utils/` | Типы, статические таблицы, локализация, медиа, `withLayout`, `cookies.ts` | ✅ да |
| `src/version.json` | Версия + `buildTimestamp`. **Перезаписывается `pre-build.js`** при каждом старте/сборке, хотя и лежит под git | ⛔ правится автоматически |
| `src/config/`, `src/lib/` | ⚠️ Устаревшие копии корневых. Сборкой не используются | ⛔ не использовать |
| `src/setupTests.js` | Бутстрап тестов — одна строка комментария | ✅ да |
| `src/index.html`, `src/tsconfig.json`, `src/pre-build.js`, `src/vercel.json`, `src/*.md` | Следы копирования, см. выше | ⛔ не использовать |

## src/platform/ — Platform Core

| Путь | Что это | Менять |
|---|---|---|
| `src/platform/interaction-contract/` | **Внешний пакет.** 7 файлов чистых типов и классов ошибок, копия из `tylerrondo/voice-assistant`, сверяется по md5 с upstream | ⛔ **НЕТ, включая форматирование** |
| `src/platform/map-channel/` | Наш канал карты: `AppInteractionContract`, `MapMapper`, `MapChannel`, `MapApplicationHandler`, `useMapChannel`, `index.ts` | ✅ да — здесь и дорабатываем |

Правки контракта запрещены по определению: это единственная граница между картой и
приложением, общая для нескольких продуктов заказчика. Детали —
[MAP_CHANNEL.md](MAP_CHANNEL.md).

## driver-emulator/ — ⛔ не трогать

Отдельный Node-проект заказчика (`name: taxi-driver-simulator`, `engines: node >= 18`,
**нулевые зависимости** — только stdlib). Симулирует **водителей**: логинится под
реальными тестовыми аккаунтами из `driver-emulator/config.json`, опрашивает
`/drive/now` и автоматически отправляет офферы со случайной ценой, ETA и
комментарием, с разными задержками реакции. Дополнительно умеет генерировать
заказы (`src/order-generator.js`) и диагностировать окружение (`src/doctor.js`).

Это **не мок-сервер**: он работает против живого ibronevik. Свой `package.json`,
свои `.bat`-обёртки, свой `data/`, своя документация. В бандл React-приложения не
попадает, из `src/` не импортируется.

Запускается двумя независимыми путями:

1. **автоматически вместе с dev-сервером** — `scripts/start.js` спавнит
   `driver-emulator/src/control-panel.js` на `127.0.0.1:3099`, вывод идёт в консоль
   с префиксом `[driver-emulator]`. Отключается через `START_DRIVER_EMULATOR_PANEL=0`.
   В `scripts/build.js` ссылок на эмулятор нет — прод-сборка его не касается;
2. **вручную** — своими npm-скриптами или `.bat`-файлами (`run.bat`, `panel.bat`,
   `doctor.bat`).

### Важный нюанс: в приложении живёт ВТОРОЙ эмулятор

Эмуляторов два, и путать их легко:

| | Node-эмулятор | Браузерный эмулятор |
|---|---|---|
| Где | `driver-emulator/`, порт 3099 | `src/components/DriverEmulatorPanel/browserEmulator.ts` |
| Как работает | отдельный процесс, поднимается `scripts/start.js` | внутри React-приложения, ходит на бэк через `fetch`/`src/API` |
| Зачем такой | локальная разработка | работает и с Vercel-ссылок, без localhost |

Панель внутри приложения использует **браузерный** эмулятор. Обращений к порту 3099
из `src/` нет вообще — связка автозапуска и панели выглядит устаревшей. Задумано так
или нет — **не проверено**: в коде это нигде не оговорено. В типе `EmulatorStatus`
остались поля `pid`/`lastExit` от старого протокола.

Состояние браузерного эмулятора живёт в localStorage + `CustomEvent` на `window`
(`src/tools/emulatorMode.ts`, ключи `gruzvill_browser_emulator_*` — суффикс `_v2`,
кроме `…_driver_locations_v1`; событие `BROWSER_EMULATOR_STATE_EVENT`).
Режимы — `drivers` и `clients`. На эмулятор
завязаны ~22 файла в `src/`, включая селекторы `state/orders` (фильтрация
эмулированных заказов) и обе карты.

## Тесты

Настройка минимальная. Jest сконфигурирован inline в `package.json`
(`testEnvironment: jest-environment-jsdom-fourteen`, тесты ищутся в `src/**/__tests__/**`
и `src/**/*.{spec,test}.*`), запуск — `npm test`. Реально существуют **два** теста:

- `src/pages/Passenger/__tests__/uiFsm.test.js`
- `src/state/clientOrder/__tests__/orderFormResolvers.test.js`

`@types/jest` не установлен — глобалы объявлены как `any` в `src/testGlobals.d.ts`.
В `driver-emulator/` юнит-тестов нет: `check` — смоук-проверка против живого API, а
`doctor` — офлайн-проверка конфига и рантайма (нужен Node 18+ с `fetch`/`FormData`),
сеть не дёргает.

## Быстрые ориентиры

| Задача | Куда смотреть |
|---|---|
| Поведение карты водителя | `src/pages/Driver/Map.tsx` |
| Заказы: откуда берутся | `src/state/orders/` (саги-вотчеры) + `src/pages/Driver/index.tsx` |
| Модалки | `src/state/modals/` + `src/components/modals/` |
| Запрос к бэкенду | `src/API/` + обёртка `apiMethod` в `src/tools/api.ts` |
| Токены, базовый URL | `src/config.ts` (URL), `src/state/user/` (токены) |
| Граница Platform Core | `src/platform/map-channel/` |
| Демо без бэкенда | `src/tools/markerMock.ts`, см. [MOCK_MODE.md](MOCK_MODE.md) |
| Преобразование форм бэка | `src/tools/convert.ts` |
