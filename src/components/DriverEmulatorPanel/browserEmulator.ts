/* Browser-only driver emulator for gruzvill.
 * It does not use localhost/node panel, so it works from Vercel links too.
 */

import { promiseAllSettled } from '../../tools/compat'
import {
  setBrowserEmulatorRunning,
  saveEmulatedDriverIdentity,
  saveEmulatedClientIdentity,
  saveBrowserEmulatorOrderId,
  removeBrowserEmulatorOrderId,
  clearBrowserEmulatorOrderIds,
  getBrowserEmulatorOrderIds,
  isDriverEmulatorTargetOrder,
  saveEmulatedDriverLocation,
  clearEmulatedDriverLocations,
} from '../../tools/emulatorMode'
import { getDefaultCityLocationClassId, getDefaultIntercityLocationClassId, getOfferResponseBookingCommentIds, getPassengerConfirmedChoice, getStoredChoiceOrderMode, setStoredChoiceOrderMode } from '../../tools/driverOffer'
import { writeRawLog } from '../../tools/rawLog'
import * as API from '../../API'

export type BrowserEmulatorSnapshot = {
  running: boolean
  logs: string[]
  message?: string
}

type Point = { latitude: number, longitude: number }
type Session = { token: string, u_hash: string, user?: any }
type BotState = {
  driver: any
  index: number
  name: string
  session?: Session
  user?: any
  car?: any
  disabled?: boolean
  currentLocation?: Point | null
  handled: Set<string>
  waitLogged: Set<string>
  blockedLogged: Set<string>
  responseSentAt: Map<string, number>
  tripState: Map<string, any>
  spawnLocations: Map<string, Point>
  lastLocationSentAt?: number
  lastLocationAttemptAt?: number
  lastLocationErrorLoggedAt?: number
  lastActiveFetchedAt?: number
  activeCache?: any[]
  lastReadyFetchedAt?: number
  readyCache?: any[]
}


type BrowserEmulatorOptions = {
  onUpdate: (snapshot: BrowserEmulatorSnapshot) => void
}

const API_BASE = 'https://ibronevik.ru/taxi/c/gruzvill/api/v1'
const POLL_INTERVAL_MS = 3000
const REMOTE_LOCATION_INTERVAL_MS = 5000
const LOCATION_ERROR_LOG_INTERVAL_MS = 12000
const ACTIVE_ORDERS_CACHE_MS = 5800
const READY_ORDERS_CACHE_MS = 5800
const DEMO_DRIVER_SPEED_KMH = 110
const DEMO_DRIVER_SPEED_MPS = DEMO_DRIVER_SPEED_KMH * 1000 / 3600
const MIN_PICKUP_VISIBLE_TRAVEL_MS = 45000
const MIN_PICKUP_START_DISTANCE_METERS = 450
const HOLD_BEFORE_PICKUP_METERS = 35
const ROUTE_DENSIFY_STEP_METERS = 3
const ROUTE_FINISH_THRESHOLD_METERS = 7
const ROUTE_CACHE_STORAGE_KEY = 'orsRouteCache.v1'
const SAVED_GEOLOCATION_KEY = 'gruzvill_last_browser_geolocation'
const EMULATOR_GEOLOCATION_TIMEOUT_MS = 12000
const EMULATOR_LOCATION_MAX_AGE_MS = 10 * 60 * 1000
const DRIVER_STATES = {
  CONSIDERING: 1,
  CANCELED: 2,
  PERFORMER: 3,
  ARRIVED: 4,
  STARTED: 5,
  FINISHED: 6,
}
const ACTIONS = {
  SET_PERFORMER: 'set_performer',
  SET_ARRIVE_STATE: 'set_arrive_state',
  SET_START_STATE: 'set_start_state',
  SET_COMPLETE_STATE: 'set_complete_state',
  SET_CANCEL_STATE: 'set_cancel_state',
}

const DRIVERS = [
  {
    name: 'Gruzvill Driver 1',
    login: 'gmailgtest1@gmail.com',
    password: '12345678',
    type: 'e-mail',
    location: { latitude: 47.221, longitude: 39.633 },
    priceDelta: [-40, 20],
    etaOptions: ['Буду через 5 минут', 'Буду через 8 минут', 'Буду через 10 минут'],
    commentOptions: ['Еду напрямую', 'Свободен рядом', 'Могу быстро подъехать'],
  },
  {
    name: 'Gruzvill Driver 2',
    login: 'gmailgtest2@gmail.com',
    password: '12345678',
    type: 'e-mail',
    location: { latitude: 47.22235, longitude: 39.6352 },
    priceDelta: [-20, 45],
    etaOptions: ['Буду через 10 минут', 'Буду через 12 минут', 'Буду через 15 минут'],
    commentOptions: ['Есть кондиционер', 'Еду без остановок', 'Могу забрать быстро'],
  },
  {
    name: 'Gruzvill Driver 3',
    login: 'gmailgtest3@gmail.com',
    password: '12345678',
    type: 'e-mail',
    location: { latitude: 47.21985, longitude: 39.6316 },
    priceDelta: [0, 70],
    etaOptions: ['Буду через 8 минут', 'Буду через 15 минут', 'Буду через 20 минут'],
    commentOptions: ['Большой багажник', 'Аккуратная поездка', 'Подъеду к точке'],
  },
  {
    name: 'Gruzvill Driver 4',
    login: 'gmailgtest4@gmail.com',
    password: '12345678',
    type: 'e-mail',
    location: { latitude: 47.2231, longitude: 39.6323 },
    priceDelta: [-60, 10],
    etaOptions: ['Буду через 12 минут', 'Буду через 20 минут', 'Буду через 25 минут'],
    commentOptions: ['Буду аккуратно', 'Знаю маршрут', 'Могу подождать'],
  },
]

const MANAGER = {
  enabled: true,
  login: 'ibucnev15@gmail.com',
  password: 'X7/m&33v0O',
  type: 'e-mail',
}

const DEFAULT_OFFER = {
  minPrice: 1,
  maxPrice: 999999,
  etaOptions: ['Буду через 5 минут', 'Буду через 8 минут', 'Буду через 10 минут', 'Буду через 12 минут', 'Буду через 15 минут', 'Буду через 20 минут'],
  commentOptions: ['Еду напрямую', 'Могу быстро подъехать', 'Есть кондиционер', 'Большой багажник', 'Буду аккуратно', 'Свободен рядом'],
}

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms))
const randInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))
const pick = <T,>(items: T[] | undefined, fallback: T): T => items && items.length ? items[randInt(0, items.length - 1)] : fallback
const toNumber = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object') return null
  const normalized = String(value).trim().replace(',', '.')
  const direct = Number(normalized)
  if (Number.isFinite(direct)) return direct
  const match = normalized.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}
const isTrueLike = (value: any) => {
  if (value === true) return true
  if (value === false || value === null || value === undefined || value === '') return false
  if (typeof value === 'number') return value === 1
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value).trim().toLowerCase())
}


function normalizeTestUserIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]

  return values.reduce<string[]>((result, item) => {
    String(item ?? '')
      .split(/[,\s;|]+/g)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => result.push(part))
    return result
  }, [])
}

function getConfiguredTestUserIds() {
  const data = (window as any).data || {}
  const siteConstants = data.site_constants || {}

  return normalizeTestUserIds([
    siteConstants.test_user_id?.value,
    siteConstants.test_user_ids?.value,
    data.test_user_id,
    data.test_user_ids,
  ])
}

function buildDriveNowEndpoint(includeClassFilters = true) {
  const filters = [
    includeClassFilters ? 'b_car_classes' : '',
    includeClassFilters ? 'b_location_classes' : '',
    getConfiguredTestUserIds().length ? 'test_user_id' : '',
  ].filter((filter): filter is string => Boolean(filter))

  return `/drive/now${filters.length ? `?${filters.map(filter => `filter=${encodeURIComponent(filter)}`).join('&')}` : ''}`
}

function toUrlEncoded(fields: any) {
  const params = new URLSearchParams()
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    params.append(key, String(value))
  })
  return params
}

async function parseResponse(response: Response, url: string) {
  const text = await response.text()
  let data: any = {}
  try { data = text ? JSON.parse(text) : {} } catch { data = { raw: text } }
  if (!response.ok) {
    const error: any = new Error(`HTTP ${response.status}: ${url}`)
    error.response = data
    throw error
  }
  return data
}

