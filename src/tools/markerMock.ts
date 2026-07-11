import moment from 'moment'
import { EBookingDriverState, IDriver, IOrder } from '../types/types'

/* ============================================================================
 *  Мок-источник заказов для демонстрации дизайн-системы маркера.
 *  Реального бэка нет, часть полей (курс водителя, u_id текущего водителя)
 *  в реальных данных отсутствует — здесь они проставлены, чтобы под эмулятором
 *  было видно ВСЕ состояния ДС: типы, статусы, кольцо во всех цветах,
 *  направление, RouteFit во всех 4 полосах, состояния маркера.
 *
 *  Включается флагом (localStorage / ?mock=1). Когда флаг включён, карта берёт
 *  заказы отсюда, а реальный polling к бэку отрубается (см. Driver/index.tsx и
 *  Map.tsx) — никаких обращений к ibronevik в мок-режиме.
 * ========================================================================== */

export const MARKER_MOCK_STORAGE_KEY = 'gruzvill_ds_marker_mock_enabled'
export const MARKER_MOCK_STATE_EVENT = 'gruzvill-ds-marker-mock-change'

// Базовая точка демо (центр) и «курс» водителя. Курс реального водителя в данных
// отсутствует, поэтому для RouteFit берём фиксированный курс на север (0°).
export const MOCK_DRIVER_POSITION: [number, number] = [55.7512, 37.6184]
export const MOCK_DRIVER_HEADING_DEG = 0

function canUseStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage
  } catch {
    return false
  }
}

export function isMarkerMockEnabled(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('mock') === '1') return true
      if (params.get('mock') === '0') return false
    }
  } catch {
    // ignore
  }

  if (!canUseStorage()) return false
  return window.localStorage.getItem(MARKER_MOCK_STORAGE_KEY) === '1'
}

export function setMarkerMockEnabled(enabled: boolean) {
  if (canUseStorage())
    window.localStorage.setItem(MARKER_MOCK_STORAGE_KEY, enabled ? '1' : '0')

  try {
    window.dispatchEvent(new CustomEvent(MARKER_MOCK_STATE_EVENT, { detail: { enabled } }))
  } catch {
    // CustomEvent can be unavailable only in very old webviews.
  }
}

type TMockType = 'passenger' | 'delivery' | 'marshrutka'
// Режим распределения — независимая ось от типа (§11 фильтр «Голосование»).
type TMockMode = 'voting' | 'fixed'
type TMockStatus = 'new' | 'responded' | 'driverAnswered' | 'won' | 'expired'
type TMockDemoState = 'selected' | 'pressed' | 'inactive'
// Режим жизни заказа — НОВАЯ ось, независимая и от типа перевозки (passenger/delivery/
// marshrutka), и от режима распределения (voting/fixed). Задаёт поведение таймера:
//   vote   — убывающий таймер жизни (голосование); при обнулении заказ исчезает с карты;
//   offer  — убывающий таймер офера (кольцо §6, 100%→0);
//   direct — НАРАСТАЮЩИЙ счётчик «сколько уже ждёт» от момента готовности к посадке.
export type TMockLifeMode = 'vote' | 'offer' | 'direct'

interface IMockSpec {
  key: string
  // Тип заказа (форма маркера, §3) — независим от режима распределения.
  type: TMockType
  // Режим распределения (§11 «Голосование»/фикс) — независим от типа.
  mode: TMockMode
  status: TMockStatus
  // Остаток жизни офера в процентах (для цвета кольца). null — кольцо не нужно.
  ringRemaining: number | null
  // Режим жизни заказа (НОВАЯ ось, независима от type и mode). undefined — без живого таймера.
  lifeMode?: TMockLifeMode
  // Окно жизни (сек) для vote/offer. Иначе берётся дефолт по режиму.
  lifeWindowSec?: number
  // Начальный остаток (сек) для vote/offer. Иначе вычисляется из ringRemaining.
  initialRemainingSec?: number
  // Для direct — сколько секунд заказ уже ждёт на момент старта демо (счётчик растёт вверх).
  directElapsedSec?: number
  // Смещение точки старта от центра (градусы).
  latOff: number
  lngOff: number
  // Смещение точки назначения от старта (задаёт азимут -> полосу RouteFit).
  dLat: number
  dLng: number
  demoState?: TMockDemoState
}

