import SITE_CONSTANTS from '../siteConstants'
import {
  EBookingDriverState,
  EBookingLocationKinds,
  EDriverResponseModes,
  EServices,
  IDriver,
  IOrder,
  IUser,
} from '../types/types'
import { getTimestamp } from './reliableTime'
import { writeRawLog } from './rawLog'

export const ORDER_MODE_OFFER = 'OFFER'
export const DRIVER_OFFER_LIFETIME_MS = 15 * 60 * 1000


export type DriverOfferClientResponseStatus =
  | 'waiting'
  | 'client_selected_this_driver'
  | 'client_selected_other_driver'
  | 'driver_confirmed'
  | 'driver_declined'

export interface IDriverOfferClientResponse {
  orderId: IOrder['b_id']
  userId?: IUser['u_id']
  status: DriverOfferClientResponseStatus
  createdAt: number
  responseAt: number
  outcome: 'client_selected_this_driver' | 'client_selected_other_driver'
  updatedAt: number
}

const DRIVER_OFFER_CLIENT_RESPONSE_STORAGE_KEY = 'driverOfferClientResponseSimulation'
const DRIVER_OFFER_CLIENT_RESPONSE_EVENT = 'driverOfferClientResponseChanged'

function readAllDriverOfferClientResponses(): Record<string, IDriverOfferClientResponse> {
  try {
    if (!canUseLocalStorage())
      return {}

    const value = window.localStorage.getItem(DRIVER_OFFER_CLIENT_RESPONSE_STORAGE_KEY)
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

function writeAllDriverOfferClientResponses(value: Record<string, IDriverOfferClientResponse>) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(DRIVER_OFFER_CLIENT_RESPONSE_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function driverOfferClientResponseKey(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  if (!orderId)
    return ''

  return `${userId || 'anonymous'}:${orderId}`
}

function getStableClientResponseSeed(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  const text = `${orderId || ''}:${userId || ''}`
  return text.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function getStableClientResponseDelayMs(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  const seed = getStableClientResponseSeed(orderId, userId)
  return 3000 + (seed % 6) * 1000
}

function getStableClientResponseOutcome(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null): 'client_selected_this_driver' | 'client_selected_other_driver' {
  const seed = getStableClientResponseSeed(orderId, userId)
  // Большинство тестовых предложений принимаем, но оставляем второй исход,
  // чтобы в эмуляторе можно было проверить и ветку «клиент выбрал другого».
  return seed % 4 === 0 ? 'client_selected_other_driver' : 'client_selected_this_driver'
}

function notifyDriverOfferClientResponseChanged(response: IDriverOfferClientResponse | null) {
  try {
    if (typeof window === 'undefined')
      return

    window.dispatchEvent(new CustomEvent(DRIVER_OFFER_CLIENT_RESPONSE_EVENT, {
      detail: response,
    }))
  } catch {
    // UI-only refresh event.
  }
}

function logDriverOfferClientResponseEvent(event: string, response: IDriverOfferClientResponse | null, extra: Record<string, any> = {}) {
  writeRawLog(event, {
    source: 'driver-offer-client-response-simulation',
    screen: 'DriverOffer',
    orderId: response?.orderId ?? extra.orderId ?? null,
    userId: response?.userId ?? extra.userId ?? null,
    status: response?.status ?? null,
    outcome: response?.outcome ?? null,
    responseAt: response?.responseAt ?? null,
    ...extra,
  })
}

function resolveDriverOfferClientResponseIfNeeded(response: IDriverOfferClientResponse, now = Date.now()) {
  if (response.status !== 'waiting' || now < response.responseAt)
    return response

  const nextResponse: IDriverOfferClientResponse = {
    ...response,
    status: response.outcome,
    updatedAt: now,
  }
  const all = readAllDriverOfferClientResponses()
  all[driverOfferClientResponseKey(response.orderId, response.userId)] = nextResponse
  writeAllDriverOfferClientResponses(all)
  notifyDriverOfferClientResponseChanged(nextResponse)
  logDriverOfferClientResponseEvent('CLIENT_OFFER_RESPONSE_SIMULATED', nextResponse)
  logDriverOfferClientResponseEvent(
    nextResponse.status === 'client_selected_this_driver' ? 'CLIENT_SELECTED_THIS_DRIVER' : 'CLIENT_SELECTED_OTHER_DRIVER',
    nextResponse,
  )
  return nextResponse
}

export function ensureDriverOfferClientResponse(
  orderId?: IOrder['b_id'] | null,
  userId?: IUser['u_id'] | null,
  createdAt = Date.now(),
  now = Date.now(),
) {
  const key = driverOfferClientResponseKey(orderId, userId)
  if (!key || !orderId)
    return null

  const all = readAllDriverOfferClientResponses()
  const existing = all[key]
  if (existing)
    return resolveDriverOfferClientResponseIfNeeded(existing, now)

  const safeCreatedAt = Number.isFinite(Number(createdAt)) && Number(createdAt) > 0 ? Number(createdAt) : now
  const response: IDriverOfferClientResponse = {
    orderId,
    userId: userId || undefined,
    status: 'waiting',
    createdAt: safeCreatedAt,
    responseAt: safeCreatedAt + getStableClientResponseDelayMs(orderId, userId),
    outcome: getStableClientResponseOutcome(orderId, userId),
    updatedAt: now,
  }
  all[key] = response
  writeAllDriverOfferClientResponses(all)
  notifyDriverOfferClientResponseChanged(response)
  logDriverOfferClientResponseEvent('DRIVER_OFFER_SENT', response)
  return resolveDriverOfferClientResponseIfNeeded(response, now)
}

export function getDriverOfferClientResponse(
  orderId?: IOrder['b_id'] | null,
  userId?: IUser['u_id'] | null,
  now = Date.now(),
) {
  const key = driverOfferClientResponseKey(orderId, userId)
  if (!key)
    return null

  const response = readAllDriverOfferClientResponses()[key]
  return response ? resolveDriverOfferClientResponseIfNeeded(response, now) : null
}

export function updateDriverOfferClientResponseStatus(
  orderId: IOrder['b_id'],
  userId: IUser['u_id'] | undefined,
  status: DriverOfferClientResponseStatus,
) {
  const key = driverOfferClientResponseKey(orderId, userId)
  if (!key)
    return null

  const all = readAllDriverOfferClientResponses()
  const existing = all[key]
  const now = Date.now()
  const nextResponse: IDriverOfferClientResponse = {
    ...(existing || {
      orderId,
      userId,
      createdAt: now,
      responseAt: now,
      outcome: status === 'client_selected_other_driver' ? 'client_selected_other_driver' : 'client_selected_this_driver',
    }),
    status,
    updatedAt: now,
  }
  all[key] = nextResponse
  writeAllDriverOfferClientResponses(all)
  notifyDriverOfferClientResponseChanged(nextResponse)
  if (status === 'driver_confirmed')
    logDriverOfferClientResponseEvent('DRIVER_OFFER_CONFIRMED', nextResponse)
  if (status === 'driver_declined')
    logDriverOfferClientResponseEvent('DRIVER_OFFER_DECLINED', nextResponse)
  return nextResponse
}

export function clearDriverOfferClientResponse(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  const key = driverOfferClientResponseKey(orderId, userId)
  if (!key)
    return

  const all = readAllDriverOfferClientResponses()
  delete all[key]
  writeAllDriverOfferClientResponses(all)
  notifyDriverOfferClientResponseChanged(null)
}

export function subscribeDriverOfferClientResponse(listener: () => void) {
  if (typeof window === 'undefined')
    return () => {}

  window.addEventListener(DRIVER_OFFER_CLIENT_RESPONSE_EVENT, listener)
  window.addEventListener('focus', listener)
  document.addEventListener('visibilitychange', listener)

  return () => {
    window.removeEventListener(DRIVER_OFFER_CLIENT_RESPONSE_EVENT, listener)
    window.removeEventListener('focus', listener)
    document.removeEventListener('visibilitychange', listener)
  }
}

const DRIVER_OFFERS_STORAGE_KEY = 'driverOffers'

const PASSENGER_CONFIRMED_CHOICE_STORAGE_KEY = 'passengerConfirmedDriverChoices'

const PASSENGER_PICKUP_ETA_STORAGE_KEY = 'passengerPickupEtaByOrderDriver'
type TPassengerPickupEtaMap = Record<string, string>

function readPassengerPickupEtaMap(): TPassengerPickupEtaMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_PICKUP_ETA_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePassengerPickupEtaMap(map: TPassengerPickupEtaMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_PICKUP_ETA_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function getPickupEtaStorageKeys(orderId?: IOrder['b_id'] | null, driver?: Pick<IDriver, 'u_id' | 'c_id'> | null) {
  if (!orderId || !driver)
    return []

  return [driver.u_id, driver.c_id]
    .filter(value => value !== undefined && value !== null && String(value).trim() !== '')
    .map(value => `${orderId}:${value}`)
}

export function setPassengerPickupEta(orderId?: IOrder['b_id'] | null, driver?: Pick<IDriver, 'u_id' | 'c_id'> | null, etaText?: string | null) {
  if (!etaText || !String(etaText).trim())
    return

  const keys = getPickupEtaStorageKeys(orderId, driver)
  if (!keys.length)
    return

  const map = readPassengerPickupEtaMap()
  const nextEta = String(etaText).trim()
  let changed = false
  keys.forEach(key => {
    if (map[key] !== nextEta) {
      map[key] = nextEta
      changed = true
    }
  })
  if (!changed)
    return

  writePassengerPickupEtaMap(map)
  try {
    window.dispatchEvent(new CustomEvent('passengerPickupEtaChanged', {
      detail: { orderId, driverId: driver?.u_id, carId: driver?.c_id, eta: nextEta },
    }))
  } catch {
    // Event is only for instant UI refresh; localStorage value is already saved.
  }
}

export function getPassengerPickupEta(orderId?: IOrder['b_id'] | null, driver?: Pick<IDriver, 'u_id' | 'c_id'> | null) {
  const keys = getPickupEtaStorageKeys(orderId, driver)
  if (!keys.length)
    return ''

  const map = readPassengerPickupEtaMap()
  const eta = keys.map(key => map[key]).find(Boolean) || ''
  return isSafePassengerPickupEta(eta) ? eta : ''
}

function isSafePassengerPickupEta(value: unknown) {
  if (!value)
    return true

  const text = String(value).toLowerCase()
  const numbers = text.match(/\d+/g)?.map(Number) ?? []
  const firstNumber = numbers[0] ?? 0
  const minutes = /С‡Р°СЃ|час|hour/.test(text) ? firstNumber * 60 : firstNumber

  return !minutes || minutes <= 180
}

const PASSENGER_REJECTED_CHOICES_STORAGE_KEY = 'passengerRejectedDriverChoices'
const PASSENGER_CHOICE_ORDER_MODE_STORAGE_KEY = 'passengerChoiceOrderModes'
const PASSENGER_CONFIRMED_CHOICE_STARTED_AT_STORAGE_KEY = 'passengerConfirmedDriverChoiceStartedAt'
const PASSENGER_CHOICE_SEARCH_RESTART_STORAGE_KEY = 'passengerChoiceSearchRestartedAt'
const PASSENGER_CHOICE_WAITING_EXTENSION_STORAGE_KEY = 'passengerChoiceWaitingExtensionSeconds'

type TPassengerChoiceMap = Record<string, string>
type TPassengerChoiceStartedAtMap = Record<string, number>
type TPassengerChoiceSearchRestartMap = Record<string, number>
type TPassengerChoiceWaitingExtensionMap = Record<string, number>
type TPassengerRejectedChoiceMap = Record<string, string[]>
type TStoredChoiceOrderMode = 'voting' | 'offer' | 'order'
type TPassengerChoiceOrderModeMap = Record<string, TStoredChoiceOrderMode>

function canUseLocalStorage() {
  return typeof window !== 'undefined' && !!window.localStorage
}

function readPassengerChoiceMap(): TPassengerChoiceMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_CONFIRMED_CHOICE_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePassengerChoiceMap(map: TPassengerChoiceMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_CONFIRMED_CHOICE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function readPassengerChoiceStartedAtMap(): TPassengerChoiceStartedAtMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_CONFIRMED_CHOICE_STARTED_AT_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePassengerChoiceStartedAtMap(map: TPassengerChoiceStartedAtMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_CONFIRMED_CHOICE_STARTED_AT_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function readPassengerRejectedChoiceMap(): TPassengerRejectedChoiceMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_REJECTED_CHOICES_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePassengerRejectedChoiceMap(map: TPassengerRejectedChoiceMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_REJECTED_CHOICES_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function readPassengerChoiceSearchRestartMap(): TPassengerChoiceSearchRestartMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_CHOICE_SEARCH_RESTART_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePassengerChoiceSearchRestartMap(map: TPassengerChoiceSearchRestartMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_CHOICE_SEARCH_RESTART_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function readPassengerChoiceWaitingExtensionMap(): TPassengerChoiceWaitingExtensionMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_CHOICE_WAITING_EXTENSION_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writePassengerChoiceWaitingExtensionMap(map: TPassengerChoiceWaitingExtensionMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_CHOICE_WAITING_EXTENSION_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

function notifyPassengerChoiceWaitingExtensionChanged(orderId?: IOrder['b_id'] | null) {
  try {
    if (typeof window === 'undefined' || !orderId)
      return

    window.dispatchEvent(new CustomEvent('passengerChoiceWaitingExtensionChanged', {
      detail: { orderId: String(orderId) },
    }))
  } catch {
    // ignore UI-only integration events.
  }
}

function notifyPassengerChoiceCanceled(orderId: IOrder['b_id'], userId?: IUser['u_id'] | null) {
  try {
    if (typeof window === 'undefined' || !orderId)
      return

    const detail = { orderId: String(orderId), userId: userId ? String(userId) : '' }
    window.dispatchEvent(new CustomEvent('passengerCanceledDriverChoice', { detail }))
    window.dispatchEvent(new CustomEvent('driver-emulator-choice-cancel', { detail }))
  } catch {
    // ignore UI-only integration events.
  }
}

function notifyPassengerRejectedChoicesChanged(orderId: IOrder['b_id'], userId?: IUser['u_id'] | null) {
  try {
    if (typeof window === 'undefined' || !orderId)
      return

    const detail = { orderId: String(orderId), userId: userId ? String(userId) : '' }
    window.dispatchEvent(new CustomEvent('passengerRejectedChoicesChanged', { detail }))
  } catch {
    // ignore UI-only integration events.
  }
}

function readStoredChoiceOrderModes(): TPassengerChoiceOrderModeMap {
  try {
    if (!canUseLocalStorage())
      return {}

    const raw = window.localStorage.getItem(PASSENGER_CHOICE_ORDER_MODE_STORAGE_KEY)
    if (!raw)
      return {}

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeStoredChoiceOrderModes(map: TPassengerChoiceOrderModeMap) {
  try {
    if (!canUseLocalStorage())
      return

    window.localStorage.setItem(PASSENGER_CHOICE_ORDER_MODE_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // localStorage may be blocked in private/tracking-prevention modes.
  }
}

export function getStoredChoiceOrderMode(orderId?: IOrder['b_id'] | null): TStoredChoiceOrderMode | null {
  if (!orderId)
    return null

  const mode = readStoredChoiceOrderModes()[String(orderId)]
  return mode || null
}

export function setStoredChoiceOrderMode(orderId?: IOrder['b_id'] | null, mode?: TStoredChoiceOrderMode | null) {
  if (!orderId || !mode)
    return

  const map = readStoredChoiceOrderModes()
  map[String(orderId)] = mode
  writeStoredChoiceOrderModes(map)
}

export function clearStoredChoiceOrderMode(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return

  const map = readStoredChoiceOrderModes()
  delete map[String(orderId)]
  writeStoredChoiceOrderModes(map)
}

export function getPassengerConfirmedChoice(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return null

  return readPassengerChoiceMap()[String(orderId)] || null
}

export function getPassengerConfirmedChoiceStartedAt(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | string | number | null) {
  if (!orderId)
    return null

  const selectedUserId = getPassengerConfirmedChoice(orderId)
  if (userId && selectedUserId && String(selectedUserId) !== String(userId))
    return null

  const orderKey = String(orderId)
  const startedAtMap = readPassengerChoiceStartedAtMap()
  const value = startedAtMap[orderKey]
  const numericValue = Number(value)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    // Старые сохранённые отметки выбора не должны превращаться в таймеры вида
    // "В пути 131:00" после долгого фонового ожидания/перезагрузки.
    const maxTrustedAgeMs = 90 * 60 * 1000
    if (Date.now() - numericValue <= maxTrustedAgeMs)
      return numericValue

    const refreshedStartedAt = Date.now()
    startedAtMap[orderKey] = refreshedStartedAt
    writePassengerChoiceStartedAtMap(startedAtMap)
    return refreshedStartedAt
  }

  // Если выбор уже сохранён, но время ещё не записано (старые модалки/обновление
  // страницы/задержка backend), стартуем таймер с текущего UI-момента, а не с
  // момента отклика кандидата. Иначе «в пути» сразу показывало 20-30 секунд.
  if (selectedUserId) {
    const startedAt = Date.now()
    startedAtMap[orderKey] = startedAt
    writePassengerChoiceStartedAtMap(startedAtMap)
    return startedAt
  }

  return null
}

export function setPassengerConfirmedChoice(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  if (!orderId || !userId)
    return

  const map = readPassengerChoiceMap()
  map[String(orderId)] = String(userId)
  writePassengerChoiceMap(map)

  const startedAtMap = readPassengerChoiceStartedAtMap()
  startedAtMap[String(orderId)] = Date.now()
  writePassengerChoiceStartedAtMap(startedAtMap)

  const restartMap = readPassengerChoiceSearchRestartMap()
  delete restartMap[String(orderId)]
  writePassengerChoiceSearchRestartMap(restartMap)

  try {
    const detail = { orderId: String(orderId), userId: String(userId) }
    window.dispatchEvent(new CustomEvent('passengerConfirmedDriverChoice', { detail }))
    // Browser driver emulator listens to this event, so after passenger clicks
    // a candidate the selected test driver can leave waiting mode and start moving.
    window.dispatchEvent(new CustomEvent('driver-emulator-choice', { detail }))
  } catch {
    // ignore
  }
}

export function clearPassengerConfirmedChoice(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  if (!orderId)
    return

  const map = readPassengerChoiceMap()
  delete map[String(orderId)]
  writePassengerChoiceMap(map)

  const startedAtMap = readPassengerChoiceStartedAtMap()
  delete startedAtMap[String(orderId)]
  writePassengerChoiceStartedAtMap(startedAtMap)

  notifyPassengerChoiceCanceled(orderId, userId)
}

export function getPassengerRejectedChoices(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return []

  const list = readPassengerRejectedChoiceMap()[String(orderId)]
  return Array.isArray(list) ? list.filter(Boolean).map(String) : []
}

export function addPassengerRejectedChoice(orderId?: IOrder['b_id'] | null, userId?: IUser['u_id'] | null) {
  if (!orderId || !userId)
    return

  const map = readPassengerRejectedChoiceMap()
  const key = String(orderId)
  const next = Array.from(new Set([
    ...(Array.isArray(map[key]) ? map[key].map(String) : []),
    String(userId),
  ]))
  map[key] = next
  writePassengerRejectedChoiceMap(map)
  notifyPassengerRejectedChoicesChanged(orderId, userId)
  notifyPassengerChoiceCanceled(orderId, userId)
}

export function restartPassengerChoiceSearch(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return

  const map = readPassengerChoiceSearchRestartMap()
  map[String(orderId)] = Date.now()
  writePassengerChoiceSearchRestartMap(map)
}

export function getPassengerChoiceSearchRestartedAt(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return null

  const value = readPassengerChoiceSearchRestartMap()[String(orderId)]
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null
}

const PASSENGER_CHOICE_WAITING_EXTENSION_MAX_SECONDS = 27 * 60

export function getPassengerChoiceWaitingExtensionSeconds(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return 0

  const value = readPassengerChoiceWaitingExtensionMap()[String(orderId)]
  const numberValue = Number(value)
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.min(PASSENGER_CHOICE_WAITING_EXTENSION_MAX_SECONDS, Math.round(numberValue)) : 0
}

export function addPassengerChoiceWaitingExtensionSeconds(orderId?: IOrder['b_id'] | null, additionalSeconds: number = 180) {
  if (!orderId)
    return 0

  const safeAdditional = Number.isFinite(Number(additionalSeconds)) ? Math.max(0, Math.round(Number(additionalSeconds))) : 0
  const map = readPassengerChoiceWaitingExtensionMap()
  const key = String(orderId)
  const current = getPassengerChoiceWaitingExtensionSeconds(orderId)
  const next = Math.min(PASSENGER_CHOICE_WAITING_EXTENSION_MAX_SECONDS, current + safeAdditional)
  map[key] = next
  writePassengerChoiceWaitingExtensionMap(map)
  notifyPassengerChoiceWaitingExtensionChanged(orderId)
  return next
}

export function clearPassengerChoiceWaitingExtension(orderId?: IOrder['b_id'] | null) {
  if (!orderId)
    return

  const map = readPassengerChoiceWaitingExtensionMap()
  const key = String(orderId)
  if (!(key in map))
    return

  delete map[key]
  writePassengerChoiceWaitingExtensionMap(map)
  notifyPassengerChoiceWaitingExtensionChanged(orderId)
}


export function isVisibleChoiceDriverState(state?: EBookingDriverState | number | null) {
  return [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ].includes(Number(state) as EBookingDriverState)
}


export function getChoiceDriverIdsToReleaseBeforeChoosing(order?: IOrder | null, nextCandidateId?: IUser['u_id'] | string | number | null) {
  if (!order || !nextCandidateId)
    return []

  const nextId = String(nextCandidateId)
  const releaseIds = (order.drivers ?? [])
    .filter(driver => {
      const driverId = String(driver.u_id ?? '')
      if (!driverId)
        return false

      if (driverId === nextId)
        return driver.c_state === EBookingDriverState.Canceled

      return driver.c_state === EBookingDriverState.Performer
    })
    .map(driver => String(driver.u_id))

  return Array.from(new Set(releaseIds))
}

function safeChoiceErrorString(error: any) {
  try {
    return JSON.stringify(error)
  } catch {
    return String(error || '')
  }
}

function getChoiceDriverApiErrorText(error: any) {
  return [
    error?.message,
    error?.error,
    error?.info,
    error?.reason,
    error?.data?.message,
    error?.data?.error,
    error?.data?.info,
    error?.response?.data?.message,
    error?.response?.data?.error,
    safeChoiceErrorString(error),
  ].filter(Boolean).join(' ').toLowerCase()
}

export function isChoiceDriverSelectionBlockedError(error: any) {
  const text = getChoiceDriverApiErrorText(error)

  return text.includes('already performer') ||
    text.includes('already selected') ||
    text.includes('already assigned') ||
    text.includes('booking driver state 2') ||
    text.includes('driver state 2') ||
    text.includes('performer already') ||
    text.includes('has performer') ||
    text.includes('driver already') ||
    text.includes('not available') ||
    text.includes('not selectable') ||
    text.includes('unable to choose') ||
    text.includes('unable to select') ||
    text.includes('failed to choose') ||
    text.includes('failed to select') ||
    text.includes('не удалось выбрать') ||
    text.includes('невозможно выполнить') ||
    text.includes('уже назнач') ||
    text.includes('уже выбран') ||
    text.includes('занят')
}

export type DriverOfferStatus = 'sent' | 'accepted' | 'rejected' | 'expired' | string

export interface IDriverOfferPayload {
  price: number
  eta: string
  freeSeats?: number
  comment?: string
}

export interface IStoredDriverOffer extends IDriverOfferPayload {
  orderId: IOrder['b_id']
  userId?: IUser['u_id']
  carId?: string
  status: DriverOfferStatus
  createdAt: number
  expiresAt: number
}

function normalizeMode(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function getRuntimeConfigName() {
  try {
    const params = new URLSearchParams(window.location.search)
    return (params.get('config') || localStorage.getItem('config') || '').toLowerCase()
  } catch {
    return ''
  }
}

export function isGruzvillConfig() {
  return getRuntimeConfigName().includes('gruzvill')
}

function isIntercityLocationClass(locationClassId?: unknown) {
  if (locationClassId === null || locationClassId === undefined || locationClassId === '')
    return false

  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.some(item =>
    String(item.id) === String(locationClassId) &&
    item.kind === EBookingLocationKinds.Intercity,
  )
}


function normalizeResponseMode(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

export function isTrueLike(value: unknown) {
  if (value === true)
    return true
  if (value === false || value === null || value === undefined)
    return false

  if (typeof value === 'number')
    return Number.isFinite(value) && value > 0

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (!normalized || ['0', 'false', 'no', 'off', 'null', 'undefined'].includes(normalized))
      return false
    return ['1', 'true', 'yes', 'on', 'voting', 'vote', 'голос', 'голосование'].includes(normalized)
  }

  return false
}

function normalizeServiceValues(value: unknown): unknown[] {
  if (Array.isArray(value))
    return value

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text)
      return []

    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed))
        return parsed
    } catch {
      // fall through to loose split
    }

    return text.split(/[\s,;|]+/g)
  }

  return [value]
}

function hasVotingService(order: IOrder | null) {
  const services = (order as any)?.b_services
  if (!services)
    return false

  return normalizeServiceValues(services).some(value => {
    if (Number(value) === EServices.Voting)
      return true

    const normalized = String(value ?? '').trim().toLowerCase()
    return normalized === 'voting' || normalized === 'vote' || normalized === 'голосование' || normalized === 'голос'
  })
}

function hasStoredVotingMode(order: IOrder | null) {
  return getStoredChoiceOrderMode(order?.b_id) === 'voting'
}

function hasStoredOfferMode(order: IOrder | null) {
  return getStoredChoiceOrderMode(order?.b_id) === 'offer'
}

export function isStoredSimpleOrderMode(order: IOrder | null) {
  return getStoredChoiceOrderMode(order?.b_id) === 'order'
}

export function isVotingOrder(order: IOrder | null) {
  if (!order)
    return false

  if (isStoredSimpleOrderMode(order))
    return false

  if (hasStoredVotingMode(order) || hasVotingService(order))
    return true

  const rawOrder = order as any
  const options = normalizeOfferObject(rawOrder?.b_options) as any
  const serviceText = JSON.stringify(rawOrder?.b_services ?? '').toLowerCase()
  const rawText = [
    rawOrder?.b_type,
    rawOrder?.b_mode,
    rawOrder?.mode,
    rawOrder?.order_mode,
    rawOrder?.b_order_mode,
    rawOrder?.b_custom_comment,
    rawOrder?.b_comment,
    JSON.stringify(options),
  ].filter(Boolean).join(' ').toLowerCase()

  return isTrueLike(rawOrder?.b_voting) ||
    isTrueLike(options?.b_voting) ||
    isTrueLike(options?.voting) ||
    serviceText.includes('voting') ||
    rawText.includes('voting') ||
    rawText.includes('голос')
}

export function getIntercityLocationClassIds() {
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
    .filter(item => item.kind === EBookingLocationKinds.Intercity)
    .map(item => item.id)
}

export function getDefaultIntercityLocationClassId() {
  return getIntercityLocationClassIds()[0]
}

export function getDefaultCityLocationClassId() {
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
    .find(item => item.kind === EBookingLocationKinds.City)?.id ??
    SITE_CONSTANTS.DEFAULT_BOOKING_LOCATION_CLASS
}

export function getCandidateResponseBookingCommentIds() {
  return Object.values(SITE_CONSTANTS.BOOKING_COMMENTS)
    .filter(comment => normalizeResponseMode(comment.responseMode) === EDriverResponseModes.Candidate)
    .map(comment => comment.id)
}

export function getOfferResponseBookingCommentIds() {
  const candidateIds = getCandidateResponseBookingCommentIds()
  if (candidateIds.length)
    return candidateIds

  // В старом Truck-flow часть конфигов помечала отклик водителя
  // комментариями 95/96. Используем их только если они реально есть
  // в текущем справочнике, чтобы не создавать новую схему поверх backend.
  const legacyOfferCommentIds = ['95', '96'].filter(id => id in SITE_CONSTANTS.BOOKING_COMMENTS)
  if (legacyOfferCommentIds.length)
    return legacyOfferCommentIds

  return normalizeResponseMode(SITE_CONSTANTS.DRIVER_RESPONSE_MODE) === EDriverResponseModes.ByOrder ?
    candidateIds :
    []
}

export function hasOfferOrderSupport() {
  // Offer/voting are product flows, not runtime config flags.
  // Test/prod configs can differ by constants, but the feature must remain available everywhere.
  return true
}

export function isIntercityOrderLocationClass(locationClassId?: unknown) {
  return isIntercityLocationClass(locationClassId)
}

function hasIntercityLocationClass(order: IOrder | null) {
  return isIntercityLocationClass(order?.b_location_class)
}

function hasIntercityCarClass(order: IOrder | null) {
  if (!order?.b_car_class)
    return false

  const carClass = SITE_CONSTANTS.CAR_CLASSES[String(order.b_car_class)]
  if (!carClass?.booking_location_classes?.length)
    return false

  return carClass.booking_location_classes.some(isIntercityLocationClass)
}

export function getOrderMode(order: IOrder | null) {
  const rawOrder = order as any
  const options = normalizeOfferObject(rawOrder?.b_options)
  return normalizeMode(
    rawOrder?.order_mode ??
    rawOrder?.b_order_mode ??
    rawOrder?.b_mode ??
    rawOrder?.mode ??
    options.order_mode ??
    options.b_order_mode ??
    options.offer_mode ??
    options.driver_offer_mode ??
    options.mode,
  )
}

function hasOfferMarkerComment(order: IOrder | null) {
  const ids = getOfferResponseBookingCommentIds()
  return !!ids.length && !!order?.b_comments?.some(id => ids.includes(String(id)))
}

export function isOfferOrder(order: IOrder | null) {
  const voting = isVotingOrder(order)
  if (voting)
    return false

  if (isStoredSimpleOrderMode(order))
    return false

  if (hasStoredOfferMode(order))
    return true

  // Old backend offer schema: passenger offer orders are created with b_cars_count=0.
  // Keep this explicit marker so offer/voting UI and emulator do not treat the order
  // as a normal direct performer order after active-order reloads.
  if (String((order as any)?.b_cars_count) === '0')
    return true

  const mode = getOrderMode(order)
  if (mode === ORDER_MODE_OFFER)
    return true

  const options = normalizeOfferObject(order?.b_options) as any

  // Candidate/response comments can appear on ordinary city orders after the
  // first driver response. Do not treat them as OFFER by themselves, otherwise
  // a normal order switches to offer in the top plaque as soon as a driver
  // appears. OFFER is detected by stored passenger mode, explicit order mode,
  // intercity customer price, b_only_offer or explicit offer options.

  if (
    !voting &&
    (options.customer_price !== undefined || options.customerPrice !== undefined) &&
    (hasIntercityLocationClass(order) || hasIntercityCarClass(order))
  )
    return true

  if ((order as any)?.b_only_offer === true || Number((order as any)?.b_only_offer) === 1)
    return true

  if (
    options.offer_mode === true ||
    options.driver_offer_mode === true ||
    options.driver_offer === true ||
    normalizeMode(options.offer_mode) === ORDER_MODE_OFFER ||
    normalizeMode(options.driver_offer_mode) === ORDER_MODE_OFFER
  )
    return true

  // Do not infer OFFER from candidate responses or generic candidateMode alone.
  // In gruzvill normal city orders can get candidate
  // records too, and the passenger plaque was incorrectly switching to Offer
  // right after the first driver appeared. OFFER must be explicit: stored mode,
  // order mode/options, intercity customer price, marker comment, or b_only_offer.
  return false
}

export function isChoiceOrder(order: IOrder | null) {
  return isVotingOrder(order) || isOfferOrder(order)
}

function storageKey(orderId: IOrder['b_id'], userId?: IUser['u_id']) {
  return `${userId || 'anonymous'}:${orderId}`
}

function readAllStoredOffers(): Record<string, IStoredDriverOffer> {
  try {
    const value = localStorage.getItem(DRIVER_OFFERS_STORAGE_KEY)
    return value ? JSON.parse(value) : {}
  } catch {
    return {}
  }
}

function writeAllStoredOffers(value: Record<string, IStoredDriverOffer>) {
  localStorage.setItem(DRIVER_OFFERS_STORAGE_KEY, JSON.stringify(value))
}

export function getStoredDriverOffer(
  orderId: IOrder['b_id'],
  userId?: IUser['u_id'],
) {
  return readAllStoredOffers()[storageKey(orderId, userId)] ?? null
}

export function saveStoredDriverOffer(
  orderId: IOrder['b_id'],
  userId: IUser['u_id'] | undefined,
  payload: IDriverOfferPayload,
  status: DriverOfferStatus = 'sent',
  carId?: string,
) {
  const all = readAllStoredOffers()
  const now = Date.now()
  const offer: IStoredDriverOffer = {
    ...payload,
    orderId,
    userId,
    carId,
    status,
    createdAt: now,
    expiresAt: now + DRIVER_OFFER_LIFETIME_MS,
  }
  all[storageKey(orderId, userId)] = offer
  if (carId)
    all[storageKey(orderId, carId)] = offer
  writeAllStoredOffers(all)
  return offer
}

export function updateStoredDriverOfferStatus(
  orderId: IOrder['b_id'],
  userId: IUser['u_id'] | undefined,
  status: DriverOfferStatus,
) {
  const all = readAllStoredOffers()
  const key = storageKey(orderId, userId)
  const offer = all[key]
  if (!offer)
    return null

  const nextOffer = { ...offer, status }
  all[key] = nextOffer
  writeAllStoredOffers(all)
  return nextOffer
}

export function removeStoredDriverOffer(
  orderId: IOrder['b_id'],
  userId?: IUser['u_id'],
) {
  const all = readAllStoredOffers()
  delete all[storageKey(orderId, userId)]
  writeAllStoredOffers(all)
}

export function isDriverOfferExpired(offer?: Pick<IStoredDriverOffer, 'expiresAt' | 'status'> | null) {
  if (!offer)
    return false

  return offer.status === 'expired' || Date.now() >= offer.expiresAt
}

function numberFromUnknown(value: unknown) {
  if (value === null || value === undefined || value === '')
    return undefined

  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function firstFilledOfferValue(...values: any[]) {
  return values.find(value =>
    value !== undefined &&
    value !== null &&
    (typeof value !== 'string' || value.trim() !== '')
  )
}

function normalizeOfferObject(value: any): Record<string, any> {
  if (!value)
    return {}

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  return typeof value === 'object' ? value : {}
}

function normalizeOfferStatus(value: unknown): DriverOfferStatus | undefined {
  const status = normalizeMode(value).toLowerCase()
  if (!status)
    return undefined

  if (status.includes('accept')) return 'accepted'
  if (status.includes('reject') || status.includes('cancel')) return 'rejected'
  if (status.includes('expire')) return 'expired'
  if (status.includes('sent') || status.includes('pending') || status.includes('wait')) return 'sent'
  return status
}

export function getOfferEvent(order: IOrder | null, userId?: IUser['u_id']) {
  const rawOrder = order as any
  const rawDriver = order?.drivers?.find(driver => driver.u_id === userId) as any

  if (rawDriver?.c_state === EBookingDriverState.Canceled)
    return 'rejected'

  const rawOptions = normalizeOfferObject(rawDriver?.c_options)

  return normalizeOfferStatus(
    rawOrder?.offer_event ??
    rawOrder?.driver_offer_event ??
    rawOrder?.event?.type ??
    rawOrder?.last_event?.type ??
    rawOrder?.b_options?.offer_event ??
    rawOrder?.b_options?.driver_offer_event ??
    rawDriver?.offer_event ??
    rawOptions.offer_event,
  )
}

export function getBackendDriverOffer(order: IOrder | null, userId?: IUser['u_id']) {
  const rawOrder = order as any
  const rawDriver = order?.drivers?.find(driver => driver.u_id === userId) as any
  const rawOptions = normalizeOfferObject(rawDriver?.c_options)
  const rawDriverData = normalizeOfferObject(rawDriver?.c_data ?? rawDriver?.data)
  const rawCandidateOffer = Object.keys(rawOptions).length && (
    rawOptions.driver_offer_mode === ORDER_MODE_OFFER ||
    rawOptions.driver_offer_price !== undefined ||
    rawOptions.driver_offer_eta !== undefined ||
    rawOptions.driver_offer_free_seats !== undefined ||
    rawOptions.driver_offer_comment !== undefined ||
    rawOptions.performers_price !== undefined
  ) ? {
      price: firstFilledOfferValue(rawOptions.driver_offer_price, rawOptions.performers_price, rawOptions.price),
      eta: firstFilledOfferValue(rawOptions.driver_offer_eta, rawOptions.c_pickup_time, rawOptions.eta, rawOptions.pickup_time, rawOptions.arrival_time, rawOptions.time, rawDriver?.c_pickup_time, rawDriverData.c_pickup_time),
      freeSeats: firstFilledOfferValue(rawOptions.driver_offer_free_seats, rawOptions.freeSeats, rawOptions.free_seats, rawOptions.seats),
      comment: firstFilledOfferValue(rawOptions.driver_offer_comment, rawOptions.c_comment, rawOptions.comment, rawOptions.driver_comment, rawDriver?.c_comment, rawDriverData.c_comment),
      status: rawDriver?.c_state === EBookingDriverState.Canceled ? 'rejected' : 'sent',
    } : null

  const optionsDriverOffer = normalizeOfferObject(rawOptions.driver_offer)
  const optionsOffer = normalizeOfferObject(rawOptions.offer)
  const rawOffer =
    rawOrder?.driver_offer ??
    rawOrder?.my_offer ??
    rawOrder?.offer ??
    rawOrder?.b_options?.driver_offer ??
    rawOrder?.b_options?.my_offer ??
    rawDriver?.driver_offer ??
    rawDriver?.offer ??
    (Object.keys(optionsDriverOffer).length ? optionsDriverOffer : undefined) ??
    (Object.keys(optionsOffer).length ? optionsOffer : undefined) ??
    rawCandidateOffer

  if (!rawOffer)
    return null

  const createdAt = getTimestamp(
    rawOffer.createdAt ?? rawOffer.created_at ?? rawOffer.datetime ?? rawOffer.date ?? Date.now(),
  ) ?? Date.now()
  const expiresAt = getTimestamp(
    rawOffer.expiresAt ?? rawOffer.expires_at ?? rawOffer.expired_at ?? rawOffer.expire_datetime ?? 0,
  ) ?? 0

  return {
    orderId: order?.b_id ?? rawOffer.orderId ?? rawOffer.order_id,
    userId,
    price: numberFromUnknown(firstFilledOfferValue(rawOffer.price, rawOffer.driver_price, rawOffer.performers_price)) ?? 0,
    eta: String(firstFilledOfferValue(rawOffer.eta, rawOffer.c_pickup_time, rawOffer.pickup_time, rawOffer.arrival_time, rawOffer.time, rawDriver?.c_pickup_time, rawDriverData.c_pickup_time) ?? ''),
    freeSeats: numberFromUnknown(firstFilledOfferValue(rawOffer.freeSeats, rawOffer.free_seats, rawOffer.seats)) ?? 0,
    comment: String(firstFilledOfferValue(rawOffer.comment, rawOffer.c_comment, rawOffer.driver_comment, rawDriver?.c_comment, rawDriverData.c_comment) ?? ''),
    status: normalizeOfferStatus(rawOffer.status ?? rawOffer.state ?? rawOffer.type) ?? 'sent',
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : Date.now() + DRIVER_OFFER_LIFETIME_MS,
  } as IStoredDriverOffer
}

export function getOfferCount(order: IOrder | null) {
  const rawOrder = order as any
  return numberFromUnknown(
    rawOrder?.offers_count ??
    rawOrder?.offer_count ??
    rawOrder?.driver_offers_count ??
    rawOrder?.b_options?.offers_count ??
    rawOrder?.b_options?.offer_count,
  )
}

export function isOfferAcceptedForDriver(order: IOrder | null, userId?: IUser['u_id']) {
  const driver = order?.drivers?.find(item => item.u_id === userId)
  // Для OFFER состояние Considering означает только отправленное предложение.
  // Назначенной поездкой считаем только Performer и следующие состояния.
  return !!driver && driver.c_state >= EBookingDriverState.Performer
}
