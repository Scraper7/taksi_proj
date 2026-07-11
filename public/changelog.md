## Миграция на React 19 и Leaflet 1.9.4

- **react & react-dom 16.13.1 -> 19.0.0**.

	- **@material-ui/core 4.10.2 -> @mui/material 6.4.4**, **@material-ui/pickers 3.2.10 -> @mui/x-date-pickers 7.26.0**.
		- Внешний вид компонентов отличается в новых версиях.

	- Устаревший **react-meta-tags** заменен на **react-helmet-async**.

	- **react-router-dom 5.2.0 -> 6.29.0**.
		- `src/tools/history` удален, вместо `history` теперь используется `useNavigate`.

	- **react-input-mask 2.0.4 -> @mona-health/react-input-mask 3.0.3**.

	- **react-hook-form 7.11.0 -> 7.54.2**.

	- **@sentry/react 6.18.1 -> @sentry/react 9.1.0**.

- **leaflet 1.6.0 -> 1.9.4**, **react-leaflet 3.2.1 -> 5.0.0**.

	- Компоненты `src/components/Map` и `src/pages/Driver/Map` изменены.
		- Компонент `Map` разделен на `Map` и `MapContent`, т.к. на смену `MapContainer.whenCreated` пришел хук `useMap`, доступный только внутри дочернего компонента `MapContainer`.
		- Прямое использование `navigator.geolocation.getCurrentPosition` для установки текущих координат заменено на `map.locate`, т.к. первый вариант теперь приводит к ошибке при вызове `panTo/setView` до первичной инициализации карты.
		- Для `CircleMarker` добавлено обязательное свойство `radius`.

	- **react-leaflet-fullscreen-plugin**: Создана локальная копия в `lib/react-leaflet-fullscreen-plugin` с патчами совместимости.

- **typescript 4.3.5 -> 5.7.3**.

- **webpack 4.42.0 -> 5.98.0**.

	- **@babel/core 7.9.0 -> 7.26.0**.
		- Добавлен `@babel/plugin-transform-class-properties`.
		- **@babel/preset-env 7.10.2 -> 7.26.9**.
		- **core-js 3.21.1 -> 3.40.0**.
		- Для `node_modules` также добавлен `preset-env`.

	- **react-dev-utils**: Для сохранения совместимости была создана локальная копия библиотеки в `lib/react-dev-utils` с минимальными патчами.
		- [Патч совместимости с webpack 5](https://github.com/facebook/create-react-app/issues/9880).
		- Оверлей, предоставляемый `WebpackHotDevClient` убран по причине полной несовместимости.

	- После обновления циклические зависимости стали критичными и были исправлены.
		- `src/config` разделен на `src/config` и `src/constants`.
		- `src/API` разделен на `src/API/index` и `src/API/cacheVersion`.

- Добавлен `run-script-os` для запуска скриптов `start` и `build` на \*nix.