async function apiPost(endpoint: string, fields: any) {
  const url = `${API_BASE}${endpoint}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: toUrlEncoded(fields),
  })
  return parseResponse(response, url)
}

function normalizeErrorMessage(errorOrResponse: any) {
  if (!errorOrResponse) return ''
  return String(
    errorOrResponse?.message ||
    errorOrResponse?.response?.message ||
    errorOrResponse?.response?.error ||
    errorOrResponse?.error ||
    errorOrResponse?.data ||
    JSON.stringify(errorOrResponse),
  )
}

function isBackendError(response: any) {
  return response?.status === 'error' || String(response?.code || '') === '404'
}

function stringifyError(error: any) {
  const parts = [error?.message || String(error)]
  if (error?.response) parts.push(JSON.stringify(error.response))
  return parts.join(' | ')
}

async function loginSession(account: any, label = 'account'): Promise<Session> {
  const auth = await apiPost('/auth', {
    login: account.login,
    password: account.password,
    type: account.type || 'e-mail',
    au: 'f',
  })
  if (auth?.message === 'wrong login' || auth?.message === 'wrong password' || !auth?.auth_hash) {
    throw new Error(`${label}: auth failed: ${auth?.message || JSON.stringify(auth)}`)
  }
  const tokenResponse = await apiPost('/token', { auth_hash: auth.auth_hash })
  const token = tokenResponse?.data?.token
  const uHash = tokenResponse?.data?.u_hash
  if (!token || !uHash) throw new Error(`${label}: token failed`)
  return { token, u_hash: uHash, user: auth.auth_user || tokenResponse?.data?.user || null }
}

function authFields(bot: BotState, extra: any = {}) {
  return { token: bot.session?.token, u_hash: bot.session?.u_hash, ...extra }
}

function normalizeOrders(response: any): any[] {
  const booking = response?.data?.booking ?? response?.booking ?? response?.data?.orders ?? response?.orders ?? []
  if (Array.isArray(booking)) return booking
  if (booking && typeof booking === 'object') return Object.values(booking)
  return []
}

function parseMaybeJson(value: any): any {
  if (value === null || value === undefined) return value
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text) return value
  try { return JSON.parse(text) } catch { return value }
}

function getObjectValue(source: any, path: string) {
  if (!source || !path) return undefined
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path]
  return path.split('.').reduce((acc: any, key) => acc && typeof acc === 'object' ? acc[key] : undefined, source)
}

function normalizePointFromValues(latitude: any, longitude: any): Point | null {
  const lat = toNumber(latitude)
  const lon = toNumber(longitude)
  if (lat === null || lon === null) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)) }
}

function normalizePoint(value: any): Point | null {
  const parsed = parseMaybeJson(value)
  if (!parsed || typeof parsed !== 'object') return null
  return normalizePointFromValues(
    parsed.latitude ?? parsed.lat ?? parsed.b_latitude ?? parsed.b_start_latitude,
    parsed.longitude ?? parsed.lng ?? parsed.lon ?? parsed.b_longitude ?? parsed.b_start_longitude,
  )
}

function collectContainers(order: any): any[] {
  const result: any[] = []
  const walk = (value: any, depth: number) => {
    const parsed = parseMaybeJson(value)
    if (!parsed || typeof parsed !== 'object' || depth > 3) return
    result.push(parsed)
    ;['data', 'booking', 'order', 'route', 'points', 'b_options'].forEach(key => {
      const child = (parsed as any)[key]
      if (Array.isArray(child)) child.forEach(item => walk(item, depth + 1))
      else walk(child, depth + 1)
    })
  }
  walk(order, 0)
  return result
}

function getPointFromOrder(order: any, kind: 'start' | 'destination'): Point | null {
  const destination = kind === 'destination'
  const latKeys = destination ? ['b_destination_latitude', 'b_destination_lat', 'destination_latitude', 'to_latitude', 'to_lat', 'dest_lat', 'destination.lat', 'to.lat'] : ['b_start_latitude', 'b_start_lat', 'start_latitude', 'from_latitude', 'from_lat', 'pickup_latitude', 'b_latitude', 'start.lat', 'from.lat']
  const lonKeys = destination ? ['b_destination_longitude', 'b_destination_lng', 'b_destination_lon', 'destination_longitude', 'to_longitude', 'to_lng', 'to_lon', 'dest_lng', 'dest_lon', 'destination.lng', 'destination.lon', 'to.lng', 'to.lon'] : ['b_start_longitude', 'b_start_lng', 'b_start_lon', 'start_longitude', 'from_longitude', 'from_lng', 'from_lon', 'pickup_longitude', 'b_longitude', 'start.lng', 'start.lon', 'from.lng', 'from.lon']
  const nestedKeys = destination ? ['destination', 'b_destination', 'to', 'finish', 'end', 'dropoff'] : ['start', 'b_start', 'from', 'pickup', 'source', 'origin']
  for (const container of collectContainers(order)) {
    for (const latKey of latKeys) {
      const latitude = getObjectValue(container, latKey)
      if (latitude === undefined) continue
      for (const lonKey of lonKeys) {
        const longitude = getObjectValue(container, lonKey)
        const point = normalizePointFromValues(latitude, longitude)
        if (point) return point
      }
    }
    for (const nestedKey of nestedKeys) {
      const point = normalizePoint(getObjectValue(container, nestedKey))
      if (point) return point
    }
  }
  return null
}

function normalizeOptions(order: any) {
  const options = parseMaybeJson(order?.b_options)
  return options && typeof options === 'object' ? options : {}
}

function getOrderId(order: any) {
  return String(order?.b_id ?? order?.id ?? order?.booking_id ?? '')
}

function getDesiredPrice(order: any, fallback = 300) {
  const options = normalizeOptions(order)
  const raw = options.customer_price ?? options.customerPrice ?? options.desired_price ?? options.performers_price ?? order?.b_customer_price ?? order?.b_price ?? order?.price
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function stringifyOrder(order: any) {
  const options = normalizeOptions(order)
  return [JSON.stringify(order), JSON.stringify(options), options.order_mode, options.offer_mode, order?.order_mode, order?.b_order_mode, order?.b_type].filter(Boolean).join(' ').toLowerCase()
}

function hasDestination(order: any) {
  const options = normalizeOptions(order)
  return Boolean(order?.b_destination_address || order?.b_destination_latitude || options.toShortAddress || options.toAddress || getPointFromOrder(order, 'destination'))
}

function isOfferOrder(order: any) {
  const raw = stringifyOrder(order)
  const options = normalizeOptions(order)
  return raw.includes('offer') || raw.includes('intercity') || raw.includes('предлож') || String(order?.b_cars_count) === '0' || options.order_mode === 'OFFER'
}

function isVotingOrder(order: any) {
  const raw = stringifyOrder(order)
  const options = normalizeOptions(order)
  const services = JSON.stringify(order?.b_services ?? '').toLowerCase()
  return isTrueLike(order?.b_voting) || isTrueLike(options?.b_voting) || isTrueLike(options?.voting) || raw.includes('voting') || raw.includes('голос') || services.includes('voting')
}

function isChoiceOrder(order: any) {
  const storedMode = getStoredChoiceOrderMode(getOrderId(order) as any)

  if (storedMode === 'offer' || storedMode === 'voting')
    return true

  if (storedMode === 'order')
    return false

  // A destination address alone does not make an order a voting/offer flow.
  // Ordinary/simple orders also have destination points and must be taken directly.
  // The passenger-created mode in localStorage is the source of truth for offer/voting,
  // because some backend active-order responses lose b_cars_count/b_options markers.
  return isOfferOrder(order) || isVotingOrder(order)
}

function getRawDriverState(driver: any, order: any = null) {
  return toNumber(driver?.c_state ?? driver?.state ?? driver?.booking_driver_state ?? driver?.driver_state ?? order?.c_state ?? order?.driver_state ?? order?.b_driver_state)
}

function findDriverRecord(order: any, carId: any, userId: any) {
  const drivers = Array.isArray(order?.drivers) ? order.drivers : []
  return drivers.find((item: any) => carId && String(item?.c_id || item?.car_id || '') === String(carId)) ||
    drivers.find((item: any) => userId && String(item?.u_id || item?.user_id || '') === String(userId)) || null
}

function getDriverState(order: any, bot: BotState) {
  const record = findDriverRecord(order, bot.car?.c_id, bot.user?.u_id)
  return record ? getRawDriverState(record, order) : null
}

function isAssignedState(state: any) {
  return [DRIVER_STATES.PERFORMER, DRIVER_STATES.ARRIVED, DRIVER_STATES.STARTED].includes(Number(state))
}

function isClosedState(state: any) {
  return [DRIVER_STATES.CANCELED, DRIVER_STATES.FINISHED].includes(Number(state))
}

function isWaitingState(state: any) {
  return !isAssignedState(state) && !isClosedState(state) && Number(state) !== DRIVER_STATES.FINISHED
}

function hasWaitingCompetitors(order: any, bot: BotState) {
  if (!isChoiceOrder(order)) return false
  const drivers = Array.isArray(order?.drivers) ? order.drivers : []
  return drivers.some((driver: any) => {
    const own = (bot.car?.c_id && String(driver?.c_id) === String(bot.car.c_id)) || (bot.user?.u_id && String(driver?.u_id) === String(bot.user.u_id))
    return !own && isWaitingState(getRawDriverState(driver, order))
  })
}

function isBackendChosenDriver(order: any, bot: BotState) {
  if (!isChoiceOrder(order)) return true

  const drivers = Array.isArray(order?.drivers) ? order.drivers : []
  const assignedDrivers = drivers.filter((driver: any) => isAssignedState(getRawDriverState(driver, order)))
  if (assignedDrivers.length !== 1) return false

  const [assigned] = assignedDrivers
  return Boolean(
    (bot.car?.c_id && String(assigned?.c_id || assigned?.car_id || '') === String(bot.car.c_id)) ||
    (bot.user?.u_id && String(assigned?.u_id || assigned?.user_id || '') === String(bot.user.u_id)),
  )
}

function isAlreadyHandled(order: any, bot: BotState) {
  const state = getDriverState(order, bot)
  return Number(state) === DRIVER_STATES.CONSIDERING || isAssignedState(state) || Number(state) === DRIVER_STATES.FINISHED
}

function getUserCheckState(user: any) {
  const value = user?.u_check_state ?? user?.check_state ?? user?.u_check ?? user?.check
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : String(value).trim().toLowerCase()
}

function getCarCheckState(car: any) {
  const value = car?.c_check_state ?? car?.check_state ?? car?.c_check ?? car?.check ?? car?.state ?? car?.status
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : String(value).trim().toLowerCase()
}

function isApproved(value: any) {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'number') return value === 2
  return ['2', 'active', 'approved', 'accepted', 'verified', 'success'].includes(String(value).trim().toLowerCase())
}

function toRadians(value: number) { return value * Math.PI / 180 }
function toDegrees(value: number) { return value * 180 / Math.PI }
function distanceMeters(from: Point, to: Point) {
  const lat1 = toRadians(from.latitude)
  const lat2 = toRadians(to.latitude)
  const deltaLat = toRadians(to.latitude - from.latitude)
  const deltaLon = toRadians(to.longitude - from.longitude)
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return 6371000 * c
}

function movePointToward(from: Point, to: Point, maxMeters: number): Point {
  const distance = distanceMeters(from, to)
  if (!Number.isFinite(distance) || distance <= maxMeters) return { ...to }
  const lat1 = toRadians(from.latitude)
  const lon1 = toRadians(from.longitude)
  const lat2 = toRadians(to.latitude)
  const lon2 = toRadians(to.longitude)
  const bearing = Math.atan2(
    Math.sin(lon2 - lon1) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1),
  )
  const angularDistance = maxMeters / 6371000
  const nextLat = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing))
  const nextLon = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(nextLat))
  return { latitude: Number(toDegrees(nextLat).toFixed(6)), longitude: Number(toDegrees(nextLon).toFixed(6)) }
}


function pointCacheKey(point: Point): string {
  return [Number(point.latitude).toFixed(6), Number(point.longitude).toFixed(6)].join(',')
}

function routeCacheKey(from: Point, to: Point): string {
  return `${pointCacheKey(from)}>${pointCacheKey(to)}`
}

function normalizeRoutePoint(value: any): Point | null {
  if (Array.isArray(value) && value.length >= 2)
    return normalizePointFromValues(value[0], value[1])
  if (value && typeof value === 'object')
    return normalizePointFromValues(value.latitude ?? value.lat, value.longitude ?? value.lng ?? value.lon)
  return null
}

function readCachedRoutePoints(from: Point, to: Point): Point[] | null {
  try {
    const cache = JSON.parse(window.localStorage.getItem(ROUTE_CACHE_STORAGE_KEY) || '{}')
    const cached = cache[routeCacheKey(from, to)]
    const points = Array.isArray(cached?.points) ? cached.points.map(normalizeRoutePoint).filter(Boolean) as Point[] : []
    return points.length > 1 ? points : null
  } catch {
    return null
  }
}

function writeCachedRoutePoints(from: Point, to: Point, points: Point[]) {
  if (!points.length) return
  try {
    const cache = JSON.parse(window.localStorage.getItem(ROUTE_CACHE_STORAGE_KEY) || '{}')
    cache[routeCacheKey(from, to)] = {
      distance: parseFloat((routeDistanceMeters(points) / 1000).toFixed(2)),
      time: { hours: 0, minutes: Math.max(1, Math.round(routeDistanceMeters(points) / 1000 / DEMO_DRIVER_SPEED_KMH * 60)) },
      points: points.map(point => [point.latitude, point.longitude]),
    }
    window.localStorage.setItem(ROUTE_CACHE_STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // cache is optional
  }
}

function routeDistanceMeters(points: Point[]) {
  return points.reduce((sum, point, index) => index === 0 ? 0 : sum + distanceMeters(points[index - 1], point), 0)
}

function interpolateRoutePoint(from: Point, to: Point, progress: number): Point {
  const t = Math.max(0, Math.min(1, progress))
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
  }
}

function densifyRoutePoints(points: Point[], maxStepMeters = ROUTE_DENSIFY_STEP_METERS): Point[] {
  const safe = points.filter(Boolean)
  if (safe.length < 2) return safe

  const result: Point[] = [safe[0]]
  for (let i = 1; i < safe.length; i += 1) {
    const from = result[result.length - 1]
    const to = safe[i]
    const distance = distanceMeters(from, to)
    if (!Number.isFinite(distance) || distance < .25) continue

    const steps = Math.max(1, Math.ceil(distance / maxStepMeters))
    for (let step = 1; step <= steps; step += 1)
      result.push(interpolateRoutePoint(from, to, step / steps))
  }

  return result
}

function findNearestRouteIndex(route: Point[], current: Point, preferredIndex: number) {
  if (route.length < 2) return 1

  const safePreferred = Math.max(1, Math.min(preferredIndex || 1, route.length - 1))
  const start = safePreferred
  const end = Math.max(start, Math.min(safePreferred + 80, route.length - 1))
  let bestIndex = safePreferred
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = start; index <= end; index += 1) {
    const distance = distanceMeters(current, route[index])
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  // The simulator must never jump back to a previous polyline point. The old search
  // window looked several points behind the current index, so on bends the bot could
  // rotate back, stop, and then continue forward again. Keep progress monotonic.
  return bestDistance > 45 ? safePreferred : Math.max(bestIndex, safePreferred)
}

function ensureRouteEndpoints(points: Point[], from: Point, to: Point): Point[] {
  const route = points.filter(Boolean)
  if (!route.length) return densifyRoutePoints([from, to])
  if (distanceMeters(route[0], from) > 8) route.unshift(from)
  if (distanceMeters(route[route.length - 1], to) > 8) route.push(to)
  return densifyRoutePoints(route)
}

function buildSoftFallbackRoute(from: Point, to: Point): Point[] {
  const directDistance = Math.max(1, distanceMeters(from, to))
  const steps = Math.max(18, Math.min(90, Math.round(directDistance / 90)))
  const latDelta = to.latitude - from.latitude
  const lonDelta = to.longitude - from.longitude
  const side = Math.random() > .5 ? 1 : -1
  const offset = Math.min(0.006, Math.max(0.0012, directDistance / 111320 * .18)) * side
  const points: Point[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const curve = Math.sin(Math.PI * t) * offset
    points.push({
      latitude: Number((from.latitude + latDelta * t + curve * .45).toFixed(6)),
      longitude: Number((from.longitude + lonDelta * t - curve).toFixed(6)),
    })
  }
  return ensureRouteEndpoints(points, from, to)
}

async function fetchOsrmRoutePoints(from: Point, to: Point): Promise<Point[] | null> {
  const url = [
    'https://router.project-osrm.org/route/v1/driving/',
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`,
    '?overview=full&geometries=geojson',
  ].join('')
  const response = await fetch(url)
  if (!response.ok) return null
  const data = await response.json()
  const coordinates = data?.routes?.[0]?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null
  const points = coordinates
    .map((item: any) => Array.isArray(item) && item.length >= 2 ? normalizePointFromValues(item[1], item[0]) : null)
    .filter(Boolean) as Point[]
  return points.length > 1 ? ensureRouteEndpoints(points, from, to) : null
}

