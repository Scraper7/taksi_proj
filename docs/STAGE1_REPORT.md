# Stage 1 — Minimum Viable Integration: карта водителя ↔ Platform Core

Одно пользовательское действие карты (тап по заказу) проведено через Interaction
Contract. Всё остальное поведение не тронуто.

Источник контракта: `tylerrondo/voice-assistant`, `packages/interaction-contract/src`,
коммит `c9a42f0c5e8a5c4eb0c3578c5a537dbccac5b973` (2026-07-12).

---

## 1. Схема ДО

```
src/pages/Driver/index.tsx:407-415   <DriverMap user activeOrders readyOrders />
        │
        ▼
Map.tsx:392-404   connect(mapStateToProps, mapDispatchToProps)
  ├ state:    wayGraph
  └ dispatch: getOrder, setRatingModal, setMessageModal,
              setOrderCardModal, getAreasBetweenPoints
        │
        ▼
DriverOrderMapMode (412) → DriverOrderMapModeContent (487)
        │
        ├─ mockEnabled → <MockClusterLayer onMarkerClick={onMockMarkerClick}/>
        │                  └→ onMockMarkerClick: setSelectedOrderId + VOTE + debug
        │                     (карточку не открывает)
        │
        └─ !mockEnabled → <Marker eventHandlers.click>
                           └→ setSelectedOrderId + debug
                              + if (!mockEnabled) setOrderCardModal(...)   ← прямой Redux
```

## 2. Схема ПОСЛЕ

```
        ├─ mockEnabled → onMockMarkerClick
        │                  setSelectedOrderId + VOTE + debug   (локальный UI карты)
        │                  mapChannel.selectOrder(b_id) ────┐
        │                                                   │
        └─ !mockEnabled → Marker click                      │
                           setSelectedOrderId + debug        │
                           mapChannel.selectOrder(b_id) ────┤
                                                            ▼
                                    ┌───────────────────────────────────┐
                                    │ MapMapper  (чистая функция)       │
                                    │  валидный orderId → Action        │
                                    │    driver.order.select            │
                                    │  пустой orderId → null            │
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ MapChannel (транспорт + логи)     │
                                    │  null → молча выходим             │
                                    │  logger [InteractionContract]     │
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ══ ГРАНИЦА: InteractionContract ══
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ AppInteractionContract             │
                                    │  implements IApplicationContract   │
                                    │  dispatch (последовательно+await) │
                                    │  publish / subscribe / snapshot   │
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ MapApplicationHandler (Application)│
                                    │  валидация orderId                │
                                    │  publish Event driver.order.selected│
                                    │  про UI не знает вообще            │
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ UI-подписчик (useMapChannel)      │
                                    │  if (!mockEnabled)                │
                                    │    setOrderCardModal({isOpen:true})│
                                    └───────────────────────────────────┘
```

Ключевое: решение «открывать ли карточку» переехало из карты на сторону приложения.
Карта больше не знает про `setOrderCardModal` в точке выбора заказа — она сообщает
намерение, а не командует UI.

При этом **доменная часть цепочки и UI-часть разделены**: прикладной обработчик
только валидирует и публикует Event, а превращение Event’а в действие интерфейса —
работа подписчика. Event уходит строго раньше UI-действия: подписчик не получает
управления, пока Handler не закончил. Рассинхрон «Event опубликован, а модалка
упала» недостижим по построению цепочки, а не по договорённости.

## 3. Что подключено

| Файл | Роль |
|---|---|
| `src/platform/interaction-contract/*.ts` | 7 файлов, копия upstream **без единой правки** (md5 сверены) |
| `src/platform/map-channel/map-channel-protocol.ts` | словарь границы: типы Action/Event, payload’ы, `TActionHandler`, интерфейс `IApplicationContract` |
| `src/platform/map-channel/AppInteractionContract.ts` | in-memory реализация `IApplicationContract`: dispatch → обработчики (последовательно, с `await`), subscribe/publish → подписчики, snapshot → `{revision, state:{}}` |
| `src/platform/map-channel/MapMapper.ts` | чистая функция: `(orderId, timestamp, correlationId)` → Action `driver.order.select` либо `null` |
| `src/platform/map-channel/MapChannel.ts` | транспорт + логи `[InteractionContract]` в обе стороны; поставляет время и `correlationId` |
| `src/platform/map-channel/MapApplicationHandler.ts` | сторона Application: валидация + publish Event. Про UI не знает |
| `src/platform/map-channel/logger.ts` | формат строк `[InteractionContract]` в одном месте |
| `src/platform/map-channel/useMapChannel.ts` | модульные синглтоны, регистрация обработчика и UI-подписчика |
| `src/platform/map-channel/__tests__/*.js` | юнит-тесты: Mapper, шина, формат логов и цепочка |
| `src/platform/map-channel/index.ts` | единственная точка импорта |

