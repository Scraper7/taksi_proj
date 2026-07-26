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
    ├── AppInteractionContract.ts
    ├── MapMapper.ts
    ├── MapChannel.ts
    ├── MapApplicationHandler.ts
    ├── useMapChannel.ts
    └── index.ts                 единственная точка импорта наружу
```

`interaction-contract/` — чистые типы и классы ошибок, ноль рантайм-зависимостей
(ни React, ни Leaflet, ни browser API). Правки запрещены, включая форматирование:
файлы сверяются по md5 с upstream-репозиторием.

## Ответственность файлов

| Файл | Что делает | Чего НЕ делает |
|---|---|---|
| `MapMapper.ts` | Чистая функция `mapOrderSelectToAction(orderId, timestamp)` → `InteractionAction`. Здесь же константы типов Action/Event | Не хранит состояние, не ходит в сеть, не трогает browser API. `timestamp` приходит снаружи — иначе функция была бы недетерминированной |
| `MapChannel.ts` | Транспорт. `selectOrder(orderId)` зовёт Mapper и делает `dispatch`; `subscribe(listener)` оборачивает подписку контракта. Логирует оба направления | Ноль бизнес-логики. Не решает, открывать ли карточку |
| `AppInteractionContract.ts` | In-memory шина: `dispatch` → обработчики, `subscribe` → подписчики, `snapshot` → `{revision, state:{}}`. Плюс реализационные `registerHandler` / `publish` | Не знает ни про карту, ни про Redux, ни про заказы |
| `MapApplicationHandler.ts` | Сторона **Application**. На Action публикует Event и — только вне мок-режима — зовёт `setOrderCardModal` | Не знает про Leaflet и про то, какая ветка рендера прислала действие |
| `useMapChannel.ts` | Сборка: модульные синглтоны контракта и канала, регистрация обработчика в `useEffect` с cleanup | Не создаёт ничего в теле рендера |

## Поток

```
                 тап по маркеру заказа
                (две ветки рендера, см. ниже)
                          │
                          ▼
        MapChannel.selectOrder(order.b_id)          ← транспорт
                          │
                          ▼
        mapOrderSelectToAction(orderId, now)        ← Mapper, чистая функция
                          │
                          ▼
   log [InteractionContract] Action driver.order.select
                          │
        ══════════ ГРАНИЦА: InteractionContract ══════════
                          │
                          ▼
        AppInteractionContract.dispatch(action)     ← шина
                          │
                          ▼
        registerMapApplicationHandler               ← сторона Application
             ├─ publish Event driver.order.selected
             │      └→ log [InteractionContract] Event
             └─ if (!mockEnabled) setOrderCardModal({isOpen:true, orderId})
```

Обработчики вызываются **синхронно** внутри `dispatch` — `setOrderCardModal`
по-прежнему исполняется в том же обработчике клика и в том же батче React, как до
интеграции. `dispatch` возвращает `Promise<void>` уже после их вызова.

## Контракт: Action и Event

Через границу ходит **только семантика домена**. UI-события (`marker.clicked`,
`popup.closed`) через контракт не идут и идти не должны.

**Action `driver.order.select`** — карта → приложение, «водитель выбрал заказ»:

```ts
{
  type: 'driver.order.select',
  payload:  { orderId: string },          // сырой b_id заказа
  metadata: { source: 'map', timestamp: string }   // timestamp — ISO 8601
}
```

**Event `driver.order.selected`** — приложение → карта, «выбор принят»:

```ts
{
  type: 'driver.order.selected',
  payload:  { orderId: string },
  metadata: { source: 'map', timestamp: string }   // timestamp унаследован от Action
}
```

Константы: `DRIVER_ORDER_SELECT_ACTION`, `DRIVER_ORDER_SELECTED_EVENT`,
`MAP_CHANNEL_SOURCE` — все в `MapMapper.ts`.

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

Логи в `MapChannel.ts` **не** спрятаны за `isMarkerDebugEnabled()`, в отличие от
диагностического оверлея карты — это осознанное решение этапа. Кандидат на
инжектируемый логгер в следующих этапах.

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

Актуальные `mockEnabled` / `setOrderCardModal` доходят до обработчика через `ref`
(`depsRef.current = deps`) — тот же приём, что уже применён в `MockClusterLayer`
(`ctxRef` / `clickRef`). Обработчик регистрируется один раз, смена пропсов не
пересоздаёт подписку.

`useEffect` с пустыми зависимостями и честным cleanup корректен под
`React.StrictMode`: двойной вызов в dev даёт register → unregister → register,
то есть ровно одну активную регистрацию.

## Границы Stage 1 (осознанные упрощения)

- **Provider отдельным файлом не выделен.** Событие клика уже инкапсулировано
  `eventHandlers` маркера react-leaflet и колбэком `onMarkerClick` кластерного слоя.
- **`snapshot()` возвращает пустое доменное состояние** — `{ revision, state: {} }`.
  Наполнять есть смысл, когда через контракт пойдут не только действия.
- **Потребителей Event пока нет.** Обратное направление живо и логируется, но
  подписчик в `useMapChannel.ts` пустой — карта ещё не реагирует на Event.
- **Классы ошибок контракта не используются.** `TransportError` / `ValidationError` /
  `TimeoutError` из `error.ts` пока не задействованы; шина изолирует ошибки
  обработчиков через `try/catch` + `console.error`.

## Как добавить второе действие

1. В `MapMapper.ts` — константы типов и чистая функция-маппер нового Action.
2. В `MapChannel.ts` — метод-транспорт, который её зовёт и логирует.
3. В `MapApplicationHandler.ts` — ветку по `action.type` в уже существующем
   обработчике (или отдельный обработчик через `contract.registerHandler`).
4. В `Map.tsx` — заменить прямой вызов на вызов канала.
5. Экспортировать новое из `map-channel/index.ts`.

Список кандидатов и предлагаемая очерёдность — в [STATE_AND_API.md](STATE_AND_API.md)
и в разделе 7 [STAGE1_REPORT.md](STAGE1_REPORT.md).