async function makeDemoRoutePoints(from: Point, to: Point): Promise<Point[]> {
  const cached = readCachedRoutePoints(from, to)
  if (cached) return ensureRouteEndpoints(cached, from, to)
  try {
    const osrm = await fetchOsrmRoutePoints(from, to)
    if (osrm?.length) {
      writeCachedRoutePoints(from, to, osrm)
      return osrm
    }
  } catch {
    // external route service is optional in demo mode
  }
  return buildSoftFallbackRoute(from, to)
}

function moveAlongRoute(current: Point, route: Point[], maxMeters: number, startIndex = 1) {
  const safeRoute = route.length > 1 ? densifyRoutePoints(route) : [current]
  let point = current
  let index = findNearestRouteIndex(safeRoute, current, Math.max(1, Math.min(startIndex || 1, safeRoute.length - 1)))
  let remaining = Math.max(.5, maxMeters)

  while (index < safeRoute.length && remaining > 0) {
    const target = safeRoute[index]
    const distance = distanceMeters(point, target)
    if (!Number.isFinite(distance)) break
    if (distance <= remaining) {
      point = target
      remaining -= distance
      index += 1
      continue
    }
    point = movePointToward(point, target, remaining)
    remaining = 0
  }

  const done = index >= safeRoute.length || distanceMeters(point, safeRoute[safeRoute.length - 1]) <= ROUTE_FINISH_THRESHOLD_METERS
  return {
    point: done ? safeRoute[safeRoute.length - 1] : point,
    index,
    done,
  }
}

function keepBeforeTarget(from: Point, target: Point, holdMeters = HOLD_BEFORE_PICKUP_METERS): Point {
  const distance = distanceMeters(from, target)
  if (!Number.isFinite(distance) || distance < .5) return from
  if (distance <= holdMeters) return from
  return movePointToward(target, from, holdMeters)
}

function distanceToRouteMeters(route: Point[], point: Point) {
  if (!route.length)
    return Number.POSITIVE_INFINITY

  return route.reduce((min, routePoint) => {
    const distance = distanceMeters(routePoint, point)
    return Number.isFinite(distance) && distance < min ? distance : min
  }, Number.POSITIVE_INFINITY)
}

function stepMetersForDemo(lastMovedAt: number | undefined, now: number) {
  const elapsedMs = lastMovedAt ? Math.max(POLL_INTERVAL_MS, now - lastMovedAt) : POLL_INTERVAL_MS
  return Math.max(25, Math.min(140, DEMO_DRIVER_SPEED_MPS * elapsedMs / 1000))
}

function stepMetersForPickup(lastMovedAt: number | undefined, now: number, current: Point, pickup: Point) {
  const step = stepMetersForDemo(lastMovedAt, now)
  const distanceToPickup = distanceMeters(current, pickup)

  if (!Number.isFinite(distanceToPickup))
    return step

  if (distanceToPickup <= 12)
    return Math.min(step, 5)

  if (distanceToPickup <= 30)
    return Math.min(step, 10)

  if (distanceToPickup <= HOLD_BEFORE_PICKUP_METERS + 25)
    return Math.min(step, 18)

  return step
}

function randomPointAround(center: Point, minMeters = 2800, maxMeters = 6500): Point {
  const radius = minMeters + Math.random() * (maxMeters - minMeters)
  const angle = Math.random() * Math.PI * 2
  return {
    latitude: Number((center.latitude + (Math.cos(angle) * radius) / 111320).toFixed(6)),
    longitude: Number((center.longitude + (Math.sin(angle) * radius) / (111320 * Math.cos(center.latitude * Math.PI / 180))).toFixed(6)),
  }
}

function getFallbackPoint(kind: 'start' | 'destination') {
  return kind === 'destination' ? { latitude: 47.2239, longitude: 39.6366 } : { latitude: 47.2216, longitude: 39.6343 }
}

function getOfferForDriver(driver: any, order: any) {
  const basePrice = getDesiredPrice(order, 300)
  const delta = driver.priceDelta || [0, 0]
  const rawPrice = basePrice + randInt(delta[0], delta[1])
  const price = Math.max(DEFAULT_OFFER.minPrice, Math.min(DEFAULT_OFFER.maxPrice, rawPrice))
  return {
    price,
    eta: pick(driver.etaOptions, pick(DEFAULT_OFFER.etaOptions, 'Буду через 10 минут')),
    comment: pick(driver.commentOptions, pick(DEFAULT_OFFER.commentOptions, 'Еду напрямую')),
  }
}

function getCurrentCarClassId(car: any) {
  return car?.cc_id ?? car?.c_class_id ?? car?.car_class_id ?? car?.c_car_class_id ?? car?.class_id ?? null
}

function getOrderRequiredClassId(order: any) {
  const options = normalizeOptions(order)
  return order?.b_car_class ?? order?.b_car_class_id ?? order?.car_class_id ?? order?.cc_id ?? options.b_car_class ?? options.b_car_class_id ?? options.cc_id ?? '1'
}

function getEditableCarPayload(car: any, targetClassId: any) {
  const payload: any = { cc_id: String(targetClassId) }
  ;['cm_id', 'seats', 'registration_plate', 'color', 'photo', 'details'].forEach(key => {
    if (car?.[key] !== undefined && car?.[key] !== null && car?.[key] !== '') payload[key] = car[key]
  })
  return payload
}

function isWrongCarClass(errorOrResponse: any) {
  const text = normalizeErrorMessage(errorOrResponse).toLowerCase()
  return text.includes('driver car has wrong class') || (text.includes('car class') && text.includes('wrong'))
}

function hasWrongCOptionsKeys(errorOrResponse: any) {
  return normalizeErrorMessage(errorOrResponse).toLowerCase().includes('wrong c_options keys')
}

export class BrowserDriverEmulator {
  private logs: string[] = []
  private running = false
  private bots: BotState[] = []
  private timer: number | null = null
  private initPromise: Promise<void> | null = null
  private managerSession: Promise<Session | null> | null = null
  private busy = false
  private emitTimer: number | null = null
  private localChoices = new Map<string, string>()
  private localCanceledChoices = new Map<string, Set<string>>()
  private choiceListener = ((event: Event) => {
    const detail = (event as CustomEvent).detail || {}
    const orderId = String(detail.orderId || '')
    const userId = String(detail.userId || '')
    if (orderId && userId) {
      this.localChoices.set(orderId, userId)
      this.localCanceledChoices.get(orderId)?.delete(userId)
      if (this.running) {
        window.setTimeout(() => { this.tick() }, 50)
        window.setTimeout(() => { this.tick() }, 450)
      }
      this.log(`order ${orderId}: пассажир выбрал водителя ${userId}`)
    }
  }) as EventListener

  private choiceCancelListener = ((event: Event) => {
    const detail = (event as CustomEvent).detail || {}
    const orderId = String(detail.orderId || '')
    const userId = String(detail.userId || '')
    if (!orderId)
      return

    const currentChoice = this.localChoices.get(orderId)
    if (!userId || !currentChoice || currentChoice === userId) {
      this.localChoices.delete(orderId)
      if (userId) {
        const canceled = this.localCanceledChoices.get(orderId) || new Set<string>()
        canceled.add(userId)
        this.localCanceledChoices.set(orderId, canceled)
      }

      this.bots.forEach(bot => {
        const matchesUser = userId && (String(bot.user?.u_id || '') === userId || String(bot.car?.c_id || '') === userId)
        if (!userId || matchesUser) {
          bot.tripState.delete(orderId)
        } else {
          // The selected driver was rejected, but the order keeps searching.
          // Let the other emulator drivers answer this same order again after
          // passenger-side release clears old backend candidates.
          bot.handled.delete(orderId)
          bot.responseSentAt.delete(orderId)
          bot.waitLogged.delete(orderId)
          bot.blockedLogged.delete(orderId)
          bot.blockedLogged.delete(`${orderId}:canceled`)
          bot.tripState.delete(orderId)
        }
      })

      if (this.running) {
        window.setTimeout(() => { this.tick() }, 250)
      }

      this.log(`order ${orderId}: пассажир отменил выбранного водителя${userId ? ` ${userId}` : ''}`)
    }
  }) as EventListener

  private lastWakeTickAt = 0
  private wakeListener = (() => {
    if (!this.running) return
    this.ensureTimer()
    const now = Date.now()
    if (now - this.lastWakeTickAt < 2500) return
    this.lastWakeTickAt = now
    window.setTimeout(() => { this.tick() }, 80)
  }) as EventListener

  constructor(private options: BrowserEmulatorOptions) {
    if (typeof window !== 'undefined') {
      window.addEventListener('driver-emulator-choice', this.choiceListener)
      window.addEventListener('passengerConfirmedDriverChoice', this.choiceListener)
      window.addEventListener('driver-emulator-choice-cancel', this.choiceCancelListener)
      window.addEventListener('passengerCanceledDriverChoice', this.choiceCancelListener)
    }
  }

  snapshot(): BrowserEmulatorSnapshot {
    return { running: this.running, logs: this.logs }
  }