// Полное окно жизни офера для всех мок-заказов (сек).
const MOCK_LIFETIME_SECONDS = 600
// Окно жизни VOTE-заказа (голосование) короче офера — отсчёт нагляднее в демо.
const MOCK_VOTE_WINDOW_SECONDS = 300
// Стабильная точка отсчёта сессии. Все живые таймеры мока считаются ОТ НЕЁ (а не от
// Date.now() в момент пересборки заказов): иначе при каждом ребилде mockBundle —
// например при смене mockCenter после получения GPS — таймеры бы сбрасывались.
const MOCK_SESSION_EPOCH = Date.now()

// dLat/dLng подобраны под курс 0° (север), чтобы азимут старт->назначение попал в
// нужную полосу RouteFit: ideal ↑ (~0°), small ↗ (~50°), strong → (~106°), against ✗ (~170°).
// Комбинации type × mode разные, чтобы фильтры «Маршрутки» (тип) и «Голосование» (режим)
// были независимы: есть маршрутка-голосование, маршрутка-фикс, пассажир-голосование и т.д.
// lifeMode задаёт ПОВЕДЕНИЕ ТАЙМЕРА (vote/offer убывают, direct растёт) и не зависит
// ни от type (форма), ни от mode (фильтр голосования). Подобраны так, чтобы в демо были
// видны все три: убывающее кольцо vote/offer, нарастающий счётчик direct и исчезновение
// VOTE при обнулении (new-marsh стартует с ~18 c).
const SPECS: IMockSpec[] = [
  // Ряд 1 — кольцо во всех цветах + RouteFit во всех 4 полосах.
  { key: 'new-pass-ideal',       type: 'passenger',  mode: 'fixed',  status: 'new',            ringRemaining: 100, lifeMode: 'direct', directElapsedSec:   0, latOff:  0.020, lngOff: -0.020, dLat:  0.020, dLng:  0.000 },
  { key: 'resp-pass-small',      type: 'passenger',  mode: 'voting', status: 'responded',      ringRemaining:  75, lifeMode: 'vote',                       latOff:  0.020, lngOff: -0.007, dLat:  0.012, dLng:  0.025 },
  { key: 'ans-deliv-strong',     type: 'delivery',   mode: 'fixed',  status: 'driverAnswered', ringRemaining:  30, lifeMode: 'offer',                      latOff:  0.020, lngOff:  0.007, dLat: -0.004, dLng:  0.025 },
  { key: 'new-deliv-against',    type: 'delivery',   mode: 'fixed',  status: 'new',            ringRemaining:   8, lifeMode: 'offer',                      latOff:  0.020, lngOff:  0.014, dLat: -0.025, dLng:  0.008 },
  // Ряд 2 — победитель, истёкший, ещё типы/статусы.
  { key: 'won-pass',             type: 'passenger',  mode: 'fixed',  status: 'won',            ringRemaining: null,                                       latOff:  0.007, lngOff: -0.020, dLat:  0.018, dLng:  0.000 },
  { key: 'expired-marsh',        type: 'marshrutka', mode: 'voting', status: 'expired',        ringRemaining: null,                                       latOff:  0.007, lngOff: -0.007, dLat:  0.012, dLng:  0.012 },
  { key: 'new-marsh',            type: 'marshrutka', mode: 'voting', status: 'new',            ringRemaining: 100, lifeMode: 'vote',  initialRemainingSec: 18, latOff:  0.007, lngOff:  0.007, dLat:  0.012, dLng:  0.020 },
  { key: 'ans-pass',             type: 'passenger',  mode: 'voting', status: 'driverAnswered', ringRemaining:  50, lifeMode: 'vote',                       latOff:  0.007, lngOff:  0.020, dLat: -0.004, dLng:  0.022 },
  // Ряд 3 — ещё типы/статусы + состояния взаимодействия §12.
  { key: 'resp-marsh',           type: 'marshrutka', mode: 'fixed',  status: 'responded',      ringRemaining:  30, lifeMode: 'offer',                      latOff: -0.007, lngOff: -0.020, dLat: -0.022, dLng:  0.006 },
  { key: 'new-deliv',            type: 'delivery',   mode: 'voting', status: 'new',            ringRemaining:  75, lifeMode: 'vote',                       latOff: -0.011, lngOff: -0.005, dLat:  0.020, dLng: -0.002 },
  { key: 'state-selected',       type: 'passenger',  mode: 'fixed',  status: 'new',            ringRemaining:  90, lifeMode: 'offer',                      latOff: -0.004, lngOff:  0.010, dLat:  0.020, dLng:  0.000, demoState: 'selected' },
  { key: 'state-pressed',        type: 'passenger',  mode: 'voting', status: 'new',            ringRemaining:  60, lifeMode: 'offer',                      latOff: -0.007, lngOff:  0.020, dLat:  0.010, dLng:  0.022, demoState: 'pressed' },
  // Ряд 4 — неактивный (direct, уже ждёт ~2 мин — счётчик стартует не с нуля).
  { key: 'state-inactive',       type: 'passenger',  mode: 'fixed',  status: 'new',            ringRemaining:  45, lifeMode: 'direct', directElapsedSec: 125, latOff: -0.020, lngOff: -0.007, dLat: -0.020, dLng:  0.006, demoState: 'inactive' },
]