Изменён ровно один существующий файл — `src/pages/Driver/Map.tsx`, +15/−5 строк:
импорт, один вызов хука, две замены в обработчиках. Разделение Handler/подписчик
диффа в карте не потребовало: `useMapChannel` уже получал `{ mockEnabled,
setOrderCardModal }`, и подписчик читает их оттуда же.

### Три структурных решения

**Протокол отдельным файлом.** Константы и типы Action/Event переехали из
`MapMapper.ts` в `map-channel-protocol.ts`. Раньше Handler импортировал их у Mapper’а,
то есть сторона приложения зависела от файла канала. Теперь обе стороны зависят от
общего словаря и не знают друг о друге: в `MapApplicationHandler.ts` нет ни одной
ссылки на `MapMapper.ts`. Mapper при этом ужался до одной чистой функции.

**`IApplicationContract` — интерфейс, а не класс-обёртка.** `AppInteractionContract`
его реализует (`implements`); `registerMapApplicationHandler` и синглтон в
`useMapChannel.ts` типизированы интерфейсом. Прикладной код не зависит от конкретной
реализации шины — подменить её можно, не трогая обработчик. `publish` остаётся
методом класса (иначе `implements` не выполняется), но снаружи виден только как часть
интерфейса.

**Валидация вместо исключения.** Пустой/`undefined` `orderId` → Mapper возвращает
`null`, канал молча выходит. В пути клика не бросается ничего: тап по маркеру с битым
`b_id` не может уронить обработчик Leaflet. Тот же контроль продублирован в Handler’е
— до Event’а доходит только валидное действие.

## 4. Какое действие идёт через контракт

**Тап по заказу на карте → `driver.order.select` → `driver.order.selected`.**

Через контракт ходит только семантика домена. UI-события (`marker.clicked`,
`popup.closed`) через контракт не идут и не должны.

### Почему два call-site — это по-прежнему ОДНО действие

Клик по заказу реализован в двух **взаимоисключающих** ветках рендера: мок-режим
идёт через `MockClusterLayer` (`Map.tsx:1798-1809` → `onMockMarkerClick`), реальный —
через одиночные `<Marker>` (`Map.tsx:1813-1843`). Это одно пользовательское
действие с двумя путями рендера, а не два действия: один Action, один Mapper, один
Channel, один прикладной обработчик.

Побочно: прежняя проверка `if (!mockEnabled)` внутри обработчика на 1837 была
мёртвым кодом — эта ветка рендерится только при `!mockEnabled`. Реальную защиту
«в моке карточку не открываем» теперь несёт UI-подписчик, и она распространяется на
оба пути.

### Осознанные упрощения Stage 1

- **Provider отдельным файлом не выделен.** Событие клика уже инкапсулировано
  `eventHandlers` маркера react-leaflet и колбэком `onMarkerClick` кластерного слоя.
  Полноценный Provider — следующие этапы.
- **Snapshot возвращает пустое доменное состояние.** Контракту структура состояния
  неизвестна по определению; наполнение — на этапе FSM. Метод не бросает исключений.
- **Потребитель Event ровно один** — UI-подписчик, открывающий карточку заказа.
  Других реакций карты на Event пока нет.

Полный список ограничений этапа и порядок их снятия —
[ROADMAP_PLATFORM_CORE.md](ROADMAP_PLATFORM_CORE.md).

## 5. Производительность

