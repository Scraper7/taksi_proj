import { EBookingDriverState, IDriver, IOrder } from '../types/types'
import { getTimestamp } from './reliableTime'

const TRIP_STARTED_STORAGE_PREFIX = 'tdm_trip_started_at_v1'
const MAX_CLOCK_SKEW_MS = 60 * 1000

function getStoredStartedAtKey(order?: IOrder | null, driver?: IDriver | null) {
  const orderId = order?.b_id
  const driverId = driver?.u_id || driver?.c_id

  return orderId && driverId ? `${TRIP_STARTED_STORAGE_PREFIX}:${orderId}:${driverId}` : ''
}

function getFirstBackendTripStartedAt(order?: IOrder | null, driver?: IDriver | null) {
  return getTimestamp(
    driver?.c_started ||
    (driver as any)?.c_start_datetime ||
    (driver as any)?.c_started_at ||
    (driver as any)?.started_at ||
    (driver as any)?.startedAt ||
    (driver as any)?.trip_started_at ||
    (order as any)?.b_trip_started_at ||
    (order as any)?.b_drive_started_at,
  )
}

function getStoredTripStartedAt(key: string, now: number) {
  if (!key || typeof window === 'undefined')
    return null

  try {
    const value = Number(window.localStorage.getItem(key))
    if (Number.isFinite(value) && value > 0 && value <= now + MAX_CLOCK_SKEW_MS)
      return value
  } catch (error) {
    // localStorage can be blocked in private/restricted webviews. The timer still works from this render.
  }

  return null
}

function storeTripStartedAt(key: string, startedAt: number) {
  if (!key || typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(key, String(startedAt))
  } catch (error) {
    // Ignore storage errors; backend timestamps are still preferred on the next polling update.
  }
}

export function getDriverTripStartedAt(order?: IOrder | null, driver?: IDriver | null, now: number = Date.now()) {
  if (!order || !driver || driver.c_state !== EBookingDriverState.Started)
    return null

  const backendStartedAt = getFirstBackendTripStartedAt(order, driver)
  if (backendStartedAt) {
    storeTripStartedAt(getStoredStartedAtKey(order, driver), backendStartedAt)
    return backendStartedAt
  }

  const key = getStoredStartedAtKey(order, driver)
  const storedStartedAt = getStoredTripStartedAt(key, now)
  if (storedStartedAt)
    return storedStartedAt

  // Backend/emulator can switch c_state to Started before it sends c_started.
  // In that case we anchor the passenger timer to the first moment the frontend
  // actually sees the driver in Started state, not to order creation time.
  storeTripStartedAt(key, now)
  return now
}
