import { writeRawLog } from './rawLog'

type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike }

export type FlowEvent =
  | 'CREATE_ORDER'
  | 'ORDER_CREATED'
  | 'ORDER_SEARCH_STARTED'
  | 'ORDER_SEARCH_FINISHED'
  | 'ORDER_STATUS_CHANGED'
  | 'CANDIDATE_LIST_UPDATED'
  | 'CANDIDATE_ADDED'
  | 'CANDIDATE_REMOVED'
  | 'FIRST_DRIVER_DETECTED'
  | 'DRIVER_BECAME_LEADER'
  | 'DRIVER_LOST_LEADER_STATUS'
  | 'DRIVER_ETA_CHANGED'
  | 'DRIVER_DISTANCE_CHANGED'
  | 'DRIVER_STATUS_CHANGED'
  | 'DRIVER_STARTED_MOVING_TO_CLIENT'
  | 'DRIVER_MOVING_TO_CLIENT'
  | 'DRIVER_STOPPED_MOVING_TO_CLIENT'
  | 'SELECT_DRIVER'
  | 'CLIENT_SELECTED_DRIVER'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_CONFIRMED'
  | 'DRIVER_ARRIVED'
  | 'TRIP_CODE_GENERATED'
  | 'TRIP_CODE_ACCEPTED'
  | 'TRIP_CODE_REJECTED'
  | 'TRIP_STARTED'
  | 'TRIP_FINISHED'
  | 'LEAVE_REVIEW'
  | 'REVIEW_SUBMITTED'
  | 'REVIEW_SCREEN_FAILED'
  | 'REVIEW_SCREEN_OPEN'
  | 'REVIEW_SCREEN_OPENED'
  | 'REVIEW_REQUESTED'
  | 'REVIEW_ELIGIBILITY_CHECK'
  | 'ORDER_CANCEL_REQUESTED_BY_CLIENT'
  | 'ORDER_CANCELLED_BY_CLIENT'
  | 'ORDER_CANCELLED_BY_DRIVER'
  | 'ORDER_CANCELLED_BY_SYSTEM'
  | 'ERROR_SHOWN_TO_CLIENT'
  | 'ERROR_SHOWN_TO_DRIVER'
  | 'ORDER_STATE_CHANGED'
  | 'DRIVER_GEOLOCATION_SNAPSHOT'
  | 'ACTIVE_ORDER_LOCATION_EVALUATED'
  | 'ACTIVE_ORDER_FILTER_DECISION'
  | 'EMULATOR_MODE_CHANGED'
  | 'ACTIVE_ORDERS_REQUEST_SKIPPED'
  | 'ORDERS_UI_FORCED_EMPTY'
  | 'EMULATOR_STOP_CLEARED_UI_STATE'
  | 'MAP_ROUTE_RESET'
  | 'VISIBLE_EMULATOR_ORDER_IDS'
  | 'ACTIVE_ORDERS_REQUEST'
  | 'ACTIVE_ORDERS_RESPONSE'
  | 'ACTIVE_ORDERS_STORE_UPDATED'
  | 'ACTIVE_ORDERS_SELECTOR_RESULT'
  | 'ACTIVE_ORDERS_RENDERED'
  | 'MAP_ORDER'
  | 'MAP_ORDERS_RECEIVED'
  | 'ORDER_REMOVED'
  | 'ORDER_SNAPSHOT'
  | 'ORDER_BECAME_VISIBLE'
  | 'DRIVER_ORDER_LIST_UPDATED'
  | 'POLL_REQUEST'
  | 'POLL_RESPONSE'
  | 'POLL_DIFF_APPLIED'
  | 'ORDERS_SELECTOR_FILTERED'
  | 'ORDER_CARD_RENDERED'
  | 'ORDERS_VISIBLE_ON_SCREEN'
  | 'ORDERS_LIST_RENDERED'
  | 'ORDERS_STORE_UPDATED'
  | 'ORDER_MATCHING_EVALUATED'
  | 'DRIVER_ROUTE_REMOVED'
  | 'DRIVER_REMOVED_FROM_CANDIDATES'
  | 'BEST_DRIVER_CHANGED'
  | 'DRIVER_RANKING_UPDATED'
  | 'DRIVER_CANDIDATE_EVALUATED'
  | 'GEOFENCE_EXITED'
  | 'ROUTE_MAIN_REQUESTED'
  | 'ROUTE_MAIN_READY'
  | 'ROUTE_DRIVER_REQUESTED'
  | 'ROUTE_DRIVER_READY'
  | 'ROUTE_SOURCE_SELECTED'
  | 'ROUTE_REJECTED'
  | 'DRIVER_LOCATION_UPDATE'
  | 'MAP_POLYLINE_ADDED'
  | 'MAP_POLYLINE_REMOVED'
  | 'MAP_UPDATE_TRIGGERED'
  | 'GEOFENCE_ENTERED'
  | 'DRIVER_STATE_CHANGED'
  | 'PASSENGER_UI_FSM_RESOLVED'
  | 'PASSENGER_UI_FSM_LEGACY_DIFF'
  | 'PASSENGER_UI_FSM_STATE_CHANGED'