  private emit() {
    if (this.emitTimer !== null) return
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = null
      this.options.onUpdate(this.snapshot())
    }, 160)
  }

  private emitNow() {
    if (this.emitTimer !== null) {
      window.clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    this.options.onUpdate(this.snapshot())
  }

  private log(message: string) {
    const time = new Date().toLocaleTimeString()
    this.logs = [...this.logs, `[${time}] ${message}`].slice(-300)
    writeRawLog('DRIVER_EMULATOR_LOG', {
      source: 'browser-driver-emulator',
      screen: 'DriverEmulatorPanel',
      uiState: this.running ? 'running' : 'stopped',
      message,
      running: this.running,
    })
    this.emit()
  }

  private ensureTimer() {
    if (this.timer !== null) return
    this.timer = window.setInterval(() => { this.tick() }, POLL_INTERVAL_MS)
  }

  private attachWakeListeners() {
    if (typeof window === 'undefined') return
    window.addEventListener('focus', this.wakeListener)
    window.addEventListener('online', this.wakeListener)
    document.addEventListener('visibilitychange', this.wakeListener)
  }

  private detachWakeListeners() {
    if (typeof window === 'undefined') return
    window.removeEventListener('focus', this.wakeListener)
    window.removeEventListener('online', this.wakeListener)
    document.removeEventListener('visibilitychange', this.wakeListener)
  }

  async check() {
    this.log('Проверяю водителей прямо в браузере, без localhost...')
    await this.initBots()
    const ready = this.bots.filter(bot => !bot.disabled && bot.session && bot.car).length
    this.log(`Готово водителей: ${ready}/${this.bots.length}`)
  }

  async start() {
    if (this.running) return
    this.running = true
    this.emitNow()
    setBrowserEmulatorRunning('drivers', true)
    this.log('Эмулятор запущен в браузере. Локальная panel.bat больше не нужна.')
    await this.initBots()
    await this.tick()
    this.ensureTimer()
    this.attachWakeListeners()
  }

  stop() {
    this.running = false
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.detachWakeListeners()
    setBrowserEmulatorRunning('drivers', false)
    clearBrowserEmulatorOrderIds('drivers')
    clearEmulatedDriverLocations()
    this.log('Эмулятор остановлен, тестовые заказы скрыты')
    this.emitNow()
  }

  private async initBots() {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.initBotsInner().catch(error => {
      this.initPromise = null
      throw error
    })
    return this.initPromise
  }

  private async initBotsInner() {
    if (this.bots.length) return
    this.bots = DRIVERS.map((driver, index) => ({
      driver,
      index,
      name: driver.name || driver.login,
      handled: new Set<string>(),
      waitLogged: new Set<string>(),
      blockedLogged: new Set<string>(),
      responseSentAt: new Map<string, number>(),
      tripState: new Map<string, any>(),
      spawnLocations: new Map<string, Point>(),
      currentLocation: driver.location,
    }))

    await promiseAllSettled(this.bots.map(bot => this.initBot(bot)))
  }

  private async initBot(bot: BotState) {
    try {
      bot.session = await loginSession(bot.driver, bot.name)
      bot.user = bot.session.user
      await this.loadAuthorizedUser(bot).catch(() => null)
      await this.loadCar(bot)
      await this.tryManagerApprove(bot).catch(error => this.log(`[${bot.name}] approval skipped: ${stringifyError(error)}`))
      await this.loadAuthorizedUser(bot).catch(() => null)
      await this.loadCar(bot).catch(() => null)
      const userState = getUserCheckState(bot.user)
      const carState = getCarCheckState(bot.car)
      if (!isApproved(userState) || (carState !== null && !isApproved(carState))) {
        this.log(`[${bot.name}] внимание: подтверждение не видно (user=${userState ?? 'unknown'}, car=${carState ?? 'unknown'}), пробую всё равно`)
      }
      await this.activateCar(bot)
      await this.setOnline(bot)
      await this.sendLocation(bot, bot.currentLocation || bot.driver.location)
      saveEmulatedDriverIdentity({
        userId: bot.user?.u_id,
        carId: bot.car?.c_id,
        login: bot.driver.login,
        name: bot.name,
      })
      this.log(`[${bot.name}] готов, user=${bot.user?.u_id || '?'}, car=${bot.car?.c_id || '?'}, class=${getCurrentCarClassId(bot.car) || '?'}`)
    } catch (error) {
      bot.disabled = true
      this.log(`[${bot.name}] не готов: ${stringifyError(error)}`)
    }
  }

  private async getManagerSession() {
    if (!MANAGER.enabled) return null
    if (!this.managerSession) {
      this.managerSession = loginSession(MANAGER, 'manager').catch(error => {
        this.log(`[manager] вход не удался: ${stringifyError(error)}`)
        return null
      })
    }
    return this.managerSession
  }

  private async tryManagerApprove(bot: BotState) {
    const manager = await this.getManagerSession()
    if (!manager || !bot.user?.u_id) return
    const userPayloads = [{ u_check_state: 2, u_active: 1 }, { check_state: 2, u_active: 1 }]
    for (const data of userPayloads) {
      await apiPost('/user', { token: manager.token, u_hash: manager.u_hash, u_id: bot.user.u_id, data: JSON.stringify(data) }).catch(() => null)
    }
    if (bot.car?.c_id) {
      const carPayloads = [{ c_check_state: 2 }, { check_state: 2 }]
      for (const data of carPayloads) {
        await apiPost(`/car/${bot.car.c_id}`, { token: manager.token, u_hash: manager.u_hash, data: JSON.stringify(data) }).catch(() => null)
      }
    }
  }

  private async loadAuthorizedUser(bot: BotState) {
    const response = await apiPost('/user/authorized', authFields(bot, { array_type: 'list' }))
    const users = response?.data?.user ?? response?.user
    if (Array.isArray(users)) bot.user = users[0] || bot.user
    else if (users && typeof users === 'object') bot.user = Object.values(users)[0] || bot.user
  }

  private async loadCar(bot: BotState) {
    const userId = bot.user?.u_id
    if (!userId) throw new Error('user id is empty')
    const response = await apiPost(`/user/${userId}/car`, authFields(bot, { array_type: 'list' }))
    const cars = response?.data?.car
    bot.car = Array.isArray(cars) ? cars[0] : (cars && Object.values(cars)[0])
    if (!bot.car) throw new Error('машина не найдена')
  }

  private async activateCar(bot: BotState) {
    if (!bot.car?.c_id) return
    const response = await apiPost(`/car/${bot.car.c_id}/drive`, authFields(bot, {}))
    if (isBackendError(response) && normalizeErrorMessage(response) !== 'car is already driven by this user') {
      this.log(`[${bot.name}] car drive skipped: ${normalizeErrorMessage(response)}`)
    }
  }

  private async setOnline(bot: BotState) {
    const response = await apiPost('/user', authFields(bot, { data: JSON.stringify({ u_active: 1 }) }))
    if (isBackendError(response) && normalizeErrorMessage(response) !== 'user or modified data not found') {
      this.log(`[${bot.name}] online skipped: ${normalizeErrorMessage(response)}`)
    }
  }

  private async sendLocation(bot: BotState, location?: Point | null, moving = false) {
    const point = location || bot.currentLocation || bot.driver.location
    if (!point) return

    bot.currentLocation = point
    saveEmulatedDriverLocation({
      userId: bot.user?.u_id,
      carId: bot.car?.c_id,
      login: bot.driver?.login,
      name: bot.name,
    }, point)

    const now = Date.now()
    const shouldSendRemote = !moving || !bot.lastLocationAttemptAt || now - bot.lastLocationAttemptAt >= REMOTE_LOCATION_INTERVAL_MS
    if (!shouldSendRemote)
      return

    bot.lastLocationAttemptAt = now
    try {
      const response = await apiPost('/location', authFields(bot, point))
      if (isBackendError(response)) {
        if (!bot.lastLocationErrorLoggedAt || now - bot.lastLocationErrorLoggedAt >= LOCATION_ERROR_LOG_INTERVAL_MS) {
          bot.lastLocationErrorLoggedAt = now
          this.log(`[${bot.name}] location skipped: ${normalizeErrorMessage(response)}`)
        }
        return
      }
      bot.lastLocationSentAt = now
      this.log(`[${bot.name}] ${moving ? 'moving ' : ''}location: ${point.latitude},${point.longitude}`)
    } catch (error) {
      if (!bot.lastLocationErrorLoggedAt || now - bot.lastLocationErrorLoggedAt >= LOCATION_ERROR_LOG_INTERVAL_MS) {
        bot.lastLocationErrorLoggedAt = now
        this.log(`[${bot.name}] location network skipped: ${stringifyError(error)}`)
      }
    }
  }

  private async getReadyOrders(bot: BotState) {
    const now = Date.now()
    if (bot.readyCache && bot.lastReadyFetchedAt && now - bot.lastReadyFetchedAt < READY_ORDERS_CACHE_MS)
      return bot.readyCache

    const main = await apiPost(buildDriveNowEndpoint(true), authFields(bot, { array_type: 'list' }))
    const mainOrders = normalizeOrders(main)
    if (mainOrders.length) {
      bot.readyCache = mainOrders
      bot.lastReadyFetchedAt = now
      return mainOrders
    }
    const fallback = await apiPost(buildDriveNowEndpoint(false), authFields(bot, { array_type: 'list' }))
    const fallbackOrders = normalizeOrders(fallback)
    bot.readyCache = fallbackOrders
    bot.lastReadyFetchedAt = now
    return fallbackOrders
  }

  private async getActiveOrders(bot: BotState) {
    const now = Date.now()
    if (bot.activeCache && bot.lastActiveFetchedAt && now - bot.lastActiveFetchedAt < ACTIVE_ORDERS_CACHE_MS)
      return bot.activeCache

    const response = await apiPost('/drive?fields=00000000u1', authFields(bot, { array_type: 'list' }))
    const orders = normalizeOrders(response)
    bot.activeCache = orders
    bot.lastActiveFetchedAt = now
    return orders
  }

  private async getOrderDetail(bot: BotState, orderId: string) {
    const response = await apiPost(`/drive/get/${orderId}?fields=00000000u1`, authFields(bot, { array_type: 'list' }))
    if (isBackendError(response)) return null
    const booking = response?.data?.booking ?? response?.booking
    if (Array.isArray(booking)) return booking.find((item: any) => String(getOrderId(item)) === String(orderId)) || booking[0] || null
    if (booking && typeof booking === 'object') return booking[orderId] || Object.values(booking)[0] || null
    return response?.data || null
  }

  private async setOrderAction(bot: BotState, orderId: string, action: string, extra: any = {}) {
    return apiPost(`/drive/get/${orderId}`, authFields(bot, { action, ...extra }))
  }

  private async updateCarClassForOrder(bot: BotState, order: any) {
    if (!bot.car?.c_id) return false
    const targetClassId = getOrderRequiredClassId(order)
    if (!targetClassId) return false
    const current = getCurrentCarClassId(bot.car)
    if (current && String(current) === String(targetClassId)) return true
    const payload = getEditableCarPayload(bot.car, targetClassId)
    const sessions: Array<{ label: string, session: Session }> = []
    const manager = await this.getManagerSession()
    if (manager) sessions.push({ label: 'manager', session: manager })
    if (bot.session) sessions.push({ label: 'driver', session: bot.session })
    for (const item of sessions) {
      try {
        const response = await apiPost(`/car/${bot.car.c_id}`, { token: item.session.token, u_hash: item.session.u_hash, data: JSON.stringify(payload) })
        if (!isBackendError(response)) {
          this.log(`[${bot.name}] class ${current || '?'} -> ${targetClassId} (${item.label})`)
          bot.car = {
            ...(bot.car || {}),
            cc_id: String(targetClassId),
            c_class_id: String(targetClassId),
            car_class_id: String(targetClassId),
          }
          await this.loadCar(bot).catch(() => null)
          await this.activateCar(bot).catch(() => null)
          return String(getCurrentCarClassId(bot.car)) === String(targetClassId)
        }
      } catch {
        // keep trying next session
      }
    }
    return false
  }

  private async ensureCarClassForOrder(bot: BotState, order: any) {
    const targetClassId = getOrderRequiredClassId(order)
    const current = getCurrentCarClassId(bot.car)

    if (!targetClassId || (current && String(current) === String(targetClassId)))
      return true

    const fixed = await this.updateCarClassForOrder(bot, order).catch(() => false)
    const after = getCurrentCarClassId(bot.car)

    if (fixed && after && String(after) === String(targetClassId))
      return true

    this.log(`[${bot.name}] order ${getOrderId(order)}: пропускаю отклик, класс машины ${after || current || '?'} не совпадает с заказом ${targetClassId}`)
    return false
  }

  private getSpawnLocation(bot: BotState, order: any) {
    const orderId = getOrderId(order)
    if (bot.spawnLocations.has(orderId)) return bot.spawnLocations.get(orderId) || null
    const center = getPointFromOrder(order, 'start') || getFallbackPoint('start')
    const point = randomPointAround(center, 900, 1800)
    bot.spawnLocations.set(orderId, point)
    return point
  }

  private getVisiblePickupStart(bot: BotState, order: any, pickup: Point) {
    const orderId = getOrderId(order)
    const existing = bot.spawnLocations.get(orderId)
    if (existing && distanceMeters(existing, pickup) > MIN_PICKUP_START_DISTANCE_METERS)
      return existing

    const point = randomPointAround(pickup, 900, 1500)
    bot.spawnLocations.set(orderId, point)
    return point
  }

  private async spawnNearOrder(bot: BotState, order: any) {
    const location = this.getSpawnLocation(bot, order)
    if (!location) return
    await this.sendLocation(bot, location)
    this.log(`[${bot.name}] order ${getOrderId(order)}: спавн дальше от точки подачи`)
  }

  private async sendResponse(bot: BotState, order: any, safe = false) {
    const orderId = getOrderId(order)
    const offer = getOfferForDriver(bot.driver, order)
    const data = safe ? {
      c_id: bot.car?.c_id,
      c_payment_way: 1,
      c_options: { performers_price: offer.price },
    } : {
      c_id: bot.car?.c_id,
      c_payment_way: 1,
      c_options: { performers_price: offer.price },
      c_pickup_time: offer.eta,
      c_arrival_time: offer.eta,
      c_comment: offer.comment,
      driver_offer_eta: offer.eta,
      driver_offer_comment: offer.comment,
    }
    const waitManual = isChoiceOrder(order)
    this.log(`[${bot.name}] order ${orderId}: ${waitManual ? 'отклик-кандидат' : 'прямой отклик'}; цена=${offer.price}; ${offer.eta}; ${offer.comment}`)
    return this.setOrderAction(bot, orderId, ACTIONS.SET_PERFORMER, {
      performer: waitManual ? '0' : '1',
      c_pickup_time: offer.eta,
      c_arrival_time: offer.eta,
      c_comment: offer.comment,
      data: JSON.stringify(data),
    })
  }

  private async reactToOrder(bot: BotState, rawOrder: any) {
    const orderId = getOrderId(rawOrder)
    if (!orderId || bot.handled.has(orderId) || isAlreadyHandled(rawOrder, bot)) return
    let order = rawOrder
    const detail = await this.getOrderDetail(bot, orderId).catch(() => null)
    if (detail) order = { ...rawOrder, ...detail }
    if (isAlreadyHandled(order, bot)) {
      bot.handled.add(orderId)
      return
    }
    bot.handled.add(orderId)
    const classReady = await this.ensureCarClassForOrder(bot, order)
    if (!classReady) {
      bot.handled.delete(orderId)
      return
    }
    await this.spawnNearOrder(bot, order).catch(() => null)
    await sleep(Math.max(3500, randInt(900, 2600)))
    try {
      const response = await this.sendResponse(bot, order, false)
      if (isBackendError(response)) {
        if (isWrongCarClass(response)) {
          this.log(`[${bot.name}] order ${orderId}: неверный класс машины, пробую исправить`)
          const fixed = await this.updateCarClassForOrder(bot, order)
          if (fixed) {
            const retry = await this.sendResponse(bot, order, true)
            if (!isBackendError(retry)) {
              bot.responseSentAt.set(orderId, Date.now())
              this.log(`[${bot.name}] order ${orderId}: отклик отправлен после исправления класса`)
              return
            }
          }
        }
        if (hasWrongCOptionsKeys(response)) {
          const safe = await this.sendResponse(bot, order, true)
          if (!isBackendError(safe)) {
            bot.responseSentAt.set(orderId, Date.now())
            this.log(`[${bot.name}] order ${orderId}: безопасный отклик отправлен`)
            return
          }
          this.log(`[${bot.name}] order ${orderId}: safe failed: ${normalizeErrorMessage(safe)}`)
        } else {
          this.log(`[${bot.name}] order ${orderId}: отклик не принят: ${normalizeErrorMessage(response)}`)
        }
        bot.handled.delete(orderId)
        return
      }
      bot.responseSentAt.set(orderId, Date.now())
      this.log(`[${bot.name}] order ${orderId}: отклик отправлен`)
    } catch (error) {
      this.log(`[${bot.name}] order ${orderId}: ошибка отклика: ${stringifyError(error)}`)
      bot.handled.delete(orderId)
    }
  }

  private isLocalChoiceForBot(orderId: string, bot: BotState) {
    const choice = this.localChoices.get(orderId) || getPassengerConfirmedChoice(orderId)
    if (!choice) return false
    return String(choice) === String(bot.user?.u_id) || String(choice) === String(bot.car?.c_id)
  }

  private isLocalCanceledChoiceForBot(orderId: string, bot: BotState) {
    const canceled = this.localCanceledChoices.get(orderId)
    if (!canceled?.size) return false
    return canceled.has(String(bot.user?.u_id || '')) || canceled.has(String(bot.car?.c_id || ''))
  }

  private async tryStartTrip(bot: BotState, order: any) {
    const orderId = getOrderId(order)
    const code = order?.b_driver_code ?? order?.driver_code ?? order?.code
    const payloads = isVotingOrder(order)
      ? [code ? { b_driver_code: code } : null, ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(item => ({ b_driver_code: item }))].filter(Boolean)
      : [{}, code ? { b_driver_code: code } : null].filter(Boolean)
    for (const payload of payloads) {
      const response = await this.setOrderAction(bot, orderId, ACTIONS.SET_START_STATE, payload)
      if (!isBackendError(response)) {
        this.log(`[${bot.name}] order ${orderId}: поездка началась`)
        return true
      }
    }
    return false
  }


  private mergeTripState(bot: BotState, orderId: string, patch: any) {
    bot.tripState.set(orderId, { ...(bot.tripState.get(orderId) || {}), ...patch })
  }

  private async getRouteForPhase(bot: BotState, orderId: string, phase: 'pickup' | 'destination', from: Point, to: Point) {
    const trip = bot.tripState.get(orderId) || {}
    const targetKey = pointCacheKey(to)
    const routeTargetKeyField = `${phase}RouteTargetKey`
    const routeKeyField = `${phase}RouteKey`
    const routeField = `${phase}Route`
    if (trip[routeTargetKeyField] === targetKey && Array.isArray(trip[routeField]) && trip[routeField].length > 1) {
      const savedRoute = densifyRoutePoints(trip[routeField] as Point[])
      // Reuse the road route while the driver is actually on it. If an old backend
      // coordinate or a previous order position is far away, rebuild once instead
      // of projecting the marker to a wrong cached line and making it jump.
      if (distanceToRouteMeters(savedRoute, from) < 650)
        return savedRoute
    }

    const route = await makeDemoRoutePoints(from, to)
    this.mergeTripState(bot, orderId, {
      [routeTargetKeyField]: targetKey,
      [routeKeyField]: routeCacheKey(from, to),
      [routeField]: route,
      [`${phase}RouteIndex`]: 1,
      [`${phase}MovedAt`]: undefined,
    })
    this.log(`[${bot.name}] order ${orderId}: маршрут ${phase === 'pickup' ? 'к клиенту' : 'до точки назначения'} построен, ${Math.round(routeDistanceMeters(route))} м`)
    return route
  }

  private async simulateActiveOrder(bot: BotState, rawOrder: any) {
    const orderId = getOrderId(rawOrder)
    if (!orderId) return
    let order = rawOrder
    const detail = await this.getOrderDetail(bot, orderId).catch(() => null)
    if (detail) order = { ...rawOrder, ...detail }
    const record = findDriverRecord(order, bot.car?.c_id, bot.user?.u_id)
    if (!record) return
    let state = getDriverState(order, bot)
    if (isClosedState(state)) {
      bot.tripState.delete(orderId)
      return
    }
    const locallyChosenForThisBot = this.isLocalChoiceForBot(orderId, bot)
    if (isChoiceOrder(order) && !locallyChosenForThisBot) {
      bot.tripState.delete(orderId)
      if (!bot.waitLogged.has(orderId)) {
        bot.waitLogged.add(orderId)
        this.log(`[${bot.name}] order ${orderId}: Р¶РґС‘С‚ РєРЅРѕРїРєСѓ В«Р’С‹Р±СЂР°С‚СЊВ», РґРѕ РІС‹Р±РѕСЂР° РЅРµ РµРґРµС‚`)
      }
      return
    }
    if (this.isLocalCanceledChoiceForBot(orderId, bot) && !locallyChosenForThisBot) {
      bot.tripState.delete(orderId)
      if (!bot.blockedLogged.has(`${orderId}:canceled`)) {
        bot.blockedLogged.add(`${orderId}:canceled`)
        this.log(`[${bot.name}] order ${orderId}: выбранный водитель отменён пассажиром, движение остановлено`)
      }
      return
    }

    if (isChoiceOrder(order) && !locallyChosenForThisBot) {
      // Offer/voting are candidate-choice flows. The backend can temporarily mark
      // the first responder as performer before the passenger clicks “Выбрать”.
      // For the embedded browser emulator the real click is the local event/storage
      // written by setPassengerConfirmedChoice(), so do not move before it.
      bot.tripState.delete(orderId)
      if (!bot.blockedLogged.has(`${orderId}:waiting-real-choice`)) {
        bot.blockedLogged.add(`${orderId}:waiting-real-choice`)
        this.log(`[${bot.name}] order ${orderId}: отклик отправлен, жду реальный выбор пассажира`)
      }
      return
    }

    if (!isAssignedState(state)) {
      if (locallyChosenForThisBot && isChoiceOrder(order)) {
        // Passenger choice is the source of truth for offer/voting UI.
        // Some backend builds keep the driver as candidate after a previous
        // chosen driver was cancelled, so the emulator must still continue.
        state = DRIVER_STATES.PERFORMER
      } else {
        if (!bot.waitLogged.has(orderId)) {
          bot.waitLogged.add(orderId)
          this.log(`[${bot.name}] order ${orderId}: ждёт выбора пассажиром`)
        }
        return
      }
    }
    const chosenForThisBot = locallyChosenForThisBot || isBackendChosenDriver(order, bot)
    if (hasWaitingCompetitors(order, bot) && !chosenForThisBot) {
      if (!bot.blockedLogged.has(orderId)) {
        bot.blockedLogged.add(orderId)
        this.log(`[${bot.name}] order ${orderId}: ещё есть другие кандидаты, не еду до выбора`)
      }
      return
    }

    const pickup = getPointFromOrder(order, 'start') || getFallbackPoint('start')
    const destination = getPointFromOrder(order, 'destination') || getFallbackPoint('destination')
    const trip = bot.tripState.get(orderId) || {}
    const now = Date.now()

    if (Number(state) < DRIVER_STATES.ARRIVED) {
      const freshTrip = bot.tripState.get(orderId) || trip
      let from = bot.currentLocation || bot.driver.location || pickup
      const pickupStartedAt = freshTrip.pickupStartedAt || now

      // If backend or stale browser storage already puts the driver on the pickup point,
      // keep a visible fast approach instead of immediately switching to "arrived".
      if (!freshTrip.pickupStartedAt && distanceMeters(from, pickup) < MIN_PICKUP_START_DISTANCE_METERS) {
        from = this.getVisiblePickupStart(bot, order, pickup)
        bot.currentLocation = from
        await this.sendLocation(bot, from, true)
        this.log(`[${bot.name}] order ${orderId}: показываю быстрый подъезд к точке подачи`)
      }

      const route = await this.getRouteForPhase(bot, orderId, 'pickup', from, pickup)
      const step = stepMetersForPickup(freshTrip.pickupMovedAt, now, from, pickup)
      const moved = moveAlongRoute(from, route, step, Number(freshTrip.pickupRouteIndex) || 1)
      const canArrive = now - pickupStartedAt >= MIN_PICKUP_VISIBLE_TRAVEL_MS
      const movedDistance = distanceMeters(moved.point, pickup)
      const nextPoint = !canArrive && (moved.done || movedDistance <= 12) ? keepBeforeTarget(from, pickup) : moved.point
      this.mergeTripState(bot, orderId, { pickupStartedAt, pickupRouteIndex: moved.index, pickupMovedAt: now })
      await this.sendLocation(bot, nextPoint, true)
      if (canArrive && distanceMeters(nextPoint, pickup) <= 10) {
        const reachedAt = freshTrip.pickupReachedAt || now
        this.mergeTripState(bot, orderId, { pickupReachedAt: reachedAt })
        if (now - reachedAt < 3000) return
        const response = await this.setOrderAction(bot, orderId, ACTIONS.SET_ARRIVE_STATE)
        if (!isBackendError(response)) {
          this.log(`[${bot.name}] order ${orderId}: на месте`)
          this.mergeTripState(bot, orderId, { arrivedAt: now })
        }
      }
      return
    }

    if (Number(state) === DRIVER_STATES.ARRIVED) {
      const arrivedAt = trip.arrivedAt || now
      bot.tripState.set(orderId, { ...trip, arrivedAt })
      if (now - arrivedAt >= 7000) await this.tryStartTrip(bot, order)
      return
    }

    if (Number(state) === DRIVER_STATES.STARTED) {
      const from = bot.currentLocation || pickup
      const freshTrip = bot.tripState.get(orderId) || trip
      const route = await this.getRouteForPhase(bot, orderId, 'destination', from, destination)
      const step = stepMetersForDemo(freshTrip.destinationMovedAt, now)
      const moved = moveAlongRoute(from, route, step, Number(freshTrip.destinationRouteIndex) || 1)
      this.mergeTripState(bot, orderId, { destinationRouteIndex: moved.index, destinationMovedAt: now })
      await this.sendLocation(bot, moved.point, true)
      if (moved.done || distanceMeters(moved.point, destination) <= 15) {
        const reachedAt = freshTrip.destinationReachedAt || now
        this.mergeTripState(bot, orderId, { destinationReachedAt: reachedAt })
        if (now - reachedAt < 4000) return
        const response = await this.setOrderAction(bot, orderId, ACTIONS.SET_COMPLETE_STATE)
        if (!isBackendError(response)) {
          bot.tripState.delete(orderId)
          this.log(`[${bot.name}] order ${orderId}: поездка завершена`)
        }
      }
    }
  }

  private shouldHandleOrder(order: any) {
    return isDriverEmulatorTargetOrder(order)
  }

  private async tickBot(bot: BotState) {
    if (bot.disabled || !bot.session || !bot.car) return
    const active = await this.getActiveOrders(bot).catch(error => {
      this.log(`[${bot.name}] active load failed: ${stringifyError(error)}`)
      return []
    })
    const activeForDriver = active.filter(order => this.shouldHandleOrder(order) && findDriverRecord(order, bot.car?.c_id, bot.user?.u_id))
    await promiseAllSettled(activeForDriver.map(order => this.simulateActiveOrder(bot, order)))

    const ready = await this.getReadyOrders(bot).catch(error => {
      this.log(`[${bot.name}] ready load failed: ${stringifyError(error)}`)
      return []
    })
    const targetReady = ready.filter(order => this.shouldHandleOrder(order))
    this.log(`[${bot.name}] orders=${targetReady.length}${ready.length !== targetReady.length ? `/${ready.length} test-only` : ''}`)
    await promiseAllSettled(targetReady.map(order => this.reactToOrder(bot, order)))

    if (!bot.lastLocationAttemptAt || Date.now() - bot.lastLocationAttemptAt >= REMOTE_LOCATION_INTERVAL_MS * 2) {
      await this.sendLocation(bot, bot.currentLocation || bot.driver.location).catch(() => null)
    }
  }

  private async tick() {
    if (!this.running || this.busy) return
    this.busy = true
    try {
      await promiseAllSettled(this.bots.map(bot => this.tickBot(bot)))
    } finally {
      this.busy = false
    }
  }
}

