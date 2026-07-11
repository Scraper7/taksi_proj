import { clearFlowLog, getFlowLogSnapshot, validatePassengerLifecycleFlow, validateReviewFlow, validateSuccessfulVotingTrip } from './flowLog'
import { clearRawLog, getRawLogSnapshot, setupRawLifecycleLogging, writeRawLog } from './rawLog'

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike }

const FRONTEND_LOG_STORAGE_KEY = 'taxi_frontend_debug_log_v1'
const FRONTEND_LOG_SNAPSHOT_KEY = 'taxi_frontend_debug_snapshots_v1'
const MAX_LOG_ENTRIES = 250
const MAX_ARRAY_ITEMS = 40
const MAX_STRING_LENGTH = 800
const MAX_DEPTH = 5
const STORAGE_FLUSH_DELAY_MS = 900

let cachedEntries: IFrontendLogEntry[] | null = null
let cachedSnapshots: { [key: string]: any } | null = null

setupRawLifecycleLogging()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let pendingStorageFlush = false

interface IFrontendLogEntry {
  time: string
  type: string
  payload?: JsonLike
}

function isBrowser() {
  return typeof window !== 'undefined'
}

function safeNow() {
  try {
    return new Date().toISOString()
  } catch (_) {
    return String(Date.now())
  }
}

function roundCoordinate(value: any) {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null
}

function sanitize(value: any, depth = 0): JsonLike {
  if (depth > MAX_DEPTH)
    return '[depth-limit]'

  if (value === null || value === undefined)
    return value === undefined ? null : value

  const type = typeof value
  if (type === 'string')
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value

  if (type === 'number')
    return Number.isFinite(value) ? value : null

  if (type === 'boolean')
    return value

  if (value instanceof Date)
    return value.toISOString()

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map(item => sanitize(item, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS)
      items.push(`[+${value.length - MAX_ARRAY_ITEMS} items]`)
    return items
  }

  if (type === 'object') {
    const output: { [key: string]: JsonLike } = {}
    Object.keys(value).slice(0, MAX_ARRAY_ITEMS).forEach(key => {
      const lower = key.toLowerCase()
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('authorization')
      ) {
        output[key] = '[hidden]'
        return
      }

      output[key] = sanitize(value[key], depth + 1)
    })
    return output
  }

  return String(value)
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (_) {
    return fallback
  }
}

function writeJsonStorage(key: string, value: any) {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch (_) {
    // localStorage may be blocked on some browsers. Console copy still works.
  }
}

function getCachedEntries() {
  if (cachedEntries === null)
    cachedEntries = readJsonStorage<IFrontendLogEntry[]>(FRONTEND_LOG_STORAGE_KEY, [])
  return cachedEntries
}

function getCachedSnapshots() {
  if (cachedSnapshots === null)
    cachedSnapshots = readJsonStorage<{ [key: string]: any }>(FRONTEND_LOG_SNAPSHOT_KEY, {})
  return cachedSnapshots
}

function flushFrontendLogStorage() {
  if (!pendingStorageFlush && cachedEntries === null && cachedSnapshots === null)
    return

  pendingStorageFlush = false
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }

  if (cachedEntries !== null)
    writeJsonStorage(FRONTEND_LOG_STORAGE_KEY, cachedEntries)
  if (cachedSnapshots !== null)
    writeJsonStorage(FRONTEND_LOG_SNAPSHOT_KEY, cachedSnapshots)
}

function scheduleFrontendLogFlush() {
  if (!isBrowser()) return
  pendingStorageFlush = true
  if (flushTimer !== null) return

  flushTimer = setTimeout(() => {
    flushFrontendLogStorage()
  }, STORAGE_FLUSH_DELAY_MS)
}

function shouldWriteVerboseConsoleLog() {
  try {
    return Boolean((window as any).__taxiVerboseFrontendLog)
  } catch (_) {
    return false
  }
}

export function writeFrontendLog(type: string, payload?: any) {
  const entry: IFrontendLogEntry = {
    time: safeNow(),
    type,
    payload: sanitize(payload),
  }

  writeRawLog(type, {
    source: 'frontend',
    event: type,
    data: payload,
  })

  if (shouldWriteVerboseConsoleLog()) {
    try {
      // eslint-disable-next-line no-console
      console.info('[taxi-front-log]', entry.type, entry.payload)
    } catch (_) {}
  }

  const entries = getCachedEntries()
  entries.push(entry)
  cachedEntries = entries.slice(Math.max(0, entries.length - MAX_LOG_ENTRIES))
  scheduleFrontendLogFlush()
}