Контракт и канал — **модульные синглтоны**, создаются один раз на загрузку модуля,
не в теле рендера. `useMapChannel` возвращает стабильную ссылку, поэтому
`onMockMarkerClick` (`useCallback`) не пересоздаётся. Свежие `mockEnabled` /
`setOrderCardModal` доходят до UI-подписчика через `useRef` — тот же приём, что уже
применён в `MockClusterLayer` (`Map.tsx:2709-2711`). Дополнительных ре-рендеров нет.

`useEffect` с пустыми зависимостями и честным cleanup корректен под
`React.StrictMode` (двойной вызов в dev даёт register → unregister → register).

Вызов `setOrderCardModal` остался **синхронным** внутри обработчика клика. `dispatch`
теперь `async` и обходит обработчики последовательно с `await`, но тело асинхронной
функции выполняется до первого `await` немедленно: первый обработчик вызывается в том
же такте, что и клик, публикует Event синхронно, подписчик синхронно зовёт
`setOrderCardModal`. Тайминг и батчинг React не изменились — это зафиксировано
тестом «карточка открывается синхронно внутри `selectOrder`».

## 6. Что показал адверсариальный ревью

Интеграция прогнана через независимый разбор в трёх линзах (регрессии поведения /
соблюдение ограничений / корректность кода), каждая находка затем проверялась на
опровержение по коду.

**Ограничения: 9 из 9 PASS**, нарушений нет.

Две находки приняты и учтены:

- **Паритет payload.** Изначально в канал уходил `String(item.b_id)`. По типу
  `b_id: string` это тождество, но исходный код передавал значение сырым, а заказы
  в сторе кэшируются по сырому `b_id` (`state/orders/reducer.ts`). Приведение типа
  убрано — payload теперь побайтово тот же, что до интеграции.
- **Логи не заглушены намеренно.** Вывод `[InteractionContract]` не спрятан за
  `isMarkerDebugEnabled()`, хотя в `Map.tsx` такая конвенция есть. Это требование
  Stage 1 — единственная наблюдаемость границы. Прямые `console.log` с тех пор
  заменены на инжектируемый `InteractionLogger` (`map-channel/logger.ts`); формат
  строк не изменился и закреплён тестом.

Отклонено как нереализуемое на практике (но зафиксировано):

- **Гонка при переключении мок-режима.** Формально `mockEnabled` переехал из
  замыкания рендера в `ref`, читаемый в момент dispatch. Между коммитом рендера и
  passive-effect'ом, снимающим слой Leaflet, старые маркеры ещё кликабельны — и
  теоретически тап в этом окне прочитал бы уже новое значение флага. Окно —
  доли кадра, тап человека — ~200 мс; к тому же запись `depsRef.current`
  коммитящего рендера всегда последняя. Практически недостижимо. Структурно
  устраняется на следующих этапах, когда «мок-ность» станет свойством заказа,
  а не глобальным флагом, читаемым постфактум.

## 6a. Юнит-тесты

Гарнесс из сдачи этапа оформлен как тесты в репозитории: `npm test`, jest из
ejected CRA, три файла в `src/platform/map-channel/__tests__/`. **39 тестов**
(плюс 12 ранее существовавших — итого 51, все зелёные).

Тесты написаны на `.js` — как и два уже существовавших набора в репозитории.
Причина техническая: `@types/jest` в проекте не установлен, а `.ts`-файлы попадают
под `tsc --noEmit` и падали бы на `Cannot find name 'jest'`. Вариант с установкой
`@types/jest` вышел бы за рамки согласованной рабочей зоны (`package.json` +
lock-файл), поэтому выбрана конвенция репозитория. Если типизированные тесты
предпочтительнее — это ровно одна команда `npm i -D @types/jest` и переименование
трёх файлов.

| Файл | Что фиксирует |
|---|---|
| `MapMapper.test.js` | Валидный `orderId` → Action с правильными `type` / `payload` / `metadata` (включая `correlationId`); константы берутся из протокола; `orderId` не приводится к строке; детерминированность. Пустая строка / `undefined` / `null` / пробелы → `null` и **без исключения** |
| `AppInteractionContract.test.js` | Регистрация и доставка Action; `publish` → listener; после `unsubscribe` listener **не** вызывается; отписка обработчика во время обхода; **порядок** = порядок регистрации, в том числе для async-обработчиков; **изоляция ошибки** и **продолжение** обхода; двойная регистрация; `snapshot` не бросает и растит `revision` |
| `MapChannel.test.js` | Формат строк `[InteractionContract]`; за клик ровно две строки; невалидный `orderId` не даёт ни лога, ни Action; полная цепочка Action → Handler → Event → подписчик; перенос `correlationId`; мок-режим не открывает карточку; Event уходит раньше UI-действия; синхронность вызова `setOrderCardModal` |