/* Browser-only client/order emulator for gruzvill driver-side testing.
 * It creates passenger orders from generated client accounts, so a driver can see and take them.
 */

type ClientBotState = {
  account: any
  index: number
  name: string
  session?: Session
  disabled?: boolean
}

const CLIENT_EMULATOR_STORAGE_KEY = 'gruzvill_client_order_emulator_accounts_v2'
const CLIENT_ORDER_OWNER_STORAGE_KEY = 'gruzvill_client_order_emulator_owner_map_v2'
const CLIENT_ORDER_INTERVAL_MS = 32000
const CLIENT_START_STAGGER_MIN_MS = 900
const CLIENT_START_STAGGER_MAX_MS = 2600
const CLIENT_ACCOUNTS_COUNT = 4

const CLIENT_ORDER_POINTS = [
  {
    from: {
      address: 'улица Ерёменко, 4-й мкр, 6-й мкр, Левенцовский район',
      shortAddress: 'улица Ерёменко',
      latitude: 47.230861,
      longitude: 39.589223,
    },
    to: {
      address: 'проспект Солженицына, 3-й мкр, 6-й мкр, Левенцовский район',
      shortAddress: 'проспект Солженицына',
      latitude: 47.236102,
      longitude: 39.604732,
    },
  },
  {
    from: {
      address: 'улица Доватора, Северо-Западный район',
      shortAddress: 'улица Доватора',
      latitude: 47.224674,
      longitude: 39.606437,
    },
    to: {
      address: 'MaxMarket, 108 с1, улица Ерёменко',
      shortAddress: 'MaxMarket',
      latitude: 47.231479,
      longitude: 39.586964,
    },
  },
  {
    from: {
      address: 'Левенцовский район, Ростов-на-Дону',
      shortAddress: 'Левенцовский район',
      latitude: 47.22937,
      longitude: 39.58591,
    },
    to: {
      address: 'Северо-Западный район, Ростов-на-Дону',
      shortAddress: 'Северо-Западный район',
      latitude: 47.24414,
      longitude: 39.60981,
    },
  },
]