export function setFrontendLogSnapshot(name: string, payload: any) {
  const snapshots = getCachedSnapshots()
  snapshots[name] = {
    time: safeNow(),
    payload: sanitize(payload),
  }
  cachedSnapshots = snapshots
  scheduleFrontendLogFlush()
}

export function summarizeRouteInfo(route: any) {
  if (!route)
    return null

  const points = Array.isArray(route.points) ? route.points : []
  return {
    distance: route.distance,
    time: route.time,
    pointsCount: points.length,
    firstPoint: points[0] || null,
    lastPoint: points.length ? points[points.length - 1] : null,
  }
}

export function summarizePoint(point: any) {
  if (!point)
    return null

  return {
    latitude: roundCoordinate(point.latitude ?? point.lat ?? point[0]),
    longitude: roundCoordinate(point.longitude ?? point.lng ?? point[1]),
    address: point.address || point.shortAddress || null,
  }
}

export function summarizeDriver(driver: any) {
  if (!driver)
    return null

  return {
    u_id: driver.u_id ?? null,
    c_id: driver.c_id ?? null,
    name: [driver.u_name, driver.u_family, driver.user?.u_name, driver.user?.u_family].filter(Boolean).join(' ') || null,
    state: driver.c_state ?? null,
    latitude: roundCoordinate(driver.c_latitude),
    longitude: roundCoordinate(driver.c_longitude),
    active: driver.u_active ?? driver.c_active ?? null,
    car: driver.car?.cm_name || driver.car?.car_model || driver.c_car_name || null,
  }
}

export function summarizeOrder(order: any) {
  if (!order)
    return null

  const drivers = Array.isArray(order.drivers) ? order.drivers : []
  return {
    b_id: order.b_id ?? null,
    b_state: order.b_state ?? null,
    b_status: order.b_status ?? null,
    b_options_order_mode: order.b_options?.order_mode ?? order.b_options?.orderMode ?? order.b_options?.pricingModel?.order_mode ?? null,
    start: summarizePoint({
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
      address: order.b_start_address,
    }),
    destination: summarizePoint({
      latitude: order.b_destination_latitude,
      longitude: order.b_destination_longitude,
      address: order.b_destination_address,
    }),
    driversCount: drivers.length,
    drivers: drivers.map(summarizeDriver),
  }
}

function getEnvironmentSnapshot() {
  if (!isBrowser()) return {}

  const nav = window.navigator as any
  const connection = nav.connection || nav.mozConnection || nav.webkitConnection

  return sanitize({
    createdAt: safeNow(),
    href: window.location.href,
    pathname: window.location.pathname,
    search: window.location.search,
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    language: window.navigator.language,
    online: window.navigator.onLine,
    visibilityState: document.visibilityState,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
      screenWidth: window.screen?.width,
      screenHeight: window.screen?.height,
      orientation: (window.screen as any)?.orientation?.type || null,
    },
    connection: connection ? {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
      saveData: connection.saveData,
    } : null,
  })
}

function clearFrontendLog() {
  cachedEntries = []
  cachedSnapshots = {}
  pendingStorageFlush = true
  flushFrontendLogStorage()
}

async function copyText(text: string) {
  if (!isBrowser()) return false

  try {
    const clipboard = (window.navigator as any).clipboard
    if (clipboard?.writeText) {
      await clipboard.writeText(text)
      return true
    }
  } catch (_) {}

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'readonly')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch (_) {
    return false
  }
}

function makeLogFileName(kind: string) {
  const stamp = safeNow()
    .replace(/[:.]/g, '-')
    .replace(/[^0-9A-Za-z_-]/g, '_')
  return `tdm-${kind}-log-${stamp}.json`
}

async function downloadTextFile(text: string, fileName: string) {
  if (!isBrowser()) return false

  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    window.setTimeout(() => {
      try {
        document.body.removeChild(link)
      } catch (_) {}
      window.URL.revokeObjectURL(url)
    }, 1200)
    return true
  } catch (_) {
    return false
  }
}

