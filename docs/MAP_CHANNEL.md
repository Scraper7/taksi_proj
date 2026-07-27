# Канал «карта» — Platform Core

Как карта водителя разговаривает с приложением через Interaction Contract.
Реализация Stage 1: через контракт идёт ровно одно действие — тап по заказу.

История и обоснование этапа — [STAGE1_REPORT.md](STAGE1_REPORT.md).

---

## Где что лежит

```
src/platform/
├── interaction-contract/     ← ВНЕШНИЙ пакет, копия upstream, НЕ МЕНЯТЬ
│   ├── api.ts                   interface InteractionContract
│   ├── action.ts                InteractionAction<TPayload>
│   ├── event.ts                 InteractionEvent<TPayload>
│   ├── model.ts                 InteractionMetadata, InteractionSnapshot, Revision
│   ├── error.ts                 InteractionError / TransportError / ValidationError / TimeoutError
│   ├── version.ts               INTERACTION_CONTRACT_NAME / _VERSION
│   └── index.ts                 barrel
└── map-channel/              ← НАШ код канала, здесь и дорабатываем
    ├── map-channel-protocol.ts  словарь границы: типы Action/Event + IApplicationContract
    ├── AppInteractionContract.ts
    ├── MapMapper.ts
    ├── MapChannel.ts
    ├── MapApplicationHandler.ts
    ├── logger.ts                формат строк [InteractionContract]
    ├── useMapChannel.ts         React-адаптер + UI-подписчик
    ├── __tests__/               юнит-тесты Mapper’а и шины
    └── index.ts                 единственная точка импорта наружу
```

**Протокол — центр схемы.** `map-channel-protocol.ts` зависит только от
`interaction-contract` и не знает ни про Mapper, ни про Handler. Обе стороны границы
импортируют его — и поэтому не импортируют друг друга: `MapApplicationHandler.ts`
не содержит ни одной ссылки на `MapMapper.ts`.

`interaction-contract/` — чистые типы и классы ошибок, ноль рантайм-зависимостей
(ни React, ни Leaflet, ни browser API). Правки запрещены, включая форматирование:
файлы сверяются по md5 с upstream-репозиторием.

## Ответственность файлов

| Файл | Что делает | Чего НЕ делает |
|---|---|---|
| `map-channel-protocol.ts` | Словарь границы: константы типов Action/Event, `IOrderSelectPayload` / `IOrderSelectedPayload`, `TActionHandler`, интерфейс `IApplicationContract` | Не содержит ни логики, ни реализации. Не импортирует ничего, кроме `interaction-contract` |
| `MapMapper.ts` | Чистая функция `mapOrderSelectToAction(orderId, timestamp, correlationId)` → `InteractionAction \| null` | Не хранит состояние, не ходит в сеть, не трогает browser API. Не объявляет констант — берёт их из протокола. Не бросает исключений: невалидный `orderId` → `null` |
| `MapChannel.ts` | Транспорт. `selectOrder(orderId)` зовёт Mapper и делает `dispatch`; `subscribe(listener)` оборачивает подписку контракта. Логирует оба направления. Поставляет Mapper’у время и `correlationId` | Ноль бизнес-логики. Не решает, открывать ли карточку. Если Mapper вернул `null` — молча выходит, без лога и исключения |
| `AppInteractionContract.ts` | In-memory шина, реализует `IApplicationContract`: `dispatch` → обработчики (последовательно, с `await`), `subscribe` → подписчики, `publish` → Event, `snapshot` → `{revision, state:{}}` | Не знает ни про карту, ни про Redux, ни про заказы |
| `MapApplicationHandler.ts` | Сторона **Application**. На Action валидирует `orderId` и публикует Event, копируя `correlationId`. Зависит от интерфейса `IApplicationContract`, не от класса | **Не знает про UI**: ни про `mockEnabled`, ни про `setOrderCardModal`. Не импортирует `MapMapper.ts`. Не знает, какая ветка рендера прислала действие |
| `logger.ts` | Формат строк `[InteractionContract]` в одном месте; инъектируется в канал и шину | Не решает, что логировать — только как |
| `useMapChannel.ts` | Сборка: модульные синглтоны, регистрация обработчика и **UI-подписчика** в `useEffect` с cleanup. Здесь живёт единственное решение про UI: `if (mockEnabled) return` перед `setOrderCardModal` | Не создаёт ничего в теле рендера. Не участвует в доменной части цепочки |

## Поток