function makeDriver(fields: Partial<IDriver>): IDriver {
  return {
    u_id: 'mock-driver',
    c_id: 'mock-car',
    c_arrive_state: false,
    c_state: EBookingDriverState.Considering,
    ...fields,
  } as IDriver
}

function buildDrivers(spec: IMockSpec, currentUserId: string | undefined, base: [number, number]): IDriver[] {
  const selfId = currentUserId || 'mock-self'

  if (spec.status === 'responded')
    return [makeDriver({ u_id: selfId, c_id: 'mock-car-self', c_state: EBookingDriverState.Considering })]

  if (spec.status === 'driverAnswered')
    return [makeDriver({ u_id: 'mock-other-driver', c_id: 'mock-car-other', c_state: EBookingDriverState.Considering })]

  if (spec.status === 'won')
    return [makeDriver({
      u_id: selfId,
      c_id: 'mock-car-self',
      c_state: EBookingDriverState.Performer,
      c_arrive_state: false,
      c_latitude: base[0],
      c_longitude: base[1],
    })]

  return []
}

// Тип и режим — две независимые метки. ds_order_type задаёт форму маркера (§3),
// ds_order_mode — режим распределения (§11 «Голосование»). b_voting синхронизируем
// с режимом, чтобы реальная логика (isVotingOrder) не противоречила метке.
function buildTypeFields(type: TMockType, mode: TMockMode): Record<string, any> {
  const options: Record<string, any> = { ds_order_type: type, ds_order_mode: mode }
  if (type === 'delivery')
    options.courier_auto = '1'
  return { b_options: options, b_voting: mode === 'voting', b_services: null }
}

