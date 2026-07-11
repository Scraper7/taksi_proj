import { writeRawLog } from './rawLog'
import { IOrder, IDriver, EBookingDriverState } from '../types/types'

export type TBrowserEmulatorMode = 'drivers' | 'clients'

type TEmulatorModeState = {
  running: boolean
  startedAt?: number | null
}

type TPersistentState = Partial<Record<TBrowserEmulatorMode, TEmulatorModeState>>

type TEmulatorIdentity = {
  userId?: string | number | null
  carId?: string | number | null
  login?: string | null
  name?: string | null
}

export type TEmulatedDriverLocation = {
  userId?: string | number | null
  carId?: string | number | null
  latitude: number
  longitude: number
  updatedAt: number
}

export const BROWSER_EMULATOR_STATE_KEY = 'gruzvill_browser_emulator_state_v2'
export const BROWSER_EMULATOR_DRIVER_IDS_KEY = 'gruzvill_browser_emulator_driver_ids_v2'
export const BROWSER_EMULATOR_CLIENT_IDS_KEY = 'gruzvill_browser_emulator_client_ids_v2'
export const BROWSER_EMULATOR_DRIVER_ORDER_IDS_KEY = 'gruzvill_browser_emulator_driver_order_ids_v2'
export const BROWSER_EMULATOR_CLIENT_ORDER_IDS_KEY = 'gruzvill_browser_emulator_client_order_ids_v2'
export const BROWSER_EMULATOR_STATE_EVENT = 'gruzvill-browser-emulator-state-change'
export const BROWSER_EMULATOR_DRIVER_LOCATION_KEY = 'gruzvill_browser_emulator_driver_locations_v1'
export const BROWSER_EMULATOR_DRIVER_LOCATION_EVENT = 'gruzvill-browser-emulator-driver-location-change'
const CLIENT_EMULATOR_ORDER_MAX_AGE_MS = 2 * 60 * 60 * 1000