const AGADIR_CLIENT_ORDER_POINTS = [
  {
    from: {
      address: 'Haut Founty, Agadir',
      shortAddress: 'Haut Founty',
      latitude: 30.39442,
      longitude: -9.57992,
    },
    to: {
      address: 'Founty, Agadir',
      shortAddress: 'Founty',
      latitude: 30.40739,
      longitude: -9.59656,
    },
  },
  {
    from: {
      address: 'El Massira, Agadir',
      shortAddress: 'El Massira',
      latitude: 30.40846,
      longitude: -9.54817,
    },
    to: {
      address: 'Maroc, Agadir',
      shortAddress: 'Maroc',
      latitude: 30.42514,
      longitude: -9.58575,
    },
  },
  {
    from: {
      address: 'Riad Salam, Agadir',
      shortAddress: 'Riad Salam',
      latitude: 30.41142,
      longitude: -9.56131,
    },
    to: {
      address: 'Souk El Had, Agadir',
      shortAddress: 'Souk El Had',
      latitude: 30.42139,
      longitude: -9.58306,
    },
  },
  {
    from: {
      address: 'Hay Dakhla, Agadir',
      shortAddress: 'Hay Dakhla',
      latitude: 30.40027,
      longitude: -9.53652,
    },
    to: {
      address: 'Talborjt, Agadir',
      shortAddress: 'Talborjt',
      latitude: 30.42447,
      longitude: -9.59387,
    },
  },
]

function isAgadirPoint(point?: Point | null) {
  if (!point) return false
  const latitude = Number(point.latitude)
  const longitude = Number(point.longitude)

  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 30.30 && latitude <= 30.55 &&
    longitude >= -9.75 && longitude <= -9.45
}

function getGeneratedOrderPointPool(origin?: Point | null) {
  return isAgadirPoint(origin) ? AGADIR_CLIENT_ORDER_POINTS : CLIENT_ORDER_POINTS
}

const CLIENT_COMMENTS = [
  'Нужно подъехать аккуратно к подъезду',
  'Буду ждать у входа',
  'Позвоните, когда подъедете',
  'Есть небольшой багаж',
  'Оплата по месту',
  'Нужна спокойная поездка',
]


function safeJsonParse<T>(value: any, fallback: T): T {
  try {
    if (!value) return fallback
    return JSON.parse(String(value)) || fallback
  } catch {
    return fallback
  }
}

function makeClientRunId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.replace(/[^a-z0-9]/gi, '').slice(0, 18)
}

function getStoredClientAccounts() {
  if (typeof window === 'undefined') return []
  const stored = safeJsonParse<any[]>(window.localStorage.getItem(CLIENT_EMULATOR_STORAGE_KEY), [])
  return Array.isArray(stored) ? stored.filter(item => item?.login && item?.password) : []
}

function saveStoredClientAccounts(accounts: any[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CLIENT_EMULATOR_STORAGE_KEY, JSON.stringify(accounts))
}

function readClientOrderOwnerMap(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const value = safeJsonParse<Record<string, string>>(window.localStorage.getItem(CLIENT_ORDER_OWNER_STORAGE_KEY), {})
  return value && typeof value === 'object' ? value : {}
}

function writeClientOrderOwnerMap(value: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CLIENT_ORDER_OWNER_STORAGE_KEY, JSON.stringify(value || {}))
}

function clearClientOrderOwnerMap() {
  writeClientOrderOwnerMap({})
}

function saveClientOrderOwner(orderId: any, client: ClientBotState) {
  if (!orderId) return
  const map = readClientOrderOwnerMap()
  map[String(orderId)] = String(client.account?.login || client.account?.email || client.name || '')
  writeClientOrderOwnerMap(map)
}

function removeClientOrderOwner(orderId: any) {
  if (!orderId) return
  const map = readClientOrderOwnerMap()
  delete map[String(orderId)]
  writeClientOrderOwnerMap(map)
}

function createGeneratedClientAccounts(count = CLIENT_ACCOUNTS_COUNT) {
  const runId = makeClientRunId()
  return Array.from({ length: count }).map((_, index) => {
    const n = index + 1
    const padded = String(n).padStart(2, '0')
    return {
      name: `Gruzvill Client ${padded}`,
      login: `gruzvill.client.${runId}.${padded}@ibronevik.ru`,
      email: `gruzvill.client.${runId}.${padded}@ibronevik.ru`,
      phone: `+1009${runId.replace(/\D/g, '').slice(-5).padStart(5, '0')}${padded}`.slice(0, 16),
      password: '12345678',
      type: 'e-mail',
    }
  })
}

function formatApiDatetime(offsetMinutes = 2) {
  const date = new Date(Date.now() + Number(offsetMinutes || 0) * 60000)
  const pad = (value: number) => String(value).padStart(2, '0')
  const timezoneOffset = -date.getTimezoneOffset()
  const sign = timezoneOffset >= 0 ? '+' : '-'
  const absOffset = Math.abs(timezoneOffset)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
}

function jitterOrderPoint(point: any, meters = 260, minMeters = 40) {
  const lat = Number(point?.latitude)
  const lon = Number(point?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return point
  const angle = Math.random() * Math.PI * 2
  const radius = randInt(minMeters, meters)
  return {
    ...point,
    latitude: Number((lat + Math.cos(angle) * radius / 111320).toFixed(6)),
    longitude: Number((lon + Math.sin(angle) * radius / (111320 * Math.cos(lat * Math.PI / 180))).toFixed(6)),
  }
}

function makeLocalEmulatorPointAround(base: Point, label: string, maxMeters: number, minMeters: number) {
  return jitterOrderPoint({
    address: label,
    shortAddress: label,
    latitude: base.latitude,
    longitude: base.longitude,
  }, maxMeters, minMeters)
}

function normalizeBrowserLocationPoint(value: any): Point | null {
  const latitude = Number(value?.latitude ?? value?.lat)
  const longitude = Number(value?.longitude ?? value?.lng ?? value?.lon)
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null
}

function saveBrowserGeolocationPoint(point: Point, source = 'navigator') {
  try {
    window.localStorage.setItem(SAVED_GEOLOCATION_KEY, JSON.stringify({
      ...point,
      timestamp: Date.now(),
      source,
    }))
  } catch {
    // ignore storage errors
  }
}

function getSavedBrowserGeolocationPoint(maxAgeMs = EMULATOR_LOCATION_MAX_AGE_MS): Point | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_GEOLOCATION_KEY) || 'null')
    const point = normalizeBrowserLocationPoint(parsed)
    if (!point)
      return null

    const timestamp = Number(parsed?.timestamp || parsed?.time || parsed?.savedAt)
    if (maxAgeMs > 0 && (!Number.isFinite(timestamp) || Date.now() - timestamp > maxAgeMs))
      return null

    return point
  } catch {
    return null
  }
}