// Возвращает поля жизни заказа. Для vote/offer/direct кладёт АБСОЛЮТНЫЕ якоря времени
// (ds_life_deadline_ms / ds_life_ready_ms) от стабильного MOCK_SESSION_EPOCH — чтобы
// таймеры реально шли (считаются на каждый тик через Date.now()), а не стояли.
function buildLifetimeFields(spec: IMockSpec): Record<string, any> {
  // Истёкший — статичная демонстрация статуса (без живого таймера, не удаляется).
  if (spec.status === 'expired')
    return { b_max_waiting: MOCK_LIFETIME_SECONDS, remaining_lifetime_seconds: 0 }

  if (spec.lifeMode === 'direct') {
    const elapsedSec = Math.max(0, spec.directElapsedSec ?? 0)
    return {
      ds_life_mode: 'direct',
      ds_life_ready_ms: MOCK_SESSION_EPOCH - elapsedSec * 1000,
    }
  }

  if (spec.lifeMode === 'vote' || spec.lifeMode === 'offer') {
    const totalSec = spec.lifeWindowSec ??
      (spec.lifeMode === 'vote' ? MOCK_VOTE_WINDOW_SECONDS : MOCK_LIFETIME_SECONDS)
    const remainingSec = spec.initialRemainingSec != null
      ? Math.max(0, spec.initialRemainingSec)
      : ((spec.ringRemaining ?? 100) / 100) * totalSec
    return {
      b_max_waiting: totalSec,
      // Начальный снимок остатка — для legacy-читателей (isVotingOrderExpired и т.п.).
      remaining_lifetime_seconds: Math.round(remainingSec),
      ds_life_mode: spec.lifeMode,
      ds_life_total_ms: totalSec * 1000,
      ds_life_deadline_ms: MOCK_SESSION_EPOCH + remainingSec * 1000,
    }
  }

  // Без режима жизни (например won) — прежнее статичное кольцо из ringRemaining.
  if (spec.ringRemaining === null)
    return {}

  return {
    b_max_waiting: MOCK_LIFETIME_SECONDS,
    remaining_lifetime_seconds: Math.round((spec.ringRemaining / 100) * MOCK_LIFETIME_SECONDS),
  }
}

function buildMockOrder(spec: IMockSpec, index: number, currentUserId: string | undefined, base: [number, number]): IOrder {
  const startLat = base[0] + spec.latOff
  const startLng = base[1] + spec.lngOff
  const now = moment()

  const price = 120 + index * 25
  const tips = index % 3 === 0 ? 10 : 0

  return {
    b_id: `mock-${spec.key}`,
    u_id: `mock-client-${spec.key}`,
    b_start_latitude: startLat,
    b_start_longitude: startLng,
    b_destination_latitude: startLat + spec.dLat,
    b_destination_longitude: startLng + spec.dLng,
    b_start_address: `Старт · ${spec.key}`,
    b_destination_address: `Назначение · ${spec.key}`,
    b_start_datetime: now.clone(),
    b_created: now.clone(),
    b_state: 1,
    b_passengers_count: (index % 4) + 1,
    b_price_estimate: price,
    b_tips: tips,
    profit: price + tips,
    b_estimate_waiting: 180 + index * 30,
    drivers: buildDrivers(spec, currentUserId, base),
    ds_demo_state: spec.demoState,
    ...buildTypeFields(spec.type, spec.mode),
    ...buildLifetimeFields(spec),
  } as unknown as IOrder
}

// center — реальная позиция водителя (где синий маркер «я»). Заказы разносим вокруг
// неё в радиусе ~2 км. Если позиции нет — фолбэк на демо-центр (Москва).
export function buildMockDriverOrders(
  currentUserId?: string,
  center?: [number, number] | null,
): { active: IOrder[], ready: IOrder[] } {
  const base: [number, number] =
    center && Number.isFinite(center[0]) && Number.isFinite(center[1])
      ? [center[0], center[1]]
      : MOCK_DRIVER_POSITION

  const active: IOrder[] = []
  const ready: IOrder[] = []

  SPECS.forEach((spec, index) => {
    const order = buildMockOrder(spec, index, currentUserId, base)
    // Победитель должен попасть в activeOrders — иначе activeDriverOrder его не найдёт
    // и статус «won»/маршрут активного заказа не отрисуются.
    if (spec.status === 'won')
      active.push(order)
    else
      ready.push(order)
  })

  return { active, ready }
}