function getStorage() {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

function safeJsonParse<T>(value: any, fallback: T): T {
  try {
    if (!value) return fallback
    const parsed = JSON.parse(String(value))
    return parsed || fallback
  } catch {
    return fallback
  }
}

function normalizeId(value: any) {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function readList(key: string): TEmulatorIdentity[] {
  const storage = getStorage()
  if (!storage) return []
  const list = safeJsonParse<TEmulatorIdentity[]>(storage.getItem(key), [])
  return Array.isArray(list) ? list : []
}

function writeList(key: string, list: TEmulatorIdentity[]) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(key, JSON.stringify(list.slice(-80)))
}

function readOrderIds(key: string): string[] {
  const storage = getStorage()
  if (!storage) return []
  const list = safeJsonParse<any[]>(storage.getItem(key), [])
  if (!Array.isArray(list)) return []
  return Array.from(new Set(list.map(normalizeId).filter(Boolean))).slice(-120)
}

function writeOrderIds(key: string, ids: string[]) {
  const storage = getStorage()
  if (!storage) return
  storage.setItem(key, JSON.stringify(Array.from(new Set(ids.map(normalizeId).filter(Boolean))).slice(-120)))
}

function orderKeyByMode(mode: TBrowserEmulatorMode) {
  return mode === 'clients' ? BROWSER_EMULATOR_CLIENT_ORDER_IDS_KEY : BROWSER_EMULATOR_DRIVER_ORDER_IDS_KEY
}

export function saveBrowserEmulatorOrderId(mode: TBrowserEmulatorMode, orderId: any) {
  const id = normalizeId(orderId)
  if (!id) return
  const key = orderKeyByMode(mode)
  const ids = readOrderIds(key)
  if (!ids.includes(id)) ids.push(id)
  writeOrderIds(key, ids)
}

export function getBrowserEmulatorOrderIds(mode?: TBrowserEmulatorMode) {
  if (mode) return readOrderIds(orderKeyByMode(mode))
  return Array.from(new Set([
    ...readOrderIds(BROWSER_EMULATOR_DRIVER_ORDER_IDS_KEY),
    ...readOrderIds(BROWSER_EMULATOR_CLIENT_ORDER_IDS_KEY),
  ]))
}

export function removeBrowserEmulatorOrderId(mode: TBrowserEmulatorMode, orderId: any) {
  const id = normalizeId(orderId)
  if (!id) return
  const key = orderKeyByMode(mode)
  writeOrderIds(key, readOrderIds(key).filter(item => item !== id))
}

export function clearBrowserEmulatorOrderIds(mode: TBrowserEmulatorMode) {
  writeOrderIds(orderKeyByMode(mode), [])
}

export function getEmulatedDriverLocations(): Record<string, TEmulatedDriverLocation> {
  const storage = getStorage()
  if (!storage) return {}
  const value = safeJsonParse<Record<string, TEmulatedDriverLocation>>(storage.getItem(BROWSER_EMULATOR_DRIVER_LOCATION_KEY), {})
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function getEmulatedDriverLocation(driver: Partial<IDriver> | any): TEmulatedDriverLocation | null {
  if (!driver) return null

  const map = getEmulatedDriverLocations()
  const keys = [
    normalizeId(driver.u_id ?? driver.user?.u_id),
    normalizeId(driver.c_id ?? driver.car?.c_id),
  ].filter(Boolean)

  for (const key of keys) {
    const item = map[key]
    if (item && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
      return item
  }

  return null
}

export function saveEmulatedDriverLocation(identity: TEmulatorIdentity, point: { latitude: number, longitude: number }) {
  const latitude = Number(point?.latitude)
  const longitude = Number(point?.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

  const storage = getStorage()
  if (!storage) return

  const userId = normalizeId(identity.userId)
  const carId = normalizeId(identity.carId)
  const keys = [userId, carId].filter(Boolean)
  if (!keys.length) return

  const map = getEmulatedDriverLocations()
  const item: TEmulatedDriverLocation = {
    userId: userId || null,
    carId: carId || null,
    latitude,
    longitude,
    updatedAt: Date.now(),
  }

  keys.forEach(key => { map[key] = item })

  const cutoff = Date.now() - 30 * 60 * 1000
  Object.keys(map).forEach(key => {
    if (!map[key]?.updatedAt || map[key].updatedAt < cutoff)
      delete map[key]
  })

  storage.setItem(BROWSER_EMULATOR_DRIVER_LOCATION_KEY, JSON.stringify(map))
  try {
    window.dispatchEvent(new CustomEvent(BROWSER_EMULATOR_DRIVER_LOCATION_EVENT, { detail: item }))
  } catch {
    // UI refresh only.
  }
}

export function clearEmulatedDriverLocations() {
  const storage = getStorage()
  if (!storage) return
  storage.removeItem(BROWSER_EMULATOR_DRIVER_LOCATION_KEY)
  try {
    window.dispatchEvent(new CustomEvent(BROWSER_EMULATOR_DRIVER_LOCATION_EVENT, { detail: null }))
  } catch {
    // UI refresh only.
  }
}


function getTimestampMs(value: any): number | null {
  if (!value)
    return null

  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (typeof value === 'object') {
    if (typeof value.valueOf === 'function') {
      const valueOf = Number(value.valueOf())
      if (Number.isFinite(valueOf) && valueOf > 100000000000)
        return valueOf
    }

    const direct = [
      value._d,
      value._i,
      value.date,
      value.datetime,
      value.created_at,
      value.createdAt,
      value.time,
      value.timestamp,
    ]

    for (const item of direct) {
      const parsed = getTimestampMs(item)
      if (parsed)
        return parsed
    }
  }

  return null
}

function getOrderCreatedTimestampMs(order: Partial<IOrder> | any) {
  return getTimestampMs(
    order?.b_created ??
    order?.created_at ??
    order?.createdAt ??
    order?.b_start_datetime ??
    order?.start_datetime ??
    order?.datetime,
  )
}

export function isFreshBrowserEmulatorOrder(order: Partial<IOrder> | any, maxAgeMs = CLIENT_EMULATOR_ORDER_MAX_AGE_MS) {
  const timestamp = getOrderCreatedTimestampMs(order)

  // If backend did not return a date, do not hide by age here.
  // Other emulator checks still decide visibility.
  if (!timestamp)
    return true

  return Date.now() - timestamp <= maxAgeMs
}


export function isBrowserEmulatorOrder(order: Partial<IOrder> | any, mode?: TBrowserEmulatorMode) {
  const orderId = normalizeId(order?.b_id ?? order?.id ?? order?.booking_id)
  return Boolean(orderId && getBrowserEmulatorOrderIds(mode).includes(orderId))
}


function saveIdentity(key: string, identity: TEmulatorIdentity) {
  const userId = normalizeId(identity.userId)
  const carId = normalizeId(identity.carId)
  const login = identity.login ? String(identity.login) : ''
  const name = identity.name ? String(identity.name) : ''
  if (!userId && !carId && !login && !name) return

  const list = readList(key)
  const exists = list.some(item =>
    (userId && normalizeId(item.userId) === userId) ||
    (carId && normalizeId(item.carId) === carId) ||
    (login && String(item.login || '').toLowerCase() === login.toLowerCase())
  )

  if (!exists)
    list.push({ userId: userId || null, carId: carId || null, login: login || null, name: name || null })

  writeList(key, list)
}

export function getBrowserEmulatorState(): TPersistentState {
  const storage = getStorage()
  if (!storage) return {}
  return safeJsonParse<TPersistentState>(storage.getItem(BROWSER_EMULATOR_STATE_KEY), {})
}

export function setBrowserEmulatorRunning(mode: TBrowserEmulatorMode, running: boolean) {
  const storage = getStorage()
  if (!storage) return
  const state = getBrowserEmulatorState()
  const wasRunning = Boolean(state[mode]?.running)
  state[mode] = {
    running,
    startedAt: running ? (wasRunning ? state[mode]?.startedAt || Date.now() : Date.now()) : null,
  }
  storage.setItem(BROWSER_EMULATOR_STATE_KEY, JSON.stringify(state))
  writeRawLog('EMULATOR_MODE_CHANGED', {
    source: 'browser-emulator-mode',
    mode,
    running,
    wasRunning,
    activeModes: (['clients', 'drivers'] as TBrowserEmulatorMode[]).filter(item => Boolean(state[item]?.running)),
    visibleEmulatorOrderIds: getVisibleBrowserEmulatorOrderIds(),
  })
  try {
    window.dispatchEvent(new CustomEvent(BROWSER_EMULATOR_STATE_EVENT, { detail: { mode, running, state } }))
  } catch {
    // CustomEvent can be unavailable only in very old webviews.
  }
}

export function isBrowserEmulatorRunning(mode: TBrowserEmulatorMode) {
  return Boolean(getBrowserEmulatorState()[mode]?.running)
}

export function isAnyBrowserEmulatorModeRunning() {
  return isBrowserEmulatorRunning('clients') || isBrowserEmulatorRunning('drivers')
}

export function getRunningBrowserEmulatorModes() {
  return (['clients', 'drivers'] as TBrowserEmulatorMode[])
    .filter(mode => isBrowserEmulatorRunning(mode))
}

export function getVisibleBrowserEmulatorOrderIds() {
  if (!isAnyBrowserEmulatorModeRunning())
    return []

  return getBrowserEmulatorOrderIds()
}

export function getPreferredBrowserEmulatorMode(fallback: TBrowserEmulatorMode = 'drivers'): TBrowserEmulatorMode {
  const state = getBrowserEmulatorState()
  if (state.clients?.running) return 'clients'
  if (state.drivers?.running) return 'drivers'
  return fallback
}

export function saveEmulatedDriverIdentity(identity: TEmulatorIdentity) {
  saveIdentity(BROWSER_EMULATOR_DRIVER_IDS_KEY, identity)
}

export function saveEmulatedClientIdentity(identity: TEmulatorIdentity) {
  saveIdentity(BROWSER_EMULATOR_CLIENT_IDS_KEY, identity)
}

export function getEmulatedDriverIdentities() {
  return readList(BROWSER_EMULATOR_DRIVER_IDS_KEY)
}

export function getEmulatedClientIdentities() {
  return readList(BROWSER_EMULATOR_CLIENT_IDS_KEY)
}

function stringifySafe(value: any) {
  try { return JSON.stringify(value || {}) } catch { return String(value || '') }
}

function parseMaybeObject(value: any): any {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    const parsed = JSON.parse(String(value))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeFlag(value: any) {
  return value === true || value === 1 || String(value || '').trim().toLowerCase() === 'true' || String(value || '').trim() === '1'
}

function getOrderOptions(order: Partial<IOrder> | any) {
  return parseMaybeObject(order?.b_options ?? order?.options)
}

function hasEmulatorFlag(value: any) {
  const text = stringifySafe(value).toLowerCase()
  return text.includes('__gruzvill_emulator') ||
    text.includes('gruzvill_emulator') ||
    text.includes('emulator_driver') ||
    text.includes('emulator_client') ||
    text.includes('driver_emulator') ||
    text.includes('client_order_emulator') ||
    text.includes('driver_emulator_target') ||
    text.includes('emulator_drivers_target')
}

function hasClientOrderEmulatorFlag(order: Partial<IOrder> | any) {
  const options = getOrderOptions(order)
  const text = [
    stringifySafe(options),
    String(order?.b_custom_comment || ''),
    String(order?.b_comments || ''),
  ].join(' ').toLowerCase()

  return normalizeFlag(options.client_order_emulator) ||
    normalizeFlag(options.emulator_client) ||
    normalizeFlag(options.__gruzvill_client_emulator) ||
    text.includes('client_order_emulator') ||
    text.includes('__gruzvill_client_emulator') ||
    text.includes('gruzvill.client') ||
    text.includes('тестовый клиентский заказ')
}

function hasDriverTargetEmulatorFlag(order: Partial<IOrder> | any) {
  const options = getOrderOptions(order)
  const text = [
    stringifySafe(options),
    String(order?.b_custom_comment || ''),
    String(order?.b_comments || ''),
  ].join(' ').toLowerCase()

  return normalizeFlag(options.driver_emulator_target) ||
    normalizeFlag(options.emulator_drivers_target) ||
    normalizeFlag(options.__gruzvill_driver_emulator_target) ||
    text.includes('driver_emulator_target') ||
    text.includes('emulator_drivers_target') ||
    text.includes('__gruzvill_driver_emulator_target')
}

export function isLocalBrowserEmulatorOrder(order: Partial<IOrder> | any, mode: TBrowserEmulatorMode) {
  return isBrowserEmulatorOrder(order, mode)
}

export function isEmulatedDriverOrder(order: Partial<IOrder> | any) {
  return isBrowserEmulatorOrder(order, 'drivers') || hasDriverTargetEmulatorFlag(order)
}

export function buildDriverEmulatorTargetOptions(options: any) {
  // Не добавляем служебные emulator-ключи в данные заказа.
  // Backend gruzvill может показывать/отклонять такие ключи как wrong *_options keys.
  // Связь с эмулятором держим только локально через saveBrowserEmulatorOrderId(b_id).
  return parseMaybeObject(options)
}

export function isEmulatedDriver(driver: Partial<IDriver> | any) {
  if (!driver) return false
  if (hasEmulatorFlag(driver?.c_options) || hasEmulatorFlag(driver?.user)) return true

  const userId = normalizeId(driver.u_id ?? driver.user?.u_id)
  const carId = normalizeId(driver.c_id ?? driver.car?.c_id)
  const nameText = [
    driver.u_name,
    driver.user?.u_name,
    driver.user?.u_email,
    driver.user?.email,
    driver.user?.login,
  ].filter(Boolean).join(' ').toLowerCase()

  if (nameText.includes('gmailgtest') || nameText.includes('gruzvill driver')) return true

  return getEmulatedDriverIdentities().some(item =>
    (userId && normalizeId(item.userId) === userId) ||
    (carId && normalizeId(item.carId) === carId) ||
    (item.login && nameText.includes(String(item.login).toLowerCase())) ||
    (item.name && nameText.includes(String(item.name).toLowerCase()))
  )
}

export function isEmulatedClientOrder(order: Partial<IOrder> | any) {
  if (!order) return false
  if (isBrowserEmulatorOrder(order, 'clients')) return true
  if (hasClientOrderEmulatorFlag(order)) return true

  const userId = normalizeId(order.u_id ?? order.user?.u_id ?? order.b_user_id ?? order.client_id)
  const text = [
    order.user?.u_email,
    order.user?.email,
    order.user?.u_name,
    order.b_custom_comment,
    order.b_comments,
    order.b_start_address,
    order.b_destination_address,
  ].filter(Boolean).join(' ').toLowerCase()

  return getEmulatedClientIdentities().some(item =>
    (userId && normalizeId(item.userId) === userId) ||
    (item.login && text.includes(String(item.login).toLowerCase())) ||
    (item.name && text.includes(String(item.name).toLowerCase()))
  )
}

export function isDriverEmulatorTargetOrder(order: Partial<IOrder> | any) {
  if (!order) return false
  return isEmulatedDriverOrder(order) && !hasClientOrderEmulatorFlag(order)
}

export function isAnyBrowserEmulatorOrder(order: Partial<IOrder> | any) {
  return isEmulatedClientOrder(order) || isEmulatedDriverOrder(order) || hasEmulatorFlag(order?.b_options)
}

export function shouldHideOrderFromNormalMode(order: Partial<IOrder> | any) {
  return isAnyBrowserEmulatorOrder(order)
}

function hasMultipleVisibleChoiceDrivers(order: IOrder) {
  const visibleStates = [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ]

  return (order.drivers ?? [])
    .filter(driver => visibleStates.includes(Number(driver.c_state) as EBookingDriverState))
    .length > 1
}

export function filterOrderDriversForBrowserEmulator(order: IOrder): IOrder {
  if (!order?.drivers?.length) return order

  // On the passenger side offer/voting can receive two or more driver responses.
  // Do not cut this list by local browser emulator identities: Android/desktop can
  // have only one stored identity and would show one candidate while iPhone shows two.
  if (hasMultipleVisibleChoiceDrivers(order)) return order

  const drivers = isBrowserEmulatorRunning('drivers') ?
    order.drivers.filter(isEmulatedDriver) :
    order.drivers.filter(driver => !isEmulatedDriver(driver))

  if (drivers.length === order.drivers.length) return order
  return { ...order, drivers }
}

export function filterOrdersForBrowserEmulator(orders: IOrder[] | null | undefined, kind: 'active' | 'ready' | 'history' = 'active') {
  if (!orders) return orders ?? null

  const clientEmulatorMode = isBrowserEmulatorRunning('clients') && (kind === 'ready' || kind === 'active')
  const driverEmulatorMode = isBrowserEmulatorRunning('drivers') && (kind === 'ready' || kind === 'active')

  const visibleOrders = clientEmulatorMode ?
    orders.filter(order => isLocalBrowserEmulatorOrder(order, 'clients') && isFreshBrowserEmulatorOrder(order)) :
    driverEmulatorMode ?
      orders.filter(order =>
        isLocalBrowserEmulatorOrder(order, 'drivers') &&
        isFreshBrowserEmulatorOrder(order)
      ) :
      orders.filter(order => !shouldHideOrderFromNormalMode(order))

  return visibleOrders.map(filterOrderDriversForBrowserEmulator)
}