async function getBrowserGeolocationPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported' | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.geolocation)
    return 'unsupported'

  try {
    const permissions = (navigator as any).permissions
    if (permissions?.query) {
      const status = await permissions.query({ name: 'geolocation' })
      return status?.state || 'unknown'
    }
  } catch {
    // Safari/old webviews can throw here. We still can try getCurrentPosition by user action.
  }

  return 'unknown'
}

async function getBrowserGeolocationPoint(timeoutMs = EMULATOR_GEOLOCATION_TIMEOUT_MS): Promise<Point | null> {
  // Для эмулятора не используем last-known/stored geo вообще.
  // Заказчик должен получать заказы около устройства, где нажал запуск.
  const permissionState = await getBrowserGeolocationPermissionState()
  writeRawLog('GEO_PERMISSION_STATE', {
    source: 'browser-client-emulator',
    screen: 'DriverEmulatorPanel',
    state: permissionState,
  })

  if (permissionState === 'unsupported' || typeof navigator === 'undefined' || !navigator.geolocation) {
    writeRawLog('GEO_POSITION_FAILED', {
      source: 'browser-client-emulator',
      screen: 'DriverEmulatorPanel',
      status: 'unsupported',
    })
    return null
  }

  if (permissionState === 'denied') {
    writeRawLog('GEO_POSITION_FAILED', {
      source: 'browser-client-emulator',
      screen: 'DriverEmulatorPanel',
      status: 'denied',
    })
    return null
  }

  return new Promise(resolve => {
    let done = false
    const finish = (point: Point | null, status: 'ok' | 'timeout' | 'denied' | 'unavailable') => {
      if (done) return
      done = true
      if (status === 'ok' && point) {
        writeRawLog('GEO_POSITION_RESOLVED', {
          source: 'browser-client-emulator',
          screen: 'DriverEmulatorPanel',
          latitude: point.latitude,
          longitude: point.longitude,
          maximumAge: 0,
          timeoutMs,
        })
      } else {
        writeRawLog('GEO_POSITION_FAILED', {
          source: 'browser-client-emulator',
          screen: 'DriverEmulatorPanel',
          status,
          maximumAge: 0,
          timeoutMs,
        })
      }
      resolve(point)
    }
    const timer = window.setTimeout(() => finish(null, 'timeout'), timeoutMs)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        window.clearTimeout(timer)
        const point = normalizeBrowserLocationPoint(coords)
        if (point)
          saveBrowserGeolocationPoint(point, 'navigator')
        finish(point, point ? 'ok' : 'unavailable')
      },
      (error) => {
        window.clearTimeout(timer)
        const status = error?.code === error?.PERMISSION_DENIED ?
          'denied' :
          error?.code === error?.TIMEOUT ?
            'timeout' :
            'unavailable'
        finish(null, status)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    )
  })
}

function formatEmulatorPoint(point?: Point | null) {
  if (!point)
    return 'нет геолокации'

  return `${Number(point.latitude).toFixed(5)}, ${Number(point.longitude).toFixed(5)}`
}

function isGeneratedAddressPlaceholder(value?: unknown) {
  const address = String(value || '').trim().toLowerCase()
  if (!address)
    return true

  return [
    'точка подачи рядом с вами',
    'точка назначения рядом с вами',
    'координаты подачи',
    'координаты назначения',
  ].some(pattern => address.includes(pattern))
}

function compactReverseAddress(response: any) {
  const displayName = String(response?.display_name || response?.shortAddress || '').trim()
  const details = response?.address || {}
  const road = String([
    details.road || details.pedestrian || details.footway || details.path,
    details.house_number,
  ].filter(Boolean).join(', ')).trim()
  const locality = String(
    details.city ||
    details.town ||
    details.village ||
    details.suburb ||
    details.neighbourhood ||
    details.county ||
    details.state ||
    '',
  ).trim()
  const shortAddress = String(response?.shortAddress || [road, locality].filter(Boolean).join(', ') || displayName).trim()

  return {
    address: displayName || shortAddress,
    shortAddress: shortAddress || displayName,
  }
}

function coordinateAddressFallback(point: Point, label: 'подачи' | 'назначения') {
  return `Координаты ${label}: ${formatEmulatorPoint(point)}`
}

async function resolveGeneratedPointAddress(point: any, label: 'подачи' | 'назначения') {
  try {
    const response = await API.reverseGeocode(String(point.latitude), String(point.longitude))
    const resolved = compactReverseAddress(response)
    if (resolved.address && !isGeneratedAddressPlaceholder(resolved.address)) {
      return {
        ...point,
        address: resolved.address,
        shortAddress: resolved.shortAddress || resolved.address,
        geocodeSource: 'reverse-geocode',
      }
    }
  } catch (_) {
    // If reverse geocode is blocked/slow, still do not leave an empty generic address.
  }

  const fallback = coordinateAddressFallback(point, label)
  return {
    ...point,
    address: fallback,
    shortAddress: fallback,
    geocodeSource: 'coordinate-fallback',
  }
}

async function resolveGeneratedOrderAddresses(meta: any) {
  const [from, to] = await Promise.all([
    resolveGeneratedPointAddress(meta.from, 'подачи'),
    resolveGeneratedPointAddress(meta.to, 'назначения'),
  ])

  meta.from = from
  meta.to = to

  return { from, to }
}

type GeneratedOrderMode = 'order' | 'voting' | 'offer'

// Клиентский эмулятор должен создавать все режимы, включая голосование.
// Начинаем с voting, чтобы даже при 1-2 готовых клиентах заказ на голосование точно появился.
const GENERATED_ORDER_MODE_SEQUENCE: GeneratedOrderMode[] = ['voting', 'offer', 'order', 'voting']
let generatedOrderModeCursor = 0

function pickGeneratedOrderMode(): GeneratedOrderMode {
  const mode = GENERATED_ORDER_MODE_SEQUENCE[generatedOrderModeCursor % GENERATED_ORDER_MODE_SEQUENCE.length]
  generatedOrderModeCursor += 1
  return mode
}

function buildGeneratedPassengerOrder(origin: Point) {
  const from = makeLocalEmulatorPointAround(origin, 'Точка подачи рядом с вами', 650, 120)
  const to = makeLocalEmulatorPointAround(origin, 'Точка назначения рядом с вами', 2200, 900)
  const price = randInt(260, 460)
  const comment = pick(CLIENT_COMMENTS, 'Тестовый клиентский заказ')
  const passengers = randInt(1, 3)
  const mode = pickGeneratedOrderMode()
  const offerCommentIds = mode === 'offer' ? getOfferResponseBookingCommentIds() : []
  const intercityLocationClass = getDefaultIntercityLocationClassId()
  const cityLocationClass = getDefaultCityLocationClassId()

  const payload: any = {
    b_start_address: from.address,
    b_start_latitude: String(from.latitude),
    b_start_longitude: String(from.longitude),
    b_destination_address: to.address,
    b_destination_latitude: String(to.latitude),
    b_destination_longitude: String(to.longitude),
    b_contact: '+70000000000',
    b_start_datetime: formatApiDatetime(2),
    b_passengers_count: passengers,
    b_payment_way: 1,
    b_max_waiting: mode === 'voting' ? 180 : 7200,
    b_cars_count: mode === 'offer' ? 0 : undefined,
    b_car_class: mode === 'offer' ? 2 : 1,
    b_driver_code: '1',
    b_custom_comment: comment,
    b_voting: mode === 'voting' ? true : undefined,
    b_services: mode === 'voting' ? [1] : undefined,
    b_comments: offerCommentIds.length ? JSON.stringify(offerCommentIds) : undefined,
    b_location_class: mode === 'offer' && intercityLocationClass ? intercityLocationClass : cityLocationClass,
    // Важно: backend/gruzvill принимает только разрешённые b_options-ключи
    // и часто требует значения массивами. Служебные order_mode/b_voting/fromShortAddress
    // храним локально через setStoredChoiceOrderMode после создания заказа, а в backend
    // отправляем только customer_price в безопасной форме.
    b_options: price > 0 ? {
      customer_price: [price],
    } : undefined,
  }

  if (mode === 'offer') {
    payload.b_options = price > 0 ? {
      customer_price: [price],
    } : undefined
  }

  return {
    payload,
    meta: { price, from, to, comment, passengers, mode, origin },
  }
}

async function apiPostForm(endpoint: string, fields: any) {
  const url = `${API_BASE}${endpoint}`
  const formData = new FormData()
  Object.entries(fields || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    formData.append(key, String(value))
  })
  const response = await fetch(url, { method: 'POST', body: formData })
  return parseResponse(response, url)
}

function extractResponseOrderId(response: any) {
  return response?.data?.b_id || response?.b_id || response?.data?.booking_id || response?.booking_id || response?.id || null
}

function shouldRetryGeneratedOrderAttempt(message: string) {
  const normalized = String(message || '').toLowerCase()
  if (!normalized)
    return false

  return normalized.includes('class') ||
    normalized.includes('b_options') ||
    normalized.includes('c_options') ||
    normalized.includes('options') ||
    normalized.includes('element not array') ||
    normalized.includes('wrong')
}

function getSessionRole(session: Session | undefined) {
  const role = session?.user?.u_role ?? session?.user?.role
  const numeric = Number(role)
  return Number.isFinite(numeric) ? numeric : null
}

function isWrongLoginError(error: any) {
  const text = normalizeErrorMessage(error).toLowerCase()
  return text.includes('wrong login') || text.includes('not found') || text.includes('auth failed')
}

function isDuplicateRegisterError(error: any) {
  const text = normalizeErrorMessage(error).toLowerCase()
  return text.includes('busy user data') || text.includes('duplicate') || text.includes('already') || text.includes('существ')
}

async function registerClientAccount(account: any) {
  const response = await apiPostForm('/register', {
    u_name: account.name || 'Gruzvill Client',
    u_phone: account.phone || '+70000000000',
    u_email: account.email || account.login,
    u_role: '1',
    data: JSON.stringify({ password: account.password || '12345678' }),
  })
  if (isBackendError(response)) throw new Error(normalizeErrorMessage(response) || 'client register failed')
  return response
}

async function postPassengerOrder(session: Session, payload: any) {
  return apiPost('/drive', {
    token: session.token,
    u_hash: session.u_hash,
    data: JSON.stringify(payload),
  })
}

async function confirmPassengerOrder(session: Session, orderId: any) {
  if (!orderId) return null
  return apiPost(`/drive/get/${orderId}`, {
    token: session.token,
    u_hash: session.u_hash,
    action: 'set_confirm_state',
  }).catch(() => null)
}

export class BrowserClientOrderEmulator {
  private logs: string[] = []
  private running = false
  private clients: ClientBotState[] = []
  private timer: number | null = null
  private initPromise: Promise<void> | null = null
  private busy = false
  private emitTimer: number | null = null
  private nextClientIndex = 0
  private createdOrders = new Map<string, ClientBotState>()
  private localOrigin: Point | null = null
  private lastWakeTickAt = 0
  private wakeListener = (() => {
    if (!this.running) return
    this.ensureTimer()
    const now = Date.now()
    if (now - this.lastWakeTickAt < 3500) return
    this.lastWakeTickAt = now
    this.log('Эмулятор клиентов активен: проверяю генерацию после возврата вкладки/сети.')
    window.setTimeout(() => { this.tick() }, 80)
  }) as EventListener

  constructor(private options: BrowserEmulatorOptions) {}