/* ============================================================================
 *  Живые таймеры жизни заказа (мок). Считаются на каждый тик через Date.now() от
 *  абсолютных якорей (ds_life_deadline_ms / ds_life_ready_ms), которые проставил
 *  buildLifetimeFields. Поэтому реально идут, а не стоят.
 *
 *    vote   — убывающий остаток; при 0 заказ убирается с карты (см. isMockLifeExpired);
 *             клиент может продлить кликом (extendMockVoteLife).
 *    offer  — убывающий остаток (кольцо §6 100%→0); при 0 тоже убирается с карты.
 *    direct — нарастающий счётчик «сколько уже ждёт» (растёт вверх, не убывает).
 * ========================================================================== */

// Продления VOTE-таймера по клику. Ключ — b_id, значение — добавленные миллисекунды.
// Модульный Map переживает пересборку mockBundle, поэтому продление не теряется.
const voteExtensionsMs = new Map<string, number>()

export function getMockVoteExtensionMs(orderId: unknown): number {
  return voteExtensionsMs.get(String(orderId)) || 0
}

// Продлить жизнь VOTE-заказа (по умолчанию +30 c). Возвращает новый суммарный бонус.
export function extendMockVoteLife(orderId: unknown, addMs = 30000): number {
  const id = String(orderId)
  const next = (voteExtensionsMs.get(id) || 0) + Math.max(0, addMs)
  voteExtensionsMs.set(id, next)
  return next
}

export function getOrderLifeMode(order: any): TMockLifeMode | null {
  const value = String(order?.ds_life_mode ?? '').toLowerCase()
  return value === 'vote' || value === 'offer' || value === 'direct' ? value : null
}

// Полное окно жизни (мс) для vote/offer; с учётом продления — для пропорции кольца.
export function getOrderLifeTotalMs(order: any): number | null {
  const total = Number(order?.ds_life_total_ms)
  if (!Number.isFinite(total) || total <= 0) return null
  return total + getMockVoteExtensionMs(order?.b_id)
}

// Остаток жизни (мс) для vote/offer. null — режим без убывающего таймера.
export function getOrderLifeRemainingMs(order: any, now: number = Date.now()): number | null {
  const mode = getOrderLifeMode(order)
  if (mode !== 'vote' && mode !== 'offer') return null
  const deadline = Number(order?.ds_life_deadline_ms)
  if (!Number.isFinite(deadline)) return null
  return Math.max(0, deadline + getMockVoteExtensionMs(order?.b_id) - now)
}

// Прошедшее время (мс) для direct — нарастающий счётчик ожидания. null — не direct.
export function getOrderLifeElapsedMs(order: any, now: number = Date.now()): number | null {
  if (getOrderLifeMode(order) !== 'direct') return null
  const ready = Number(order?.ds_life_ready_ms)
  if (!Number.isFinite(ready)) return null
  return Math.max(0, now - ready)
}

// Возраст офера/голосования 0..100 для кольца §6. null — нет убывающего таймера.
export function getOrderLifeAgePct(order: any, now: number = Date.now()): number | null {
  const total = getOrderLifeTotalMs(order)
  const remaining = getOrderLifeRemainingMs(order, now)
  if (total === null || remaining === null) return null
  return Math.min(100, Math.max(0, 100 - (remaining / total) * 100))
}

// Заказ с УБЫВАЮЩИМ таймером (vote или offer) исчерпал жизнь -> убрать с карты
// (§6 «скоро исчезнет» -> исчезает). direct (нарастающий счётчик) и заказы без режима
// жизни не трогаем.
export function isMockLifeExpired(order: any, now: number = Date.now()): boolean {
  const mode = getOrderLifeMode(order)
  if (mode !== 'vote' && mode !== 'offer') return false
  const remaining = getOrderLifeRemainingMs(order, now)
  return remaining !== null && remaining <= 0
}

// M:SS из миллисекунд (для подписи таймера на маркере).
export function formatLifeClock(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSec / 60)
  const seconds = totalSec % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