```
                 тап по маркеру заказа
                (две ветки рендера, см. ниже)
                          │
                          ▼
        MapChannel.selectOrder(order.b_id)          ← транспорт
                          │
                          ▼
   mapOrderSelectToAction(orderId, now, correlationId)  ← Mapper, чистая функция
                          │
             ┌────────────┴────────────┐
        null │                         │ Action
             ▼                         ▼
      молча выходим        log [InteractionContract] Action driver.order.select
   (пустой orderId,                    │
    ни лога, ни throw)                 │
        ══════════ ГРАНИЦА: InteractionContract ══════════
                                       │
                                       ▼
        AppInteractionContract.dispatch(action)     ← шина, последовательно + await
                                       │
                                       ▼
        MapApplicationHandler                       ← сторона Application
             ├─ валидирует orderId
             └─ publish Event driver.order.selected (correlationId скопирован)
                                       │
                                       ▼
                    log [InteractionContract] Event
                                       │
                                       ▼
        UI-подписчик (useMapChannel.ts)             ← сторона интерфейса
             └─ if (!mockEnabled) setOrderCardModal({isOpen:true, orderId})
```

**Почему рассинхрона нет по построению.** Раньше Handler и публиковал Event, и звал
`setOrderCardModal` — состояние «Event ушёл, а модалка упала» было достижимо. Теперь
UI-действие происходит строго ПОСЛЕ того, как Handler закончил и Event опубликован:
подписчик вообще не получит управления, пока Event не разослан. Порядок гарантирован
структурой цепочки, а не соглашением между файлами.

Цепочка остаётся **синхронной**: `dispatch` — асинхронная функция, но её тело
выполняется до первого `await` немедленно, поэтому первый обработчик вызывается в том
же такте, что и клик, а публикация Event и `setOrderCardModal` происходят внутри него.
`setOrderCardModal` по-прежнему исполняется в том же обработчике клика и в том же
батче React, как до интеграции — это зафиксировано тестом «карточка открывается
синхронно внутри `selectOrder`».

## Контракт: Action и Event

Через границу ходит **только семантика домена**. UI-события (`marker.clicked`,
`popup.closed`) через контракт не идут и идти не должны.

**Action `driver.order.select`** — карта → приложение, «водитель выбрал заказ»:

```ts
{
  type: 'driver.order.select',
  payload:  { orderId: string },          // сырой b_id заказа
  metadata: {
    source: 'map',
    timestamp: string,                    // ISO 8601, поставляет MapChannel
    correlationId: string,                // id этой цепочки, поставляет MapChannel
  }
}
```

**Event `driver.order.selected`** — приложение → карта, «выбор принят»:

```ts
{
  type: 'driver.order.selected',
  payload:  { orderId: string },
  metadata: {
    source: 'map',
    timestamp: string,                    // унаследован от Action
    correlationId: string,                // СКОПИРОВАН из Action: одна цепочка — один id
  }
}
```

Константы и типы payload — `DRIVER_ORDER_SELECT_ACTION`,
`DRIVER_ORDER_SELECTED_EVENT`, `MAP_CHANNEL_SOURCE`, `IOrderSelectPayload`,
`IOrderSelectedPayload` — все в `map-channel-protocol.ts`. В `MapMapper.ts` их
больше нет: Mapper импортирует протокол наравне с Handler’ом.

**`correlationId`** порождает транспорт (`MapChannel`), а не Mapper — иначе Mapper
перестал бы быть чистой функцией. Handler копирует значение в Event, поэтому Action и
его Event связаны одним идентификатором сквозь всю цепочку.

**Невалидный `orderId`** (пустой, `undefined`, одни пробелы) — Action не создаётся:
Mapper возвращает `null`, канал молча выходит. Исключений в пути клика нет ни одного.

Разница по контракту: у `InteractionAction` поле `metadata` **опционально**, у
`InteractionEvent` — **обязательно**. Поэтому обработчик при публикации Event
подставляет `new Date().toISOString()`, если у Action метаданных не было.

`orderId` передаётся **сырым** `b_id`, без `String()`: заказы в сторе кэшируются по
сырому ключу (см. `state/orders/reducer.ts`), приведение типа сломало бы попадание
в кэш.

## Как наблюдать работу контракта

Единственная наблюдаемость Stage 1 — консоль браузера. Тап по заказу даёт **две**
строки подряд:

```
[InteractionContract] Action driver.order.select  {type: 'driver.order.select', payload: {…}, metadata: {…}}
[InteractionContract] Event  driver.order.selected {type: 'driver.order.selected', payload: {…}, metadata: {…}}
```

Логи **не** спрятаны за `isMarkerDebugEnabled()`, в отличие от диагностического
оверлея карты — это осознанное решение этапа.

Прямые `console.log` заменены на `InteractionLogger` (`logger.ts`): формат строк
задаётся в одном месте и инъектируется в канал и шину. Вывод при этом **побайтово
тот же** — первый аргумент по-прежнему `'[InteractionContract] Action'` /
`'[InteractionContract] Event'`, дальше тип и объект. Формат — механизм приёмки, и
он зафиксирован юнит-тестами (`__tests__/MapChannel.test.js`), чтобы случайная
правка его не сдвинула.