export interface FlowRecord {
  time: string
  timestamp: number
  event: FlowEvent
  scenario: string
  orderId?: string | number | null
  driverId?: string | number | null
  traceId?: string | null
  screen?: string
  uiState?: string
  data?: JsonLike
}

interface FlowLogData {
  scenario: string
  startedAt: string
  updatedAt: string
  steps: FlowRecord[]
}

export const FLOW_LOG_STORAGE_KEY = 'taxi_flow_log_v1'
const FLOW_SCENARIO_STORAGE_KEY = 'taxi_flow_scenario_v1'
const DEFAULT_SCENARIO = 'PassengerOrderFlow'
const MAX_FLOW_STEPS = 400
const MAX_DEPTH = 5
const MAX_ARRAY_ITEMS = 50
const MAX_STRING_LENGTH = 900

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
    // Browser storage may be blocked. Console diagnostics still stay available.
  }
}

function readScenario() {
  if (!isBrowser()) return DEFAULT_SCENARIO
  try {
    return window.localStorage.getItem(FLOW_SCENARIO_STORAGE_KEY) || DEFAULT_SCENARIO
  } catch (_) {
    return DEFAULT_SCENARIO
  }
}

function makeEmptyFlowLog(scenario = DEFAULT_SCENARIO): FlowLogData {
  const now = safeNowIso()
  return {
    scenario,
    startedAt: now,
    updatedAt: now,
    steps: [],
  }
}

function readFlowLog() {
  const scenario = readScenario()
  const data = readJsonStorage<FlowLogData | null>(FLOW_LOG_STORAGE_KEY, null)
  if (!data || !Array.isArray(data.steps))
    return makeEmptyFlowLog(scenario)

  return {
    scenario: data.scenario || scenario,
    startedAt: data.startedAt || safeNowIso(),
    updatedAt: data.updatedAt || safeNowIso(),
    steps: data.steps,
  }
}

function getPayloadId(payload: any, key: string) {
  const value = payload?.[key] ?? payload?.data?.[key]
  return value === undefined ? null : value
}

function getTraceId(payload: any, scenario: string, orderId?: string | number | null, driverId?: string | number | null) {
  const explicitTraceId = payload?.traceId ?? payload?.data?.traceId
  if (explicitTraceId)
    return String(explicitTraceId)

  if (orderId !== null && orderId !== undefined)
    return `order-${orderId}`

  if (driverId !== null && driverId !== undefined)
    return `driver-${driverId}`

  return `scenario-${scenario}`
}

function markPerformance(event: FlowEvent) {
  if (!isBrowser()) return

  try {
    const performanceApi = window.performance
    if (!performanceApi?.mark)
      return

    performanceApi.mark(`taxi.flow.${event}`)
  } catch (_) {}
}

export function setFlowScenario(scenario: string) {
  if (!scenario)
    return

  if (isBrowser()) {
    try {
      window.localStorage.setItem(FLOW_SCENARIO_STORAGE_KEY, scenario)
    } catch (_) {}
  }

  const current = readFlowLog()
  if (current.scenario !== scenario) {
    const next = makeEmptyFlowLog(scenario)
    writeJsonStorage(FLOW_LOG_STORAGE_KEY, next)
  }
}

export function writeFlowEvent(event: FlowEvent, payload: any = {}) {
  const scenario = readScenario()
  const flowLog = readFlowLog()
  const now = safeNowIso()
  const orderId = getPayloadId(payload, 'orderId') ?? getPayloadId(payload, 'b_id')
  const driverId = getPayloadId(payload, 'driverId') ?? getPayloadId(payload, 'u_id')
  const traceId = getTraceId(payload, scenario, orderId, driverId)
  const record: FlowRecord = {
    time: now,
    timestamp: Date.now(),
    event,
    scenario,
    orderId,
    driverId,
    traceId,
    screen: payload?.screen || payload?.data?.screen,
    uiState: payload?.uiState || payload?.data?.uiState,
    data: sanitize(payload?.data ?? payload),
  }

  const next: FlowLogData = {
    scenario,
    startedAt: flowLog.startedAt || now,
    updatedAt: now,
    steps: [...flowLog.steps, record].slice(-MAX_FLOW_STEPS),
  }

  markPerformance(event)
  writeJsonStorage(FLOW_LOG_STORAGE_KEY, next)

  try {
    // eslint-disable-next-line no-console
    console.info('[taxi-flow]', event, record)
  } catch (_) {}
}

