type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike }

export interface RawLogRecord {
  id: string
  ts: string
  timestamp: number
  event: string
  driver_id?: string | number | null
  order_id?: string | number | null
  user_id?: string | number | null
  session_id: string
  device_id: string
  app_version: string
  platform: string
  screen?: string | null
  ui_state?: string | null
  trace_id?: string | null
  driver_snapshot?: JsonLike
  payload?: JsonLike
}

const RAW_LOG_STORAGE_KEY = 'taxi_raw_log_v1'
const RAW_SESSION_STORAGE_KEY = 'taxi_raw_session_id_v1'
const RAW_DEVICE_STORAGE_KEY = 'taxi_raw_device_id_v1'
const RAW_LIFECYCLE_INITIALIZED_KEY = '__taxiRawLifecycleInitialized'
const MAX_RAW_RECORDS = 3000
const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 80
const MAX_STRING_LENGTH = 1400

let cachedRawRecords: RawLogRecord[] | null = null

function isBrowser() {
  return typeof window !== 'undefined'
}

function safeNowIso() {
  try {
    return new Date().toISOString()
  } catch (_) {
    return String(Date.now())
  }
}

function makeId(prefix: string) {
  try {
    const cryptoObject = isBrowser() ? window.crypto : undefined
    if (cryptoObject?.randomUUID)
      return `${prefix}-${cryptoObject.randomUUID()}`
  } catch (_) {}

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getStorageValue(key: string, fallback: string) {
  if (!isBrowser()) return fallback

  try {
    const value = window.localStorage.getItem(key)
    if (value)
      return value

    window.localStorage.setItem(key, fallback)
    return fallback
  } catch (_) {
    return fallback
  }
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
    // Keep runtime safe if localStorage is full/blocked.
  }
}

function getCachedRawRecords() {
  if (cachedRawRecords === null)
    cachedRawRecords = readJsonStorage<RawLogRecord[]>(RAW_LOG_STORAGE_KEY, [])
  return cachedRawRecords
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
    const result = value.slice(0, MAX_ARRAY_ITEMS).map(item => sanitize(item, depth + 1))
    if (value.length > MAX_ARRAY_ITEMS)
      result.push(`[+${value.length - MAX_ARRAY_ITEMS} items]`)
    return result
  }

  if (type === 'object') {
    const output: { [key: string]: JsonLike } = {}
    Object.keys(value).slice(0, MAX_ARRAY_ITEMS).forEach(key => {
      const lower = key.toLowerCase()
      if (
        lower.includes('password') ||
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('authorization') ||
        lower.includes('u_hash')
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

function getAppVersion() {
  const anyWindow = isBrowser() ? window as any : {}
  return String(
    anyWindow?.APP_VERSION ||
    anyWindow?.data?.version ||
    anyWindow?.data?.app_version ||
    anyWindow?.VERSION ||
    'web',
  )
}

function getPlatform() {
  if (!isBrowser())
    return 'server'

  const userAgent = window.navigator?.userAgent || ''
  const platform = window.navigator?.platform || ''
  if (/android/i.test(userAgent))
    return 'android'
  if (/iphone|ipad|ipod/i.test(userAgent))
    return 'ios'
  if (/win/i.test(platform))
    return 'windows'
  if (/mac/i.test(platform))
    return 'mac'
  if (/linux/i.test(platform))
    return 'linux'
  return 'web'
}

function getSessionId() {
  return getStorageValue(RAW_SESSION_STORAGE_KEY, makeId('session'))
}

function getDeviceId() {
  return getStorageValue(RAW_DEVICE_STORAGE_KEY, makeId('device'))
}

function getPayloadId(payload: any, key: string) {
  const value = payload?.[key] ?? payload?.data?.[key] ?? payload?.payload?.[key]
  return value === undefined ? null : value
}

function getDriverSnapshot(payload: any): JsonLike | undefined {
  const snapshot =
    payload?.driver_snapshot ??
    payload?.driverSnapshot ??
    payload?.data?.driver_snapshot ??
    payload?.data?.driverSnapshot ??
    payload?.data?.driver ??
    payload?.driver

  return snapshot === undefined ? undefined : sanitize(snapshot)
}

export function writeRawLog(event: string, payload: any = {}) {
  if (!isBrowser())
    return null

  const ts = safeNowIso()
  const record: RawLogRecord = {
    id: makeId('raw'),
    ts,
    timestamp: Date.now(),
    event,
    driver_id: getPayloadId(payload, 'driver_id') ?? getPayloadId(payload, 'driverId') ?? getPayloadId(payload, 'u_id'),
    order_id: getPayloadId(payload, 'order_id') ?? getPayloadId(payload, 'orderId') ?? getPayloadId(payload, 'b_id'),
    user_id: getPayloadId(payload, 'user_id') ?? getPayloadId(payload, 'userId'),
    session_id: getSessionId(),
    device_id: getDeviceId(),
    app_version: getAppVersion(),
    platform: getPlatform(),
    screen: payload?.screen ?? payload?.data?.screen ?? null,
    ui_state: payload?.ui_state ?? payload?.uiState ?? payload?.data?.uiState ?? null,
    trace_id: payload?.trace_id ?? payload?.traceId ?? payload?.data?.traceId ?? null,
    driver_snapshot: getDriverSnapshot(payload),
    payload: sanitize(payload),
  }

  const records = getCachedRawRecords()
  records.push(record)
  if (records.length > MAX_RAW_RECORDS)
    records.splice(0, records.length - MAX_RAW_RECORDS)

  writeJsonStorage(RAW_LOG_STORAGE_KEY, records)
  return record
}

export function getRawLogSnapshot() {
  return {
    title: 'taxi raw immutable debug log',
    rawLevel: 0,
    retentionHint: 'raw-client-log',
    exportedAt: safeNowIso(),
    session_id: getSessionId(),
    device_id: getDeviceId(),
    app_version: getAppVersion(),
    platform: getPlatform(),
    entries: getCachedRawRecords(),
  }
}

export function clearRawLog() {
  cachedRawRecords = []
  writeJsonStorage(RAW_LOG_STORAGE_KEY, cachedRawRecords)
}

export function setupRawLifecycleLogging() {
  if (!isBrowser())
    return

  const anyWindow = window as any
  if (anyWindow[RAW_LIFECYCLE_INITIALIZED_KEY])
    return

  anyWindow[RAW_LIFECYCLE_INITIALIZED_KEY] = true

  writeRawLog('app_started', {
    screen: 'App',
    visibilityState: document.visibilityState,
    online: window.navigator.onLine,
    notificationPermission: (window as any).Notification?.permission ?? null,
  })

  document.addEventListener('visibilitychange', () => {
    writeRawLog(document.visibilityState === 'visible' ? 'app_foreground' : 'app_background', {
      screen: 'App',
      visibilityState: document.visibilityState,
      online: window.navigator.onLine,
    })
  })

  window.addEventListener('online', () => {
    writeRawLog('network_changed', {
      screen: 'App',
      online: true,
    })
  })

  window.addEventListener('offline', () => {
    writeRawLog('network_changed', {
      screen: 'App',
      online: false,
    })
  })

  window.addEventListener('beforeunload', () => {
    writeRawLog('app_closed', {
      screen: 'App',
      visibilityState: document.visibilityState,
      online: window.navigator.onLine,
    })
  })
}
