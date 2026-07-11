# Release checklist: v7 safe FSM / OrderForm resolvers

## Что внедрено
- Добавлен derived UI FSM слой для Passenger page: `src/pages/Passenger/uiFsm.ts`.
- Добавлен feature flag: `src/pages/Passenger/fsmFeature.ts`.
- Добавлен общий тип UI-конфига: `src/types/passengerUi.ts`.
- Добавлен конфиг состояний: `src/pages/Passenger/fsm_config.json`.
- Добавлена цепочка derived-resolver-ов формы заказа: `src/state/clientOrder/orderFormResolvers.ts`.
- `clientOrderSelectors` теперь собирает `orderFormLayout` через resolver-цепочку, не создавая новый Redux slice.
- `VotingForm` получает `uiConfig` и берёт `preferOfferMode` из derived `orderFormLayout`, сохраняя старое поведение как fallback.
- `Passenger/index.tsx` вычисляет `passengerUiConfig`; при выключенном feature flag старое pin/free-map поведение сохраняется.
- `MiniOrders` принимает `uiConfig`, сохраняет legacy handlers, исправляет label рейтинга через `RATING_HEADER`, и для простого поиска показывает ожидание вместо `Отклики`.

## Rollback
- В localStorage: `feature.passenger_ui_fsm = "0"`.
- По env: `REACT_APP_PASSENGER_UI_FSM=0`.
- При выключенном флаге сохраняется старое поведение pin/free-map; resolver остаётся read-only derived layer.

## Проверки в этой песочнице
- `npm ci --ignore-scripts --no-audit --no-fund` прошёл, но с предупреждением Node engine: проект требует Node 24.x, песочница — Node 22.16.0.
- `npx tsc -p tsconfig.json --noEmit` показывает старые ошибки проекта в незатронутых файлах; по затронутым файлам новых ошибок не найдено.
- `npx eslint` по новым чистым файлам прошёл без errors, только style warnings по длине строк/ternary.
- `npm run build:nix` в песочнице не завершился до timeout, остановился на старых Sass deprecation warnings.
- ZIP проверен через `unzip -tqq` и `zip -T`.

## Что НЕ трогалось
- Map route decision logic.
- Redux schema / new slice не добавлялся.
- API payload schema не менялась.
- vote/offer/candidate handlers не переписаны и оставлены в legacy flow.
- tripTimer semantics сохранены: поездка считается от `c_started`/Started fallback, не от создания заказа.