  snapshot(): BrowserEmulatorSnapshot {
    return { running: this.running, logs: this.logs }
  }

  private emit() {
    if (this.emitTimer !== null) return
    this.emitTimer = window.setTimeout(() => {
      this.emitTimer = null
      this.options.onUpdate(this.snapshot())
    }, 160)
  }

  private emitNow() {
    if (this.emitTimer !== null) {
      window.clearTimeout(this.emitTimer)
      this.emitTimer = null
    }
    this.options.onUpdate(this.snapshot())
  }

  private log(message: string) {
    const time = new Date().toLocaleTimeString()
    this.logs = [...this.logs, `[${time}] ${message}`].slice(-300)
    writeRawLog('CLIENT_EMULATOR_LOG', {
      source: 'browser-client-emulator',
      screen: 'DriverEmulatorPanel',
      uiState: this.running ? 'running' : 'stopped',
      message,
      running: this.running,
      localOrigin: this.localOrigin,
      createdOrderIds: Array.from(this.createdOrders.keys()),
    })
    this.emit()
  }

  private ensureTimer() {
    if (this.timer !== null) return
    this.timer = window.setInterval(() => { this.tick() }, CLIENT_ORDER_INTERVAL_MS)
  }

  private attachWakeListeners() {
    if (typeof window === 'undefined') return
    window.addEventListener('focus', this.wakeListener)
    window.addEventListener('online', this.wakeListener)
    document.addEventListener('visibilitychange', this.wakeListener)
  }

  private detachWakeListeners() {
    if (typeof window === 'undefined') return
    window.removeEventListener('focus', this.wakeListener)
    window.removeEventListener('online', this.wakeListener)
    document.removeEventListener('visibilitychange', this.wakeListener)
  }

  async check() {
    this.log('Проверяю клиентские аккаунты и геолокацию для генерации заказов...')
    const origin = await this.resolveLocalOrigin()
    this.log(origin ? `Геолокация эмулятора: ${formatEmulatorPoint(origin)}` : 'Геолокация не получена. Разрешите доступ к местоположению в браузере.')
    await this.initClients()
    const ready = this.clients.filter(client => !client.disabled && client.session).length
    this.log(`Готово клиентов: ${ready}/${this.clients.length}`)
  }

  async start() {
    if (this.running) return

    // Важно: не включаем режим clients до получения гео и очистки старых ID.
    // Иначе старые backend-заказы из localStorage на 10-12 секунд появляются как "эмуляторные".
    this.running = false
    setBrowserEmulatorRunning('clients', false)
    this.emitNow()
    this.log('Эмулятор клиентов запускается: сначала прячу старые заказы и беру геолокацию этого браузера.')

    await this.initClients().catch(error => {
      this.log(`Клиентские аккаунты пока не готовы: ${stringifyError(error)}`)
    })

    await this.closeCreatedOrders().catch(error => {
      this.log(`Старые заказы эмулятора не все закрылись: ${stringifyError(error)}`)
    })
    clearBrowserEmulatorOrderIds('clients')
    clearClientOrderOwnerMap()
    this.createdOrders.clear()
    this.log('Старые активные заказы эмулятора очищены из локального режима.')

    const origin = await this.resolveLocalOrigin()
    if (!origin) {
      this.log('Эмулятор клиентов не запущен: браузер не дал геолокацию. Разрешите доступ к местоположению и нажмите «Запустить» ещё раз.')
      this.running = false
      setBrowserEmulatorRunning('clients', false)
      clearBrowserEmulatorOrderIds('clients')
      clearClientOrderOwnerMap()
      this.emitNow()
      return
    }

    this.running = true
    generatedOrderModeCursor = 0
    setBrowserEmulatorRunning('clients', true)
    this.emitNow()
    this.log(`Эмулятор клиентов запущен вокруг текущей локации: ${formatEmulatorPoint(origin)}`)
    this.log('Создаю новые заказы рядом с текущей геолокацией: сначала голосование, затем предложение/обычный заказ.')
    await this.createOrdersFromAllReadyClients()
    this.ensureTimer()
    this.attachWakeListeners()
  }

  async stop() {
    this.running = false
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.detachWakeListeners()
    setBrowserEmulatorRunning('clients', false)
    this.log('Эмулятор клиентов остановлен, закрываю тестовые заказы')
    await this.closeCreatedOrders()
    clearBrowserEmulatorOrderIds('clients')
    clearClientOrderOwnerMap()
    this.emitNow()
  }

  async createOrder() {
    await this.initClients()
    return this.createOneOrder()
  }

  private async resolveLocalOrigin() {
    const point = await getBrowserGeolocationPoint().catch(() => null)
    if (point)
      this.localOrigin = point

    return this.localOrigin
  }

  private async closeCreatedOrders() {
    await this.initClients().catch(() => null)
    const ownerMap = readClientOrderOwnerMap()
    const storedIds = getBrowserEmulatorOrderIds('clients')
    const orderIds = Array.from(new Set([
      ...Array.from(this.createdOrders.keys()),
      ...storedIds,
      ...Object.keys(ownerMap),
    ].filter(Boolean).map(String)))
    if (!orderIds.length) return

    const readyClients = this.clients.filter(client => !client.disabled && client.session)
    await promiseAllSettled(orderIds.map(async(orderId) => {
      const ownerLogin = ownerMap[orderId]
      const runtimeOwner = this.createdOrders.get(orderId)
      const preferred = runtimeOwner || readyClients.find(client =>
        ownerLogin && String(client.account?.login || client.account?.email || '').toLowerCase() === ownerLogin.toLowerCase(),
      )
      const candidates = preferred ? [preferred, ...readyClients.filter(client => client !== preferred)] : readyClients
      let closed = false
      let lastMessage = ''

      for (const client of candidates) {
        if (!client.session) continue
        const response = await apiPost(`/drive/get/${orderId}`, {
          token: client.session.token,
          u_hash: client.session.u_hash,
          action: ACTIONS.SET_CANCEL_STATE,
        }).catch(error => error)
        if (!isBackendError(response)) {
          closed = true
          this.log(`[${client.name}] заказ ${orderId}: закрыт`)
          break
        }
        lastMessage = normalizeErrorMessage(response)
      }

      removeBrowserEmulatorOrderId('clients', orderId)
      removeClientOrderOwner(orderId)
      if (!closed && lastMessage) this.log(`заказ ${orderId}: скрыт, закрыть не удалось: ${lastMessage}`)
    }))
    this.createdOrders.clear()
  }

  private async initClients() {
    if (this.initPromise) return this.initPromise
    this.initPromise = this.initClientsInner().catch(error => {
      this.initPromise = null
      throw error
    })
    return this.initPromise
  }

  private async initClientsInner() {
    if (this.clients.length) return
    let accounts = getStoredClientAccounts()
    if (!accounts.length) {
      accounts = createGeneratedClientAccounts(CLIENT_ACCOUNTS_COUNT)
      saveStoredClientAccounts(accounts)
      this.log(`Создал локальный список клиентов: ${accounts.length}`)
    }

    this.clients = accounts.map((account, index) => ({
      account,
      index,
      name: account.name || account.login || `Клиент ${index + 1}`,
    }))

    await promiseAllSettled(this.clients.map(client => this.initClient(client)))
  }

  private async initClient(client: ClientBotState) {
    try {
      client.session = await this.loginOrRegisterClient(client.account, client.name)
      const role = getSessionRole(client.session)
      if (role !== null && role !== 1) throw new Error(`wrong user role: ${role}`)
      saveEmulatedClientIdentity({
        userId: client.session.user?.u_id,
        login: client.account.login || client.account.email,
        name: client.name,
      })
      this.log(`[${client.name}] готов, user=${client.session.user?.u_id || '?'}`)
    } catch (error) {
      client.disabled = true
      this.log(`[${client.name}] не готов: ${stringifyError(error)}`)
    }
  }

  private async loginOrRegisterClient(account: any, label: string) {
    try {
      return await loginSession(account, label)
    } catch (error) {
      if (!isWrongLoginError(error) && !normalizeErrorMessage(error).toLowerCase().includes('auth failed')) throw error
      try {
        await registerClientAccount(account)
        this.log(`[${label}] клиент зарегистрирован`)
      } catch (registerError) {
        if (!isDuplicateRegisterError(registerError)) throw registerError
        this.log(`[${label}] клиент уже был зарегистрирован, пробую войти`)
      }
      return loginSession(account, label)
    }
  }

  private getNextClient() {
    const ready = this.clients.filter(client => !client.disabled && client.session)
    if (!ready.length) return null
    const client = ready[this.nextClientIndex % ready.length]
    this.nextClientIndex += 1
    return client
  }

  private async createOneOrder(clientOverride?: ClientBotState) {
    const client = clientOverride || this.getNextClient()
    if (!client?.session) {
      this.log('Нет готового клиентского аккаунта. Нажми «Проверить» и посмотри причину.')
      return null
    }

    const emulatorOrigin = await this.resolveLocalOrigin()
    if (!emulatorOrigin) {
      this.log('Заказ не создан: нет геолокации этого устройства. Разрешите доступ к местоположению и повторите запуск эмулятора.')
      return null
    }

    const { payload, meta } = buildGeneratedPassengerOrder(emulatorOrigin)
    const resolvedAddresses = await resolveGeneratedOrderAddresses(meta)
    payload.b_start_address = resolvedAddresses.from.address
    payload.b_destination_address = resolvedAddresses.to.address

    const attempts = [
      payload,
      (() => { const copy: any = { ...payload }; delete copy.b_car_class; return copy })(),
      (() => { const copy: any = { ...payload }; delete copy.b_options; return copy })(),
      (() => { const copy: any = { ...payload }; delete copy.b_car_class; delete copy.b_options; return copy })(),
    ]
    let lastMessage = ''

    for (const attempt of attempts) {
      const response = await postPassengerOrder(client.session, attempt).catch(error => error)
      if (!isBackendError(response) && !response?.response) {
        const orderId = extractResponseOrderId(response)
        if (orderId) {
          saveBrowserEmulatorOrderId('clients', orderId)
          saveClientOrderOwner(orderId, client)
          setStoredChoiceOrderMode(orderId, meta.mode)
          this.createdOrders.set(String(orderId), client)
        }
        await confirmPassengerOrder(client.session, orderId)
        this.log(`[${client.name}] создал заказ ${orderId || '(id unknown)'}; режим=${meta.mode}; около ${formatEmulatorPoint(meta.origin)}; ${meta.from.shortAddress || meta.from.address} → ${meta.to.shortAddress || meta.to.address}; адрес=${meta.from.geocodeSource || 'unknown'}/${meta.to.geocodeSource || 'unknown'}; ${meta.price}; пассажиров=${meta.passengers}`)
        return response
      }
      lastMessage = normalizeErrorMessage(response) || stringifyError(response)
      if (shouldRetryGeneratedOrderAttempt(lastMessage)) {
        this.log(`[${client.name}] backend отклонил вариант создания (${lastMessage || 'unknown'}), пробую безопасный fallback без лишних полей.`)
        continue
      }
      break
    }

    this.log(`[${client.name}] заказ не создан: ${lastMessage || 'unknown error'}`)
    return null
  }

  private async createOrdersFromAllReadyClients() {
    const ready = this.clients.filter(client => !client.disabled && client.session)
    if (!ready.length) {
      this.log('Нет готовых клиентских аккаунтов. Нажми «Проверить» и посмотри причину.')
      return
    }
    this.log(`Стартовая генерация: ${ready.length} клиент(а) создают заказы как настоящие пассажиры.`)
    for (const client of ready) {
      if (!this.running) break
      await sleep(randInt(CLIENT_START_STAGGER_MIN_MS, CLIENT_START_STAGGER_MAX_MS))
      await this.createOneOrder(client)
    }
  }

  private async tick() {
    if (!this.running || this.busy) return
    this.busy = true
    try {
      await this.createOneOrder()
    } finally {
      this.busy = false
    }
  }
}