async function exportLogText(text: string, kind: string) {
  const fileName = makeLogFileName(kind)
  const downloaded = await downloadTextFile(text, fileName)
  const copied = downloaded ? false : await copyText(text)

  return {
    downloaded,
    copied,
    fileName,
  }
}

export async function copyAndClearInterfaceLog(extraSnapshot?: any) {
  flushFrontendLogStorage()
  const entries = getCachedEntries()
  const snapshots = getCachedSnapshots()
  const data = {
    title: 'taxi interface debug log',
    environment: getEnvironmentSnapshot(),
    currentSnapshot: sanitize(extraSnapshot),
    latestSnapshots: sanitize(snapshots),
    entries,
  }
  const text = JSON.stringify(data, null, 2)
  const exported = await exportLogText(text, 'interface')

  if (exported.downloaded || exported.copied) {
    clearFrontendLog()
  }
  else {
    try {
      // eslint-disable-next-line no-console
      console.info('[taxi-interface-log-export]', text)
    } catch (_) {}
  }

  return {
    ...exported,
    entriesCount: entries.length,
    text,
  }
}

export async function copyAndClearFlowDebugLog(extraSnapshot?: any) {
  const flow = getFlowLogSnapshot()
  const data = {
    title: 'taxi flow debug log',
    environment: getEnvironmentSnapshot(),
    currentSnapshot: sanitize(extraSnapshot),
    flow,
    flowCheck: validatePassengerLifecycleFlow(flow),
    reviewFlowCheck: validateReviewFlow(flow),
    votingFlowCheck: validateSuccessfulVotingTrip(flow),
  }
  const text = JSON.stringify(data, null, 2)
  const exported = await exportLogText(text, 'flow')

  if (exported.downloaded || exported.copied) {
    clearFlowLog()
  }
  else {
    try {
      // eslint-disable-next-line no-console
      console.info('[taxi-flow-log-export]', text)
    } catch (_) {}
  }

  return {
    ...exported,
    entriesCount: flow.steps.length,
    text,
  }
}


export async function copyAndClearRawLog(extraSnapshot?: any) {
  flushFrontendLogStorage()
  const raw = getRawLogSnapshot()
  const flow = getFlowLogSnapshot()
  const data = {
    ...raw,
    currentSnapshot: sanitize(extraSnapshot),
    attachedFlowSnapshot: flow,
    attachedFlowCheck: validatePassengerLifecycleFlow(flow),
    attachedReviewFlowCheck: validateReviewFlow(flow),
    attachedVotingFlowCheck: validateSuccessfulVotingTrip(flow),
    attachedInterfaceEntries: getCachedEntries(),
    attachedInterfaceSnapshots: getCachedSnapshots(),
  }
  const text = JSON.stringify(data, null, 2)
  const exported = await exportLogText(text, 'raw')

  if (exported.downloaded || exported.copied) {
    clearRawLog()
  }
  else {
    try {
      // eslint-disable-next-line no-console
      console.info('[taxi-raw-log-export]', text)
    } catch (_) {}
  }

  return {
    ...exported,
    entriesCount: raw.entries.length,
    text,
  }
}

export async function copyAndClearFrontendLog(extraSnapshot?: any) {
  flushFrontendLogStorage()
  const entries = getCachedEntries()
  const snapshots = getCachedSnapshots()
  const flow = getFlowLogSnapshot()
  const data = {
    title: 'taxi frontend debug log',
    environment: getEnvironmentSnapshot(),
    currentSnapshot: sanitize(extraSnapshot),
    latestSnapshots: sanitize(snapshots),
    entries,
    flow,
    flowCheck: validatePassengerLifecycleFlow(flow),
    reviewFlowCheck: validateReviewFlow(flow),
    votingFlowCheck: validateSuccessfulVotingTrip(flow),
  }
  const text = JSON.stringify(data, null, 2)
  const exported = await exportLogText(text, 'frontend-full')

  if (exported.downloaded || exported.copied) {
    clearFrontendLog()
    clearFlowLog()
  }
  else {
    try {
      // eslint-disable-next-line no-console
      console.info('[taxi-front-log-export]', text)
    } catch (_) {}
  }

  return {
    ...exported,
    entriesCount: entries.length,
    text,
  }
}
