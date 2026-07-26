# Состояние и бэкенд: прямые связи карты

Карта прямых связей `src/pages/Driver/Map.tsx` с Redux и с бэкендом — материал для
следующих этапов миграции на Platform Core. После Stage 1 через контракт идёт ровно
одно действие (тап по заказу); всё, что перечислено здесь, — **мимо контракта**.

Что уже мигрировано — [MAP_CHANNEL.md](MAP_CHANNEL.md).

---

## 1. Redux-подключение карты

Объявлено рядом с якорями `mapDispatchToProps` / `mapStateToProps` в `Map.tsx`.
`DriverOrderMapMode` — тонкая оболочка, вся логика в `DriverOrderMapModeContent`,
куда пропсы приходят деструктуризацией.

**Из собственного `connect` карты — одно поле:**

| Проп | Селектор | Что это |
|---|---|---|
| `wayGraph` | `areasSelectors.wayGraph` | Граф дорог для оценки маршрутов, см. §3 «areas» |

Но состояния карта потребляет больше: `user`, `activeOrders`, `readyOrders`
объявлены в её `IProps` и приходят пропсами от `pages/Driver/index.tsx`, который
берёт их из своих селекторов (`userSelectors`, `ordersSelectors`). То есть
Redux-зависимость карты — четыре значения, просто три из них идут через родителя.
Это важно для шага «состояние в snapshot» (§5).

**Диспатчи — пять:**

| Проп | Источник | Где вызывается (grep-якорь) | Зачем |
|---|---|---|---|
| `setMessageModal` | `state/modals` | `runMapOrderAction` | Показать ошибку, если мутация заказа упала |
| `getOrder` | `state/order` | `onMapArrivedClick`, `onMapStartedClick`, `onCompleteOrderClick` | Перечитать заказ после мутации на бэке |
| `setOrderCardModal` | `state/modals` | `onMapStartedClick` (ветка `b_voting`) | Открыть карточку вместо старта voting-заказа |
| `setRatingModal` | `state/modals` | `onCompleteOrderClick` | Предложить оценить поездку после завершения |
| `getAreasBetweenPoints` | `state/areas` | эффект маршрута, рядом с `routeAreasRequestKey` | Подгрузить зоны дорог между точками маршрута |

Шестой вызов `setOrderCardModal` — в обработчиках клика по маркеру — **уже
переехал** за контракт и здесь не считается.

Прочие выходы наружу: `navigate` (в `onCompleteOrderClick` и в кнопке «заказы без
координат») и `localStorage` — скрытые заказы, стартованные voting-заказы, позиция и
зум карты (`useCachedState` по ключам `cachedDriverMapState.position` / `.zoom`),
последняя геопозиция браузера (`SAVED_GEOLOCATION_KEY`).

## 2. Прямые вызовы бэка из Map.tsx

Четыре функции через `import * as API from '../../API'` плюс один прямой `fetch`
мимо слоя `API`. Важная деталь: **в ibronevik из них ходит только одна.**

| Вызов | Якорь | Куда идёт | Тип |
|---|---|---|---|
| `API.setOrderState` | `onMapArrivedClick`, `onMapStartedClick`, `onCompleteOrderClick` | `POST /drive/get/{id}` в ibronevik | **МУТАЦИЯ** |
| `API.reverseGeocode` | эффект резолва адреса назначения | HERE Geocoding, фолбэк Nominatim | READ, сторонний сервис |
| `API.makeRoutePoints` | `makeRoutePointsSafe` | OpenRouteService | READ, сторонний сервис |
| `API.arrivedVotingOrder` | `onMapArrivedClick` | никуда — заглушка | ни то ни другое |
| `fetch(...)` в `makeOsrmRoutePoints` | `makeRoutePointsSafe` | `router.project-osrm.org` | READ, в обход `src/API` |

`makeRoutePointsSafe` — трёхступенчатый фолбэк: `API.makeRoutePoints` (ORS) →
`makeLocalRoutePoints(from, to, wayGraph)` (локальный расчёт по графу дорог) →
`makeOsrmRoutePoints` (прямой `fetch` к OSRM). Единственный `fetch` в файле.

**`API.setOrderState(id, state, driverCode?)`** — единственная настоящая мутация.
Переводит заказ по состояниям водителя через `action`-глаголы из
`API/constants.ts` (`EBookingActions`): `Arrived → set_arrive_state`,
`Started → set_start_state`, `Finished → set_complete_state`. Любое другое
состояние отклоняется. Все три вызова обёрнуты в `runMapOrderAction`, который
ловит ошибку и показывает `setMessageModal`.

**`API.arrivedVotingOrder(id)` — заглушка.** Тело целиком:
`async (id) => ({ code: '200', data: { id } })`. Ни axios, ни токена, ни сети.
Всегда резолвится «200» независимо от состояния бэка. Соседний `confirmVotingCode`
— такая же заглушка. Это важно: код в карте, вызывающий её после
`setOrderState(Arrived)`, не получает никакого подтверждения от бэка. Причина
заглушки в коде не задокументирована — **не проверено**, задумано так или регресс.

