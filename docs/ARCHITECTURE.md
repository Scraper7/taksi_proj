# Архитектура

Обзорный документ по репозиторию `taksi_proj`. Детали — в соседних файлах:
[MAP_CHANNEL.md](MAP_CHANNEL.md), [STATE_AND_API.md](STATE_AND_API.md),
[MOCK_MODE.md](MOCK_MODE.md), [REPOSITORY_MAP.md](REPOSITORY_MAP.md),
[STAGE1_REPORT.md](STAGE1_REPORT.md).

---

## Что это за приложение

Веб-приложение такси с двумя ролями в одной кодовой базе:

- **водитель** — «радар» заказов на карте, отклики/офферы, ведение поездки;
- **пассажир/клиент** — форма заказа, выбор водителя из откликнувшихся, live-заказ.

Роль определяется полем `u_role` пользователя, от неё зависит редирект на
`/driver-order` или `/passenger-order`. Приложение также умеет работать внутри
React Native WebView: `App.tsx` посылает `{type:'SYSTEM', message:'START'}` в
`window.ReactNativeWebView`, если тот присутствует.

Проект мигрирует на **Platform Core** — архитектурный стандарт заказчика:

```
Environment → Provider → Mapper → Channel → Interaction Contract → Application
```

Карта водителя — один из **каналов** взаимодействия. Stage 1 миграции завершён.

## Стек

| Слой | Технология |
|---|---|
| Сборка | **Эджектнутый CRA**, webpack 5.98 напрямую (`react-scripts` в зависимостях отсутствует, конфиги в `config/`, скрипты в `scripts/`) |
| UI | React **19**, TypeScript 5.7 (`target: es5`, `strict`), SCSS, MUI |
| Карты | Leaflet 1.9.4 + react-leaflet 5, `leaflet.markercluster` |
| Состояние | Redux 5 на `createStore`, паттерн `connect`, redux-saga + redux-thunk, Immutable.js |
| Роутинг | react-router-dom 6, страницы через `React.lazy` |
| Сеть | axios 0.21 → бэкенд **ibronevik** (`https://ibronevik.ru/taxi/c/{config}/api/v1`) |

Пакетный менеджер — **npm** (`package-lock.json` v3, `yarn.lock` отсутствует).
Тайпчек без сборки: `npx tsc --noEmit`. Прод-сборка (`npm run build`) сама гоняет
блокирующую проверку типов через `ForkTsCheckerWebpackPlugin`.

## Бутстрап

```
src/index.tsx
  ./preBootstrap
  React.StrictMode
    BrowserRouter
      Provider store={store}            ← src/state
        LocalizationProvider (moment)
          HelmetProvider
            App.tsx
              initUser(), activateChatServer() каждые 30 с
              Theme → AppRoutes + ModalHost
```

Роуты объявлены в `src/Routes.tsx`. Если конфигурация сервера не загрузилась
(`configSelectors.status !== Success`), вместо роутера рендерится заглушка
«база недоступна».

| Путь | Страница | Роль |
|---|---|---|
| `/passenger-order` | `pages/Passenger` | пассажир |
| `/driver-order` | `pages/Driver` | водитель |
| `/driver-order-test` | `pages/Driver` (тот же компонент) | водитель, тестовый алиас |
| `/driver-order/:id` | `pages/Order` | водитель, детали одного заказа |
| `/sandbox` | `pages/Sandbox` | dev |
| `/*` | редирект по `u_role` | — |

## Структура src/

| Папка | Назначение |
|---|---|
| `pages/` | Экраны: `Driver/` (карта + списки заказов), `Passenger/` (форма заказа + FSM интерфейса), `Order/` (детали заказа), `Sandbox/` |
| `components/` | ~50 папок: примитивы (`Button`, `Input`, `slider`), доменные виджеты (`MiniOrder`, `CarClassBadge`, `PassengerLiveOrder`), система модалок (`modals/` c `ModalHost` + `ModalStack`), общая карта (`Map/`), `JSONForm` (рендер форм по схеме), `DriverEmulatorPanel` |
| `state/` | Redux: 10 модулей одинаковой структуры (`constants`/`reducer`/`actionCreators`/`selectors`/`sagas`), сборка в `rootReducer.ts` и `rootSaga.ts` |
| `API/` | Клиент бэкенда, по файлу на домен: `order.ts`, `auth.ts`, `user.ts`, `car.ts`, `location.ts`, `way.ts`, `polygon.ts`; `index.ts` — barrel + геокодинг/маршруты/файлы |
| `platform/` | **Platform Core**: `interaction-contract/` (внешний пакет, менять запрещено) и `map-channel/` (наш канал карты) |
| `tools/` | Рабочая лошадка хелперов: `utils`, `api`, `convert`, `hooks`, `maps` (граф дорог), `driverOffer`, `markerMock`, `emulatorMode`, логгеры (`flowLog`, `rawLog`, `frontendLog`), `reliableTime` |
| `types/` | Общие типы: `types.ts` (домен — `IOrder`, `IUser`, `IDriver`, `ICar`, `EUserRoles`, `EBookingDriverState`), утилитарные типы, ambient-декларации |
| `constants/` | Статические таблицы: `images.ts`, `icons.ts`, `classAuto.ts`, `orders.ts`, `candidates.ts` |
| `localization/` | Своя реализация `t()` + `TRANSLATION`, без i18next. Словарь приходит с сервера в `window.data`, есть встроенные фолбэки для `ru`/`en`/`fr`/`ar` |
| `assets/` | Картинки, иконки (наборы `default/` и `GHA/`), шрифты |
| `HOCs/` | Один файл — `withLayout.tsx`, оборачивает страницу в `components/Layout` |
| `utils/` | Один файл — `cookies.ts`. Практически вырожденная папка: всё остальное живёт в `tools/` |
| `config/`, `lib/` | ⚠️ **Не код приложения.** Устаревшие копии корневых `config/` и `lib/`. Сборка использует корневые. См. [REPOSITORY_MAP.md](REPOSITORY_MAP.md) |