export function getFlowLogSnapshot() {
  return readFlowLog()
}

export function clearFlowLog() {
  writeJsonStorage(FLOW_LOG_STORAGE_KEY, makeEmptyFlowLog(readScenario()))
}

export function getExpectedSuccessfulVotingTripSteps() {
  return [
    'CREATE_ORDER',
    'ORDER_SEARCH_STARTED',
    'FIRST_DRIVER_DETECTED',
    'SELECT_DRIVER',
    'DRIVER_STARTED_MOVING_TO_CLIENT',
    'DRIVER_ARRIVED',
    'TRIP_CODE_GENERATED',
    'TRIP_STARTED',
    'TRIP_FINISHED',
    'LEAVE_REVIEW',
  ]
}

export function validateSuccessfulVotingTrip(flowLog = readFlowLog()) {
  const expected = getExpectedSuccessfulVotingTripSteps()
  const actual = flowLog.steps.map(item => item.event)
  let actualIndex = 0
  const missing: string[] = []

  expected.forEach(step => {
    const foundIndex = actual.slice(actualIndex).indexOf(step as FlowEvent)
    if (foundIndex < 0) {
      // Some configs do not return/display a passenger trip code. In that case
      // the voting flow can still be successful if the trip started, finished,
      // and review was submitted. Keep the missing item visible as optional.
      if (step !== 'TRIP_CODE_GENERATED')
        missing.push(step)
      return
    }
    actualIndex += foundIndex + 1
  })

  const optionalMissing = expected
    .filter(step => step === 'TRIP_CODE_GENERATED' && !actual.includes(step as FlowEvent))

  return {
    scenario: flowLog.scenario,
    ok: missing.length === 0,
    expected,
    actual,
    missing,
    optionalMissing,
  }
}


export function getExpectedReviewFlowSteps() {
  return [
    'ORDER_CREATED',
    'CLIENT_SELECTED_DRIVER',
    'DRIVER_ARRIVED',
    'TRIP_STARTED',
    'TRIP_FINISHED',
    'REVIEW_SCREEN_OPENED',
  ]
}

function validateFlowByExpectedSteps(flowLog: FlowLogData, expected: string[]) {
  const actual = flowLog.steps.map(item => item.event)
  let actualIndex = 0
  const missing: string[] = []

  expected.forEach(step => {
    const foundIndex = actual.slice(actualIndex).indexOf(step as FlowEvent)
    if (foundIndex < 0) {
      missing.push(step)
      return
    }
    actualIndex += foundIndex + 1
  })

  return {
    scenario: flowLog.scenario,
    ok: missing.length === 0,
    expected,
    actual,
    missing,
  }
}

export function validateReviewFlow(flowLog = readFlowLog()) {
  return validateFlowByExpectedSteps(flowLog, getExpectedReviewFlowSteps())
}

export function getExpectedPassengerLifecycleSteps() {
  return [
    'ORDER_CREATED',
    'CLIENT_SELECTED_DRIVER',
    'DRIVER_CONFIRMED',
    'DRIVER_MOVING_TO_CLIENT',
    'DRIVER_ARRIVED',
    'TRIP_CODE_GENERATED',
    'TRIP_STARTED',
    'TRIP_FINISHED',
    'REVIEW_ELIGIBILITY_CHECK',
    'REVIEW_SCREEN_OPENED',
  ]
}

export function validatePassengerLifecycleFlow(flowLog = readFlowLog()) {
  return validateFlowByExpectedSteps(flowLog, getExpectedPassengerLifecycleSteps())
}

if (isBrowser()) {
  try {
    ;(window as any).__taxiFlow = {
      write: writeFlowEvent,
      get: getFlowLogSnapshot,
      clear: clearFlowLog,
      validateSuccessfulVotingTrip,
      validateReviewFlow,
      validatePassengerLifecycleFlow,
      flowCheck: validatePassengerLifecycleFlow,
    }
  } catch (_) {}
}