**`API.reverseGeocode(lat, lng)`** — двухступенчатый геокодинг: HERE
(`revgeocode.search.hereapi.com`), при неудаче Nominatim. Кэш в памяти по
координатам с точностью 5 знаков. Пауза 1250 мс между запросами
(`waitReverseGeocodeTurn`) применяется **только к ветке Nominatim** — вызов HERE не
throttled. Ступеней фактически может быть одна: HERE полностью отключается, если не
нашёлся ключ (`hereAutosuggestDisabled`), и залипает выключенным на всю сессию после
первого 401 — тогда работает только Nominatim. Токена ibronevik не требует.
В мок-режиме не вызывается.

**`API.makeRoutePoints(from, to)`** — маршрут по дорогам через OpenRouteService,
кэш в `localStorage['orsRouteCache.v1']` (до 80 записей) с фолбэком на кэш при
сбое запроса. Ключ ORS **захардкожен в исходнике** `src/API/index.ts` — стоит
вынести в конфиг при ближайшей возможности. В мок-режиме не вызывается.

## 3. Слой src/state

Redux на `createStore` с двумя middleware — `redux-thunk` и `redux-saga`.
`IRootState` не пишется руками, а выводится: `ReturnType<typeof store.getState>`.
Состояние каждого модуля — Immutable `Record`, поэтому читается через `.get()` и
через селекторы, а не как обычный объект. Модули собираются в `rootReducer.ts` по
ключам из `moduleName` каждого модуля, саги — в `rootSaga.ts`.

Единая структура модуля: `actionCreators.ts`, `constants.ts`, `reducer.ts`,
`selectors.ts`, `sagas.ts`, `index.ts` (barrel с namespace-экспортами).

**orders** — нормализованный кэш заказов, центральный модуль. Одна `Map` сущностей
по `b_id`, а `activeOrders` / `readyOrders` / `historyOrders` хранят только списки
идентификаторов. Каждая запись несёт `value` (полный заказ), `partial` (краткий из
списка), счётчики `listeners` и `mutations` и флаг `stale`; когда оба счётчика
обнуляются, запись удаляется — это механизм сборки мусора. Подписка
компонентная: `watchActiveOrders` и родственные — thunk'и, возвращающие функцию
отписки под `useEffect`. Селекторы поверх этого наслаивают бизнес-логику:
фильтрацию заказов эмулятора, отсев по расстоянию до водителя, сортировку по
прибыльности.

**order** (единственное число) — «текущий просматриваемый заказ»: сам заказ, его
`start` / `destination` / `client`, статус и `selectedOrderId`. Карта берёт отсюда
только `getOrder`. Не путать с `orders`: это два разных слайса, у которых даже
совпадают имена типов действий, но не совпадают префиксы `moduleName`. Отмечено при
разборе: у `CLEAR_ORDER`, `SET_START`, `SET_DESTINATION`, `SET_CLIENT` нет веток в
редьюсере, а `clearOrder()` вообще нигде не вызывается — только объявлен. Поля
`start`/`destination`/`client` в этом слайсе всегда `null`. Похоже на мёртвый код.
Не путать с `clearOrders()` из модуля `orders` — тот живой и вызывается
(`pages/Driver/index.tsx`, `state/user/sagas.ts`).

**modals** — все модалки приложения в одном Record: булевы флаги
(`isCancelModalOpen`, `isVoteModalOpen`, `isLoginModalOpen`, …) и объектные
(`orderCardModal {isOpen, orderId}`, `ratingModal {isOpen, orderID}`,
`messageModal {isOpen, status, message}`, `mapModal`, `alarmModal`, …). Карта
трогает три из них. `CLOSE_ALL_MODALS` сбрасывает не всё: `WACodeModal`,
`RefCodeModal`, `activeChat` и `isShowSwitchersMenu` переживают «закрыть всё».
В `deleteFilesModal` в состоянии лежат колбэки — несериализуемые значения в Redux.
`modals/sagas.ts` **не подключена** в `rootSaga.ts`, из-за чего
`setTakePassengerModalFrom/To` ни к чему не приводят — похоже на баг, но
**не проверено**, намеренно ли отключена сага.

**areas** — карта загруженных областей дорожного графа по id. Селектор `wayGraph`
собирает из них `WayGraph` (`src/tools/maps.ts`) — граф узлов с рёбрами, весами и
ограничениями поворота, умеющий искать кратчайший путь. Это не `createSelector`, а
ручная мемоизация с модульным кэшом: при добавлении области граф достраивается
**мутацией на месте**, поэтому идентичность объекта может не меняться при
изменении содержимого. Следствие: мемоизация вниз по течению (`createSelector` в
`orders/selectors.ts`) на такие изменения не инвалидируется.

**user** — аутентифицированный пользователь, токены (`token` + `u_hash`) и
состояние формы логина. Токены дублируются в `localStorage['state.user.tokens']`.