## Две карты — не путать

В проекте **две независимые карты Leaflet**. Друг друга они не импортируют; общий
код — `SmoothRotatingMarker`, хелперы `tools/`, граф дорог из `state/areas` и общая
инфраструктура (`API`, `localization`, `types`).

Важный нюанс для правок: часть хелперов не переиспользована, а **продублирована** —
в обоих файлах отдельно объявлены одноимённые `safeLeafletAction`,
`isLeafletMapConnected`, `makeRoutePointsSafe`, `makeLocalRoutePoints`,
`trimRoutePointsToPosition`, `saveLastBrowserGeolocation`. Правка в одной карте
**не** попадает в другую. Патчи Leaflet против гонок жизненного цикла есть у обеих
(в карте водителя — `patchLeafletLifecycleForDriverMap`, `DriverMapErrorBoundary`).

| | `src/pages/Driver/Map.tsx` | `src/components/Map/index.tsx` |
|---|---|---|
| Экспорт | `connector(DriverOrderMapMode)` | `connector(Map)` |
| Кто рендерит | только `pages/Driver/index.tsx` (вкладка «Карта») | `pages/Passenger/index.tsx` и `components/modals/MapModal.tsx` |
| Смысл | **много заказов** вокруг водителя: выбрать, куда ехать | **один заказ** и его водители-кандидаты |
| Режимы | вкл/выкл мок-режима | переключается по `EMapModalTypes`: `Client`, `OrderDetails`, `VotingNavigation`, `TakePassenger` |
| Особенности | ранжирование по прибыльности, таймеры жизни заказа, **канал Platform Core**, кластеризация маркеров (только в мок-режиме, `MockClusterLayer`) | цветные маршруты по водителям, анимация подъезда, `invalidateSize()` с ретраями при открытии панели/модалки |

Точная формулировка: `components/Map` — **общая/модальная** карта. Она пассажирская
по основному режиму, но именно её открывает `MapModal`, в том числе из водительских
экранов (`pages/Order` ставит `OrderDetails` и `VotingNavigation`). Называть её
«пассажирской» — упрощение.

**В задачах Platform Core трогается только `pages/Driver/Map.tsx`.**

## Поток данных карты водителя

```
              ┌─ ЗАКАЗЫ С БЭКЕНДА ────────────────────────────────┐
              │ state/orders: саги-вотчеры с адаптивным поллингом   │
              │   activeOrders  → POST /drive?fields=00000000u1     │
              │   readyOrders   → POST /drive/now                   │
              │   historyOrders → POST /drive/archive               │
              └────────────────────┬─────────────────────────────┘
                                       │ activeOrders / readyOrders
                                       ▼
                          pages/Driver/index.tsx
                       (connect: ordersSelectors + вотчеры)
                                       │
        ┌──────────────────────────────┴──────────────────────────┐
        │ ВОТЧЕРЫ ЗАПУСКАЮТСЯ, ТОЛЬКО ЕСЛИ:                        │
        │   u_role === Driver                                      │
        │   И запущен режим эмулятора (isAnyBrowserEmulatorRunning)│
        │   И мок-режим маркера ВЫКЛючен                           │
        │ Иначе запроса нет вообще: саги принудительно очищают стор │
        │ (isDriverEmulatorOnlyUiForcedEmpty, 'emulator_not_running')│
        └──────────────────────────────┬──────────────────────────┘
                                       │ props: user, activeOrders, readyOrders
                                       ▼
              <DriverMap /> = connector(DriverOrderMapMode)
                    connect: wayGraph ← state/areas
                    dispatch: getOrder, setRatingModal, setMessageModal,
                              setOrderCardModal, getAreasBetweenPoints
                                       │
                                       ▼
                       DriverOrderMapModeContent
                                       │
        ┌─ МОК-РЕЖИМ ─────────────────┴──────────────────────────┐
        │ mockBundle = buildMockDriverOrders(u_id, mockCenter)     │
        │ подменяет activeOrders/readyOrders, сеть выключена       │
        └─────────────────────────────┬──────────────────────────┘
                                       │
                                       ▼  ВЫХОД
        ┌──────────────────────────────────────────────────────────┐
        │ 1. Interaction Contract  ← тап по заказу (Stage 1)        │
        │ 2. props-диспатчи Redux  ← 5 вызовов, мимо контракта      │
        │ 3. прямые API.*          ← 4 вызова, мимо контракта       │
        │ 4. navigate / localStorage                                │
        └──────────────────────────────────────────────────────────┘
```