**Три правила `dispatch`, которых требовал ревьюер, закреплены явно:**

- *порядок* — «порядок доставки = порядок регистрации» и отдельный тест с медленным
  async-обработчиком первым: при параллельном обходе быстрый синхронный отработал бы
  раньше, тест это ловит;
- *изоляция ошибки* — обработчик бросает синхронно, второй реджектит асинхронно, оба
  исключения уходят в логгер;
- *продолжение* — третий обработчик всё равно вызывается, а `dispatch` резолвится
  успешно (`resolves.toBeUndefined()`).

**Семантика двойной регистрации определена и зафиксирована:** регистрация не
идемпотентна — один и тот же `handler`, зарегистрированный дважды, получает Action
дважды. Каждая отписка снимает **ровно одно** вхождение и идемпотентна к повторному
вызову. Прежняя реализация (`filter` по идентичности) снимала обе копии одной
отпиской — это исправлено на `splice` по первому вхождению.

## 7. Оставшиеся прямые связи карты — план следующих этапов

Ничего из перечисленного в Stage 1 не тронуто.

### Redux-диспатчи мимо контракта

| Строка | Вызов | Действие |
|---|---|---|
| 1130 | `setMessageModal` | ошибка в `runMapOrderAction` |
| 1143 / 1158 / 1168 | `getOrder` | перечитать заказ после мутации |
| 1152 | `setOrderCardModal` | `onMapStartedClick` для voting-заказа |
| 1170 | `setRatingModal` | после завершения заказа |
| 1439 | `getAreasBetweenPoints` | подгрузка зон маршрута |

### Прямые вызовы бэка

| Строка | Вызов | Тип |
|---|---|---|
| 1089 | `API.reverseGeocode` | READ |
| 1140 | `API.setOrderState(Arrived)` | **MUTATION** |
| 1142 | `API.arrivedVotingOrder` | **MUTATION** |
| 1157 | `API.setOrderState(Started)` | **MUTATION** |
| 1166 | `API.setOrderState(Finished)` | **MUTATION** |
| 2809 | `API.makeRoutePoints` | READ |

### Прочее

`navigate` — 1169, 1847. Плюс `localStorage` (скрытые заказы, стартованные voting).

### Предлагаемая очерёдность

1. **Действия-выборы без мутаций** — `driver.order.card.open` (1152).
2. **Чтения** — `reverseGeocode`, `makeRoutePoints` → Provider геокодинга/маршрутов;
   тут же появляется отдельный Provider вместо упрощения Stage 1.
3. **Мутации жизненного цикла** — `driver.order.arrived` / `.started` / `.finished`
   поверх `setOrderState` + `arrivedVotingOrder`. Самый рискованный шаг: затрагивает
   состояние на бэке, нужен отдельный план отката.
4. **Состояние в snapshot** — наполнить доменным состоянием, когда через контракт
   пойдут не только действия.
5. **Навигация и модалки** как события приложения, а не команды из карты.

## 8. Границы, которые не пересекались

`src/API`, `src/state`, `driver-emulator/`, `src/components/Map/index.tsx`,
голосовой канал / эмулятор / scenario-engine — не изменены. Изменённых файлов в
рабочем дереве ровно один (`src/pages/Driver/Map.tsx`), плюс новый каталог
`src/platform/`.

**Раунд правок по итогам ревью** границ не сдвинул: изменения только внутри
`src/platform/map-channel/` и `docs/`. `src/pages/Driver/Map.tsx` в этом раунде
**не менялся вовсе** — разделение Handler’а и UI-подписчика уместилось в
`useMapChannel.ts`, который и так получал нужные зависимости.
`src/platform/interaction-contract/` не тронут: md5 всех семи файлов совпадают со
снятыми до правок.
