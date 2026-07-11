import version from './version.json'
import { writeRawLog } from './tools/rawLog'

const APP_CACHE_VERSION_KEY = 'gruzvill_app_cache_version'
const STARTUP_CLEANUP_VERSION = '2026-06-04-safe-startup-cleanup-v1'
const STARTUP_CLEANUP_VERSION_KEY = 'gruzvill_startup_cleanup_version'

const AUTH_AND_USER_KEYS = [
  'state.user.tokens',
  'state.user.user',
  'config',
  'taxi_raw_log_v1',
  'taxi_raw_session_id_v1',
  'taxi_raw_device_id_v1',
  'taxi_flow_log_v1',
  'taxi_flow_scenario_v1',
  'taxi_frontend_debug_log_v1',
  'taxi_frontend_debug_snapshots_v1',
  'user_lang',
  APP_CACHE_VERSION_KEY,
  STARTUP_CLEANUP_VERSION_KEY,
]

// Only runtime/derived/test data. Auth, user tokens, language, config and logs stay untouched.
// Emulator running state is intentionally preserved: if a tester leaves the page/reloads
// after a long pause, the panel should restore and re-create fresh local orders instead of
// silently showing "stopped" while auth remains active. Order ids/route caches are still cleaned.
const BOOT_LOCAL_REMOVE_EXACT = [
  'orsRouteCache.v1',
  'cachedDriverMapState',
  'hiddenOrders',
  'driverOffers',
  'driverVotingParticipations',
  'driverVotingArrived',
  'driverStartedVotingOrderIds',
  'passengerConfirmedDriverChoices',
  'passengerConfirmedDriverChoiceStartedAt',
  'passengerPickupEtaByOrderDriver',
  'passengerRejectedDriverChoices',
  'passengerChoiceOrderModes',
  'passengerChoiceSearchRestartedAt',
  'passengerChoiceWaitingExtensionSeconds',
  'gruzvill_last_browser_geolocation',
  'gruzvill_browser_emulator_driver_order_ids_v2',
  'gruzvill_browser_emulator_client_order_ids_v2',
  'gruzvill_browser_emulator_driver_locations_v1',
  'gruzvill_client_order_emulator_owner_map_v2',
  'state.clientOrder.from',
  'state.clientOrder.to',
  'state.clientOrder.comments',
  'state.clientOrder.time',
  'state.clientOrder.customerPrice',
  'state.clientOrder.pickupPrice',
]


// One-time cleanup for this cleanup/build version. Kept separate from BOOT_LOCAL_REMOVE_EXACT
// so the app does not create a new set of test accounts on every reload.
const VERSIONED_LOCAL_REMOVE_EXACT = [
  'gruzvill_client_order_emulator_accounts_v2',
  'gruzvill_browser_emulator_driver_ids_v2',
  'gruzvill_browser_emulator_client_ids_v2',
]

const BOOT_LOCAL_REMOVE_PREFIXES = [
  'emu:',
  'activeOrders:',
  'selectedOrder:',
  'mapDraft:',
  'route:',
  'testdata:',
  'driver-route-cache:',
  'passenger-route-cache:',
]

const BOOT_SESSION_REMOVE_PREFIXES = [
  'emu:',
  'activeOrders:',
  'selectedOrder:',
  'mapDraft:',
  'route:',
  'testdata:',
]

const BOOT_SESSION_REMOVE_EXACT = [
  'gruzvill_last_browser_geolocation',
  'cachedDriverMapState',
]

const LEGACY_INDEXED_DB_NAMES = [
  'gruzvill-emulator',
  'gruzvill_emulator',
  'gruzvill-orders-cache',
  'gruzvill_orders_cache',
  'taxi-emulator',
  'taxi_emulator',
  'tdm-emulator',
  'tdm_emulator',
]

const LEGACY_INDEXED_DB_PREFIXES = [
  'emu-',
  'emulator-',
  'orders-cache-',
  'testdata-',
  'gruzvill-emulator-',
  'tdm-emulator-',
]

const APP_CACHE_PREFIXES = [
  'app-shell-',
  'runtime-api-',
  'map-tiles-',
  'workbox-',
  'webpack-',
]

function currentVersionKey() {
  return [
    version.name,
    version.version,
    version.buildTimestamp,
  ].filter(Boolean).join(':')
}

function safeStorage(kind: 'localStorage' | 'sessionStorage') {
  try {
    if (typeof window === 'undefined') return null
    return window[kind]
  } catch (_) {
    return null
  }
}

function storageKeys(storage: Storage | null) {
  if (!storage) return []

  try {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[]
  } catch (_) {
    return []
  }
}