Удобнее всего проверять в мок-режиме: бэкенд не нужен, а карточка заказа не
открывается и не мешает смотреть консоль. Обе строки должны появиться и там.

## Две ветки клика — одна точка входа действия

Клик по заказу реализован в двух **взаимоисключающих** ветках рендера. Это одно
пользовательское действие с двумя путями отрисовки, а не два разных действия.

```
mockEnabled  → <MockClusterLayer onMarkerClick={onMockMarkerClick} />
                  └→ onMockMarkerClick   (Map.tsx, useCallback)
                        setSelectedOrderId  ─┐
                        mapChannel.selectOrder(order.b_id)
                        продление VOTE       │ локальный UI карты
                        debug-оверлей       ─┘

!mockEnabled → <Marker eventHandlers={{ click: … }} />
                  └→ inline-обработчик    (Map.tsx)
                        setSelectedOrderId  ─┐
                        showMarkerDebugOverlay
                        mapChannel.selectOrder(item.b_id)
```

Оба call-site зовут один и тот же `mapChannel.selectOrder` → один Action → один
Mapper → один обработчик. Grep-якоря: `mapChannel.selectOrder`, `onMockMarkerClick`,
`MockClusterLayer`, `useMapChannel(`.

Выделение маркера (`setSelectedOrderId`) и debug-оверлей остаются в карте — это
локальный UI-стейт канала, он по архитектуре не обязан идти через контракт.

## Производительность

Контракт и канал — **модульные синглтоны** в `useMapChannel.ts`: создаются один раз
на загрузку модуля, не в теле рендера. `useMapChannel` возвращает стабильную ссылку,
поэтому канал **не добавляет** новых причин для инвалидации — в этом и весь выигрыш.

Уточнение, чтобы не создавать ложного впечатления: `onMockMarkerClick` всё равно
пересоздаётся, и не из-за канала. Его список зависимостей — `[markerCtx]`, а
`markerCtx` пересчитывается при смене `selectedOrderId`, то есть на **каждый** выбор
заказа. Стоит это ноль: `MockClusterLayer` держит свежий колбэк в ref
(`clickRef.current = onMarkerClick`), поэтому маркеры не перевешиваются заново.

Актуальные `mockEnabled` / `setOrderCardModal` доходят до **UI-подписчика** через
`ref` (`depsRef.current = deps`) — тот же приём, что уже применён в
`MockClusterLayer` (`ctxRef` / `clickRef`). Подписчик регистрируется один раз, смена
пропсов не пересоздаёт подписку. Прикладной обработчик зависимостей не имеет вовсе —
`registerMapApplicationHandler(contract)` принимает только шину.

`useEffect` с пустыми зависимостями и честным cleanup корректен под
`React.StrictMode`: двойной вызов в dev даёт register → unregister → register,
то есть ровно одну активную регистрацию.

## Границы Stage 1 (осознанные упрощения)

- **Provider отдельным файлом не выделен.** Событие клика уже инкапсулировано
  `eventHandlers` маркера react-leaflet и колбэком `onMarkerClick` кластерного слоя.
- **`snapshot()` возвращает пустое доменное состояние** — `{ revision, state: {} }`.
  Метод не бросает исключений; наполнять есть смысл на этапе FSM (Stage 4).
- **Потребитель Event ровно один** — UI-подписчик, открывающий карточку заказа.
  Обратное направление работает и логируется, но других реакций на Event у карты нет.
- **Классы ошибок контракта не используются.** `TransportError` / `ValidationError` /
  `TimeoutError` из `error.ts` пока не задействованы; шина изолирует ошибки
  обработчиков через `try/catch` + логгер, а невалидный вход отсекается возвратом
  `null`, а не броском `ValidationError`.

Полный список ограничений этапа и план их снятия —
[ROADMAP_PLATFORM_CORE.md](ROADMAP_PLATFORM_CORE.md).

## Как добавить второе действие

1. В `map-channel-protocol.ts` — константы типов и типы payload нового Action/Event.
2. В `MapMapper.ts` — чистая функция-маппер: валидный вход → Action, невалидный →
   `null`.
3. В `MapChannel.ts` — метод-транспорт, который её зовёт и логирует.
4. В `MapApplicationHandler.ts` — ветку по `action.type` в уже существующем
   обработчике (или отдельный обработчик через `contract.registerHandler`).
5. Если действие должно что-то поменять в интерфейсе — **подписчика** в
   `useMapChannel.ts`, а не вызов UI из обработчика.
6. В `Map.tsx` — заменить прямой вызов на вызов канала.
7. Экспортировать новое из `map-channel/index.ts` и закрыть юнит-тестами в
   `__tests__/`.

Список кандидатов и предлагаемая очерёдность — в [STATE_AND_API.md](STATE_AND_API.md)
и в разделе 7 [STAGE1_REPORT.md](STAGE1_REPORT.md).