**cars** — кэш машин по `c_id` и список машин пользователя; та же схема
подсчёта ссылок, что в `orders`, но только по `mutations`.

**ordersDetails** — детали заказа (адреса и клиент) с набором слушателей: детали
заказов, за которыми больше не следят, удаляются. Вопреки ожиданию, адреса ниоткуда
не подгружаются: `getLocationSaga` копирует их и координаты прямо из заказа, уже
лежащего в сторе, и в коде это оговорено комментарием — внешний reverse-geocode
намеренно не делается. Реально запрашивается только клиент (`API.getUser`).

**clientOrder** — черновик формы заказа на стороне клиента (откуда/куда, класс
авто, места, комментарии, время, цена). Частично восстанавливается из
localStorage. Здесь же производные селекторы формы и единственные тесты слоя
(`__tests__/orderFormResolvers.test.js`).

**geolocation** — сырой `GeolocationPosition` браузера. `watch` и
`activateSending` — thunk'и, возвращающие функцию отписки.

**config** — язык интерфейса и статус загрузки конфигурации.

### Где живут сайд-эффекты

Разделены между двумя механизмами, и это главная неоднородность слоя:

- **саги** — почти все чтения: `orders/sagas.ts` (адаптивный поллинг + дедупликация
  запросов), `areas`, `user`, `cars`, `ordersDetails`, `config`, `clientOrder`,
  `order`, `geolocation`;
- **thunk'и** — мутации заказа: `cancel`, `take`, `setState` в
  `orders/actionCreators.ts` через хелперы `mutationThunk` / `APIMutationThunk`.
  Исключение — `create`: он зовёт `API.postDrive` и диспатчит `CREATE_SUCCESS`
  напрямую, минуя хелперы, то есть без подсчёта ссылок и без флага `stale`.

Правило «саги читают, thunk'и пишут» верно только для заказов, и то не полностью.
Саги тоже пишут: `user/sagas.ts` — весь вход/выход (`login`, `logout`, `register`,
`googleLogin`, `remindPassword`, `whatsappSignUp`), `config/sagas.ts` — `editUser`
при смене языка, `orders/sagas.ts` — `cancelDrive` в `cancelExpiredOrdersSaga`,
`geolocation/sagas.ts` — отправка позиции (`sendPosition`).

## 4. Протокол бэкенда

База — `https://ibronevik.ru/taxi/c/{config}/api/v1`, где `{config}` берётся из
`?config=`, иначе из `localStorage['config']`, иначе `DEFAULT_CONFIG_NAME`.
Собирается в `src/config.ts`, не в `src/API/`. Переменные `REACT_APP_*` для хоста
API **не используются**.

Особенности, важные при миграции:

- **Настроенного экземпляра axios и интерцепторов нет.** Каждый вызов импортирует
  голый `axios` и передаёт абсолютный URL.
- **Авторизация — не заголовок, а поля тела.** Обёртка `apiMethod` в
  `src/tools/api.ts` берёт токены из стора и добавляет `token` + `u_hash` в
  `FormData`. Централизованной обработки 401 и рефреша токена нет.
- **Почти всё — POST**, включая чтения: учётные данные должны ехать в multipart-теле.
- **Ошибки приходят с HTTP 200**, axios не реджектит, каждая функция проверяет тело
  сама. Признаков **два**, и они используются вперемешку: `status === 'error'`
  (большинство функций `API/`) и `code !== '200'` (саги `orders`, `API/order.ts`).
  Проверка только одного пропускает часть ошибок — например, тело с `code: '404'`.
- **Одиночные сущности возвращаются картами по id**: `data.booking[b_id]`,
  `data.user[u_id]`, `data.car[c_id]`. У списочных эндпоинтов (`/drive`,
  `/drive/now`, `/drive/archive`) форма другая: `data.booking` — **массив**, при этом
  `data.user` в том же ответе остаётся картой по id.
- Преобразование форм бэкенда и фронтенда — в `src/tools/convert.ts`
  (`convertOrder`, `convertUser`, `convertCar`).

## 5. Очерёдность миграции

1. **Действия-выборы без мутаций** — `setOrderCardModal` в `onMapStartedClick`.
   Тот же класс, что уже мигрирован, риск минимальный.
2. **Чтения** — `reverseGeocode` и весь маршрутный фолбэк за Provider геокодинга и
   маршрутов. Provider должен поглотить все три ступени `makeRoutePointsSafe`: ORS,
   локальный расчёт по `wayGraph` и прямой `fetch` к OSRM. Здесь же появляется
   полноценный Provider вместо упрощения Stage 1.
3. **Мутации жизненного цикла** — `driver.order.arrived` / `.started` / `.finished`
   поверх `setOrderState`. Самый рискованный шаг: меняет состояние на бэке, нужен
   отдельный план отката. Заодно стоит решить судьбу заглушки
   `arrivedVotingOrder`.
4. **Состояние в snapshot** — когда через контракт пойдут не только действия.
5. **Навигация и модалки** как события приложения, а не команды из карты.