function safeRemoveStorageItem(storage: Storage | null, key: string, storageType: string, reason: string) {
  if (!storage) return false
  if (AUTH_AND_USER_KEYS.includes(key)) return false

  try {
    if (storage.getItem(key) === null) return false
    storage.removeItem(key)
    writeRawLog('STORAGE_KEY_REMOVED', {
      source: 'startup-cleanup',
      storageType,
      key,
      reason,
      cleanupVersion: STARTUP_CLEANUP_VERSION,
    })
    return true
  } catch (error) {
    writeRawLog('STORAGE_KEY_REMOVE_FAILED', {
      source: 'startup-cleanup',
      storageType,
      key,
      reason,
      message: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

function removeExactAndPrefixedKeys(
  storage: Storage | null,
  storageType: 'localStorage' | 'sessionStorage',
  exactKeys: string[],
  prefixes: string[],
) {
  const removed: string[] = []
  exactKeys.forEach(key => {
    if (safeRemoveStorageItem(storage, key, storageType, 'startup-runtime-exact'))
      removed.push(key)
  })

  storageKeys(storage).forEach(key => {
    if (AUTH_AND_USER_KEYS.includes(key)) return
    if (prefixes.some(prefix => key.startsWith(prefix))) {
      if (safeRemoveStorageItem(storage, key, storageType, 'startup-runtime-prefix'))
        removed.push(key)
    }
  })

  return removed
}

async function estimateStorageUsage(phase: 'before' | 'after') {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate) return

    writeRawLog('STORAGE_USAGE_ESTIMATE', {
      source: 'startup-cleanup',
      phase,
      usage: estimate.usage ?? null,
      quota: estimate.quota ?? null,
      usageDetails: (estimate as any).usageDetails ?? null,
    })
  } catch (_) {
    // Optional telemetry only.
  }
}

function deleteIndexedDb(name: string) {
  return new Promise<void>(resolve => {
    try {
      const request = window.indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    } catch (_) {
      resolve()
    }
  })
}

async function cleanupLegacyIndexedDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return []

  const deleted: string[] = []
  try {
    const indexedDbAny = window.indexedDB as any
    const listed = typeof indexedDbAny.databases === 'function' ? await indexedDbAny.databases() : []
    const names = Array.isArray(listed) && listed.length ?
      listed.map((item: any) => item?.name).filter(Boolean) :
      LEGACY_INDEXED_DB_NAMES

    for (const name of names) {
      const isLegacy = LEGACY_INDEXED_DB_NAMES.includes(name) || LEGACY_INDEXED_DB_PREFIXES.some(prefix => name.startsWith(prefix))
      if (!isLegacy) continue

      await deleteIndexedDb(name)
      deleted.push(name)
      writeRawLog('IDB_DATABASE_DELETED', {
        source: 'startup-cleanup',
        dbName: name,
        reason: 'legacy-emulator-or-order-cache',
        cleanupVersion: STARTUP_CLEANUP_VERSION,
      })
    }
  } catch (error) {
    writeRawLog('IDB_CLEANUP_FAILED', {
      source: 'startup-cleanup',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return deleted
}

async function cleanupNamedBrowserCaches(nextVersion: string, forceAllAppCaches: boolean) {
  if (typeof window === 'undefined' || !('caches' in window)) return []

  const deleted: string[] = []
  try {
    const names = await window.caches.keys()
    await Promise.all(names.map(async name => {
      const isAppCache = APP_CACHE_PREFIXES.some(prefix => name.startsWith(prefix))
      const isVersionedStale = isAppCache && (forceAllAppCaches || !name.includes(nextVersion))
      if (!isVersionedStale) return

      await window.caches.delete(name)
      deleted.push(name)
      writeRawLog('CACHE_DELETED', {
        source: 'startup-cleanup',
        cacheName: name,
        reason: 'stale-app-cache',
        cleanupVersion: STARTUP_CLEANUP_VERSION,
      })
    }))
  } catch (error) {
    writeRawLog('CACHE_CLEANUP_FAILED', {
      source: 'startup-cleanup',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return deleted
}

async function cleanupLegacyServiceWorkers() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return []

  const removed: string[] = []
  try {
    const registrations = await navigator.serviceWorker.getRegistrations()
    await Promise.all(registrations.map(async registration => {
      const scope = registration.scope || ''
      const isLegacy = scope.includes('/legacy/') || scope.includes('/old-sw/') || scope.includes('/service-worker.js')
      if (!isLegacy) return

      const result = await registration.unregister()
      if (result) removed.push(scope)
      writeRawLog('SW_UNREGISTERED', {
        source: 'startup-cleanup',
        scope,
        result,
        reason: 'legacy-or-disabled-service-worker',
      })
    }))
  } catch (error) {
    writeRawLog('SW_CLEANUP_FAILED', {
      source: 'startup-cleanup',
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return removed
}

function logStorageScan(localKeys: string[], sessionKeys: string[]) {
  writeRawLog('STORAGE_SCAN_RESULT', {
    source: 'startup-cleanup',
    cleanupVersion: STARTUP_CLEANUP_VERSION,
    localKeys: localKeys.slice(0, 120),
    sessionKeys: sessionKeys.slice(0, 120),
    preservedKeys: AUTH_AND_USER_KEYS,
  })
}

function runAsyncCleanup(nextVersion: string, forceAllAppCaches: boolean) {
  estimateStorageUsage('before')
    .catch(() => null)
    .then(() => Promise.all([
      cleanupLegacyIndexedDb(),
      cleanupNamedBrowserCaches(nextVersion, forceAllAppCaches),
      cleanupLegacyServiceWorkers(),
    ]))
    .then(([deletedIdb, deletedCaches, unregisteredSw]) => {
      writeRawLog('STARTUP_ASYNC_CLEANUP_DONE', {
        source: 'startup-cleanup',
        cleanupVersion: STARTUP_CLEANUP_VERSION,
        deletedIdb,
        deletedCaches,
        unregisteredSw,
      })
      return estimateStorageUsage('after')
    })
    .catch(error => {
      writeRawLog('STARTUP_ASYNC_CLEANUP_FAILED', {
        source: 'startup-cleanup',
        cleanupVersion: STARTUP_CLEANUP_VERSION,
        message: error instanceof Error ? error.message : String(error),
      })
    })
}

export function resetStaleAppCache() {
  if (typeof window === 'undefined')
    return

  const localStorage = safeStorage('localStorage')
  const sessionStorage = safeStorage('sessionStorage')
  const nextVersion = currentVersionKey()
  const previousVersion = localStorage?.getItem(APP_CACHE_VERSION_KEY) || null
  const previousCleanupVersion = localStorage?.getItem(STARTUP_CLEANUP_VERSION_KEY) || null
  const isNewBuild = previousVersion !== nextVersion
  const isNewCleanupVersion = previousCleanupVersion !== STARTUP_CLEANUP_VERSION
  const startedAt = Date.now()
  const beforeLocalKeys = storageKeys(localStorage)
  const beforeSessionKeys = storageKeys(sessionStorage)

  writeRawLog('STARTUP_CLEANUP_BEGIN', {
    source: 'startup-cleanup',
    cleanupVersion: STARTUP_CLEANUP_VERSION,
    appVersion: nextVersion,
    previousVersion,
    previousCleanupVersion,
    isNewBuild,
    isNewCleanupVersion,
    path: window.location?.pathname || '',
    isSecureContext: window.isSecureContext,
  })
  logStorageScan(beforeLocalKeys, beforeSessionKeys)

  const removedLocalKeys = removeExactAndPrefixedKeys(
    localStorage,
    'localStorage',
    BOOT_LOCAL_REMOVE_EXACT,
    BOOT_LOCAL_REMOVE_PREFIXES,
  )
  const removedVersionedLocalKeys = (isNewBuild || isNewCleanupVersion) ?
    removeExactAndPrefixedKeys(
      localStorage,
      'localStorage',
      VERSIONED_LOCAL_REMOVE_EXACT,
      [],
    ) :
    []
  const removedSessionKeys = removeExactAndPrefixedKeys(
    sessionStorage,
    'sessionStorage',
    BOOT_SESSION_REMOVE_EXACT,
    BOOT_SESSION_REMOVE_PREFIXES,
  )

  try {
    localStorage?.setItem(APP_CACHE_VERSION_KEY, nextVersion)
    localStorage?.setItem(STARTUP_CLEANUP_VERSION_KEY, STARTUP_CLEANUP_VERSION)
  } catch (_) {
    // Storage may be disabled. The cleanup is still fail-soft.
  }

  writeRawLog('STARTUP_CLEANUP_DONE', {
    source: 'startup-cleanup',
    cleanupVersion: STARTUP_CLEANUP_VERSION,
    appVersion: nextVersion,
    durationMs: Date.now() - startedAt,
    removedLocalKeys,
    removedVersionedLocalKeys,
    removedSessionKeys,
    authPreserved: Boolean(localStorage?.getItem('state.user.tokens')),
  })

  runAsyncCleanup(nextVersion, isNewBuild || isNewCleanupVersion)
}
