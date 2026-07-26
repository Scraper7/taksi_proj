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
                                    │  → InteractionAction              │
                                    │    driver.order.select            │
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ MapChannel (транспорт + логи)     │
                                    │  console.log [InteractionContract]│
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ══ ГРАНИЦА: InteractionContract ══
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ AppInteractionContract (in-memory)│
                                    │  dispatch / subscribe / snapshot  │
                                    └───────────────┬───────────────────┘
                                                    ▼
                                    ┌───────────────────────────────────┐
                                    │ MapApplicationHandler (Application)│
                                    │  publish Event driver.order.selected│
                                    │  if (!mockEnabled)                │
                                    │    setOrderCardModal({isOpen:true})│
                                    └───────────────────────────────────┘
```

Ключевое: решение «открывать ли карточку» переехало из карты на сторону
Application. Карта больше не знает про `setOrderCardModal` в точке выбора заказа —
она сообщает намерение, а не командует UI.

## 3. Что подключено

| Файл | Роль |
|---|---|
| `src/platform/interaction-contract/*.ts` | 7 файлов, копия upstream **без единой правки** (md5 сверены) |
| `src/platform/map-channel/AppInteractionContract.ts` | in-memory реализация: dispatch → обработчики, subscribe → подписчики, snapshot → `{revision, state:{}}` |
| `src/platform/map-channel/MapMapper.ts` | чистая функция: `(orderId, timestamp)` → Action `driver.order.select` |
| `src/platform/map-channel/MapChannel.ts` | транспорт + логи `[InteractionContract]` в обе стороны |
| `src/platform/map-channel/MapApplicationHandler.ts` | сторона Application: Event + условный `setOrderCardModal` |
| `src/platform/map-channel/useMapChannel.ts` | модульные синглтоны + регистрация обработчика |
| `src/platform/map-channel/index.ts` | единственная точка импорта |

Изменён ровно один существующий файл — `src/pages/Driver/Map.tsx`, +15/−5 строк:
импорт, один вызов хука, две замены в обработчиках.

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
«в моке карточку не открываем» теперь несёт Application-обработчик, и она
распространяется на оба пути.

### Осознанные упрощения Stage 1

- **Provider отдельным файлом не выделен.** Событие клика уже инкапсулировано
  `eventHandlers` маркера react-leaflet и колбэком `onMarkerClick` кластерного слоя.
  Полноценный Provider — следующие этапы.
- **Snapshot возвращает пустое доменное состояние.** Контракту структура состояния
  неизвестна по определению; наполнение — когда через контракт пойдёт состояние, а
  не только действия.
- **Потребителей Event пока нет.** Обратное направление живо и логируется, но
  подписчик — пустой; карта ещё не реагирует на Event.

## 5. Производительность

Контракт и канал — **модульные синглтоны**, создаются один раз на загрузку модуля,
не в теле рендера. `useMapChannel` возвращает стабильную ссылку, поэтому
`onMockMarkerClick` (`useCallback`) не пересоздаётся. Свежие `mockEnabled` /
`setOrderCardModal` доходят до обработчика через `useRef` — тот же приём, что уже
применён в `MockClusterLayer` (`Map.tsx:2709-2711`). Дополнительных ре-рендеров нет.

`useEffect` с пустыми зависимостями и честным cleanup корректен под
`React.StrictMode` (двойной вызов в dev даёт register → unregister → register).

Вызов `setOrderCardModal` остался **синхронным** внутри обработчика клика:
`dispatch` вызывает обработчики синхронно и только затем возвращает промис. Тайминг
и батчинг React не изменились.

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
- **Логи не заглушены намеренно.** `console.log` в `MapChannel` не спрятан за
  `isMarkerDebugEnabled()`, хотя в `Map.tsx` такая конвенция есть. Это требование
  Stage 1 — единственная наблюдаемость границы. Кандидат на инжектируемый логгер
  в следующих этапах.

Отклонено как нереализуемое на практике (но зафиксировано):

- **Гонка при переключении мок-режима.** Формально `mockEnabled` переехал из
  замыкания рендера в `ref`, читаемый в момент dispatch. Между коммитом рендера и
  passive-effect'ом, снимающим слой Leaflet, старые маркеры ещё кликабельны — и
  теоретически тап в этом окне прочитал бы уже новое значение флага. Окно —
  доли кадра, тап человека — ~200 мс; к тому же запись `depsRef.current`
  коммитящего рендера всегда последняя. Практически недостижимо. Структурно
  устраняется на следующих этапах, когда «мок-ность» станет свойством заказа,
  а не глобальным флагом, читаемым постфактум.

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