Ключевое про источник заказов: карта **не запрашивает заказы сама**. Их приносят
саги модуля `orders` (нормализованный кэш по `b_id` со счётчиками подписчиков), а
родительская страница отдаёт готовые массивы пропсами.

⚠️ **Важно и неочевидно.** Для роли водителя живого пути «просто к бэку» сейчас
**нет**: вотчеры требуют, чтобы был запущен браузерный эмулятор
(`emulatorOrdersEnabled = isAnyBrowserEmulatorModeRunning()` в
`pages/Driver/index.tsx`). Если эмулятор не запущен, саги не делают запрос вообще, а
принудительно кладут в стор пустой список (`isDriverEmulatorOnlyUiForcedEmpty` в
`state/orders/sagas.ts`, причина в логе — `'emulator_not_running'`). Мок-режим
маркера — второе, независимое условие: он тоже останавливает поллинг и подменяет
источник заказов целиком.

## Место Platform Core

```
        КАРТА (канал)                    ГРАНИЦА                 ПРИЛОЖЕНИЕ
┌─────────────────────────┐                            ┌────────────────────────┐
│ тап по заказу           │──► Action ══════════════►  │ MapApplicationHandler  │
│ (2 ветки рендера)       │    driver.order.select     │  publish Event         │
│                         │◄── Event ═══════════════   │  setOrderCardModal     │
│                         │    driver.order.selected   └────────────────────────┘
├─────────────────────────┤
│ ОСТАЛЬНОЕ — НАПРЯМУЮ:   │
│ setMessageModal         │──► Redux (мимо контракта)
│ getOrder ×3             │──► Redux
│ setOrderCardModal       │──► Redux (в onMapStartedClick)
│ setRatingModal          │──► Redux
│ getAreasBetweenPoints   │──► Redux
│ API.setOrderState ×3    │──► ibronevik (МУТАЦИИ)
│ API.arrivedVotingOrder  │──► заглушка, сети нет
│ API.reverseGeocode      │──► HERE / Nominatim
│ API.makeRoutePoints     │──► OpenRouteService
└─────────────────────────┘
```

**Уже через контракт:** выбор заказа тапом по маркеру — `driver.order.select` →
`driver.order.selected`. Пара Action/Event публикуется на обоих путях рендера (мок и
боевой) **безусловно**; условным остаётся только побочный эффект — открытие карточки
(`if (!deps.mockEnabled)` в `MapApplicationHandler.ts`).

**Пока напрямую:** пять props-диспатчей и четыре вызова `API.*`. Полный разбор с
якорями и предлагаемой очерёдностью миграции — [STATE_AND_API.md](STATE_AND_API.md).

Осознанные упрощения Stage 1: Provider отдельным файлом не выделен (событие клика
уже инкапсулировано в `eventHandlers` маркера), `snapshot()` возвращает пустое
доменное состояние, потребителей Event пока нет.

## Что стоит знать до первой правки

- `src/platform/interaction-contract/` — **внешний пакет**, побайтовая копия upstream
  (сверка по md5 делалась при переносе; автоматической проверки в репозитории нет).
  Любая правка, включая форматирование, ломает контракт.
- `driver-emulator/` — отдельный Node-проект заказчика, **не трогать**.
- Заказы в сторе кэшируются по **сырому** `b_id` — приводить тип (`String(...)`)
  нельзя, иначе промах по кэшу.
- Ошибки бэкенда приходят с HTTP 200, axios на них не реджектит. Признаков **два** и
  они используются вперемешку: `status === 'error'` (большинство функций `API/`) и
  `code !== '200'` (саги `orders`). Проверка только одного из них пропускает часть
  ошибок.
- `pre-build.js` перезаписывает отслеживаемый `src/version.json` при каждом
  `npm start` / `npm run build` — рабочее дерево «пачкается» само.
- В репозитории много артефактов прошлых сессий (`FIX_REPORT_*.txt`, дубли корневых
  файлов в `src/`, `public/`, `scripts/`). Ориентиры — в
  [REPOSITORY_MAP.md](REPOSITORY_MAP.md).
