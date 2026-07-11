import { all, race, fork, take, put, delay } from 'redux-saga/effects'
import moment from 'moment'
import { TAction } from '../../types'
import { EStatuses, EUserRoles, EOrderTypes, EBookingDriverState, EBookingStates, IOrder } from '../../types/types'
import SITE_CONSTANTS from '../../siteConstants'
import {
  WatchState,
  select, call, putResolve,
  concurrency, whileWatching,
} from '../../tools/sagaUtils'
import { updateCompletedOrderDuration } from '../../tools/order'
import { geopositionToPoint } from '../../tools/maps'
import { distanceBetweenEarthCoordinates } from '../../tools/utils'
import { getApiErrorMessage } from '../../tools/apiMessages'
import { getStableRemainingLifetimeSeconds } from '../../tools/reliableTime'
import { getPassengerConfirmedChoice } from '../../tools/driverOffer'
import { getVisibleBrowserEmulatorOrderIds, isAnyBrowserEmulatorModeRunning } from '../../tools/emulatorMode'
import { writeFlowEvent } from '../../tools/flowLog'
import { writeRawLog } from '../../tools/rawLog'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import { IRootState } from '..'
import { geoposition as geopositionSelector } from '../geolocation/selectors'
import { user as userSelector } from '../user/selectors'
import { getUserCars, drive as driveCar } from '../cars/actionCreators'
import { userPrimaryCar as userPrimaryCarSelector } from '../cars/selectors'
import { setSelectedOrder } from '../clientOrder/actionCreators'
import { closeAllModals, setMessageModal } from '../modals/actionCreators'
import { getAreasBetweenPoints } from '../areas/actionCreators'
import { ActionTypes } from './constants'
import {
  moduleSelector,
  activeOrders, readyOrders, historyOrders, MAX_DRIVER_VISIBLE_ORDER_DISTANCE_KM,
} from './selectors'

const ACTIVE_ORDERS_POLL_INTERVAL = 5000
const DRIVER_ACTIVE_ORDERS_POLL_INTERVAL = 5000
const READY_ORDERS_POLL_INTERVAL = 3000
const HISTORY_ORDERS_POLL_INTERVAL = 10000
const ORDER_POLL_INTERVAL = 5000

let lastAreasBetweenPointsKey = ''
const shownClientVotingTimeoutNotifications: Record<string, true> = {}

function isDriverEmulatorOnlyUiForcedEmpty(user: any) {
  return user?.u_role === EUserRoles.Driver && !isAnyBrowserEmulatorModeRunning()
}

function writeOrdersUiForcedEmpty(reason: string, type: 'activeOrders' | 'readyOrders' | 'historyOrders', previousOrders: IOrder[] = []) {
  const payload = {
    source: 'orders-saga',
    screen: 'OrdersSaga',
    uiState: 'EmulatorOnlyGate',
    reason,
    type,
    previousCount: previousOrders.length,
    previousOrderIds: previousOrders.map(order => order.b_id),
    visibleEmulatorOrderIds: getVisibleBrowserEmulatorOrderIds(),
  }

  writeFlowEvent('ORDERS_UI_FORCED_EMPTY', { data: payload })
  writeRawLog('ORDERS_UI_FORCED_EMPTY', payload)
}

function isAndroidChromeRuntime() {
  if (typeof navigator === 'undefined')
    return false

  const ua = navigator.userAgent || ''
  return /Android/i.test(ua) && /Chrome|CriOS|EdgA|SamsungBrowser/i.test(ua)
}

function getAdaptivePollInterval(baseInterval: number) {
  // На Android Chrome карта + polling + countdown могут подвешивать render
  // pipeline. Не ломаем логику, но немного разгружаем частые опросы.
  return isAndroidChromeRuntime() ? Math.max(baseInterval, Math.round(baseInterval * 1.75)) : baseInterval
}

export function* saga() {
  yield all([
    concurrency({
      action: [
        ActionTypes.GET_ACTIVE_ORDERS_REQUEST,
        ActionTypes.CREATE_SUCCESS,
      ],
      saga: getActiveOrdersSaga,
      parallelKey: 0,
      sequenceKey: {},
      leading: ({ type }) => type === ActionTypes.GET_ACTIVE_ORDERS_REQUEST ||
        undefined,
      latest: ({ type }) => type === ActionTypes.CREATE_SUCCESS || undefined,
    }, {
      action: ActionTypes.GET_READY_ORDERS_REQUEST,
      saga: getReadyOrdersSaga,
      parallelKey: 0,
      sequenceKey: {},
      leading: true,
    }, {
      action: ActionTypes.GET_HISTORY_ORDERS_REQUEST,
      saga: getHistoryOrdersSaga,
      parallelKey: 0,
      sequenceKey: {},
      leading: true,
    }, {
      action: [
        ActionTypes.GET_ORDER_REQUEST,
        ActionTypes.UPDATE_SUCCESS,
      ],
      saga: getOrderSaga,
      parallelKey: 1,
      sequenceKey: ({ payload }: TAction) => payload,
      leading: ({ type, payload }: TAction) =>
        type !== ActionTypes.UPDATE_SUCCESS ? payload : undefined,
      latest: ({ type, payload }: TAction) =>
        type === ActionTypes.UPDATE_SUCCESS ? payload : undefined,
    }),
    whileWatching(
      ActionTypes.WATCH_ACTIVE_ORDERS, ActionTypes.UNWATCH_ACTIVE_ORDERS,
      watchActiveOrdersSaga,
    ),
    whileWatching(
      ActionTypes.WATCH_READY_ORDERS, ActionTypes.UNWATCH_READY_ORDERS,
      watchReadyOrdersSaga,
    ),
    whileWatching(
      ActionTypes.WATCH_HISTORY_ORDERS, ActionTypes.UNWATCH_HISTORY_ORDERS,
      watchHistoryOrdersSaga,
    ),
    whileWatching(
      ActionTypes.WATCH_ORDER, ActionTypes.UNWATCH_ORDER,
      watchOrderSaga, ({ payload }: TAction) => payload,
    ),
  ])
}

function* watchActiveOrdersSaga() {
  const user = yield* select(userSelector)
  if (!user) {
    yield take()
    return
  }
  yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_REQUEST })
  yield take([
    ActionTypes.GET_ACTIVE_ORDERS_SUCCESS,
    ActionTypes.GET_ACTIVE_ORDERS_FAIL,
  ])
  const interval = user.u_role === EUserRoles.Driver ?
    DRIVER_ACTIVE_ORDERS_POLL_INTERVAL :
    ACTIVE_ORDERS_POLL_INTERVAL
  yield delay(getAdaptivePollInterval(interval))
}

function* watchReadyOrdersSaga() {
  if (!(yield* select(userSelector))) {
    yield take()
    return
  }
  yield put({ type: ActionTypes.GET_READY_ORDERS_REQUEST })
  yield take([
    ActionTypes.GET_READY_ORDERS_SUCCESS,
    ActionTypes.GET_READY_ORDERS_FAIL,
  ])
  yield delay(getAdaptivePollInterval(READY_ORDERS_POLL_INTERVAL))
}

function* watchHistoryOrdersSaga() {
  if (!(yield* select(userSelector))) {
    yield take()
    return
  }
  yield put({ type: ActionTypes.GET_HISTORY_ORDERS_REQUEST })
  yield take([
    ActionTypes.GET_HISTORY_ORDERS_SUCCESS,
    ActionTypes.GET_HISTORY_ORDERS_FAIL,
  ])
  yield delay(getAdaptivePollInterval(HISTORY_ORDERS_POLL_INTERVAL))
}

function* watchOrderSaga({ key: id }: WatchState<IOrder['b_id']>) {
  yield put({ type: ActionTypes.GET_ORDER_REQUEST, payload: id })
  yield take(({ type, payload }: TAction) =>
    type === ActionTypes.GET_ORDER_SUCCESS ?
      payload.b_id === id :
      type === ActionTypes.GET_ORDER_NOT_FOUND ?
        payload === id :
        type === ActionTypes.GET_ORDER_FAIL ?
          payload.id === id :
          false,
  )
  yield delay(getAdaptivePollInterval(ORDER_POLL_INTERVAL))
}


function getOrderDriverMap(order: IOrder | undefined | null) {
  const drivers = Array.isArray(order?.drivers) ? order!.drivers! : []
  return drivers.reduce((acc, driver) => {
    if (driver?.u_id !== undefined && driver?.u_id !== null)
      acc[String(driver.u_id)] = driver
    return acc
  }, {} as Record<string, any>)
}

function writeActiveOrderDiffFlowEvents(prevOrders: IOrder[] = [], nextOrders: IOrder[] = []) {
  const prevById = prevOrders.reduce((acc, order) => {
    acc[String(order.b_id)] = order
    return acc
  }, {} as Record<string, IOrder>)

  const nextById = nextOrders.reduce((acc, order) => {
    acc[String(order.b_id)] = order
    return acc
  }, {} as Record<string, IOrder>)

  const addedOrderIds = Object.keys(nextById).filter(id => !prevById[id])
  const removedOrderIds = Object.keys(prevById).filter(id => !nextById[id])
  const changedStateOrderIds: string[] = []

  Object.keys(nextById).forEach(orderId => {
    const prevOrder = prevById[orderId]
    const nextOrder = nextById[orderId]

    if (prevOrder && prevOrder.b_state !== nextOrder.b_state) {
      changedStateOrderIds.push(orderId)
      writeFlowEvent('ORDER_STATE_CHANGED', {
        orderId: nextOrder.b_id,
        screen: 'OrdersSaga',
        uiState: 'ActiveOrdersPolling',
        data: {
          fromState: prevOrder.b_state,
          toState: nextOrder.b_state,
          reason: 'poll_diff_applied',
        },
      })
    }

    const prevDrivers = getOrderDriverMap(prevOrder)
    const nextDrivers = getOrderDriverMap(nextOrder)

    Object.keys(nextDrivers).forEach(driverId => {
      const prevDriver = prevDrivers[driverId]
      const nextDriver = nextDrivers[driverId]
      if (!prevDriver) {
        writeFlowEvent('ORDER_MATCHING_EVALUATED', {
          orderId: nextOrder.b_id,
          driverId,
          screen: 'OrdersSaga',
          uiState: 'ActiveOrdersPolling',
          data: {
            result: 'accepted',
            reason: 'server_returned_driver_in_order',
            driverState: nextDriver?.c_state ?? null,
          },
        })
      } else if (prevDriver.c_state !== nextDriver.c_state) {
        writeFlowEvent('DRIVER_STATE_CHANGED', {
          orderId: nextOrder.b_id,
          driverId,
          screen: 'OrdersSaga',
          uiState: 'ActiveOrdersPolling',
          data: {
            fromState: prevDriver.c_state,
            toState: nextDriver.c_state,
            reason: 'poll_diff_applied',
          },
        })
      }
    })

    Object.keys(prevDrivers).forEach(driverId => {
      if (!nextDrivers[driverId]) {
        writeFlowEvent('ORDER_MATCHING_EVALUATED', {
          orderId: nextOrder.b_id,
          driverId,
          screen: 'OrdersSaga',
          uiState: 'ActiveOrdersPolling',
          data: {
            result: 'rejected',
            reason: 'server_removed_driver_from_order',
            previousDriverState: prevDrivers[driverId]?.c_state ?? null,
          },
        })
      }
    })
  })

  writeFlowEvent('POLL_DIFF_APPLIED', {
    screen: 'OrdersSaga',
    uiState: 'ActiveOrdersPolling',
    data: {
      type: 'activeOrders',
      previousCount: prevOrders.length,
      nextCount: nextOrders.length,
      addedOrderIds,
      removedOrderIds,
      changedStateOrderIds,
    },
  })
}


function summarizeDriverGeoposition(geoposition: any) {
  if (!geoposition?.coords)
    return null

  return {
    latitude: Number(geoposition.coords.latitude?.toFixed?.(6) ?? geoposition.coords.latitude),
    longitude: Number(geoposition.coords.longitude?.toFixed?.(6) ?? geoposition.coords.longitude),
    accuracy: geoposition.coords.accuracy ?? null,
    speed: geoposition.coords.speed ?? null,
    heading: geoposition.coords.heading ?? null,
    timestamp: geoposition.timestamp ?? null,
  }
}

function getOrderStartPoint(order: IOrder) {
  if (!order.b_start_latitude || !order.b_start_longitude)
    return null

  return {
    latitude: Number(order.b_start_latitude),
    longitude: Number(order.b_start_longitude),
  }
}

function getOrderDestinationPoint(order: IOrder) {
  if (!order.b_destination_latitude || !order.b_destination_longitude)
    return null

  return {
    latitude: Number(order.b_destination_latitude),
    longitude: Number(order.b_destination_longitude),
  }
}

function getOrderDistanceFromDriverKm(order: IOrder, driverGeoposition: any) {
  const startPoint = getOrderStartPoint(order)
  if (!startPoint || !driverGeoposition?.coords?.latitude || !driverGeoposition?.coords?.longitude)
    return null

  return distanceBetweenEarthCoordinates(
    driverGeoposition.coords.latitude,
    driverGeoposition.coords.longitude,
    startPoint.latitude,
    startPoint.longitude,
  )
}

function summarizeOrderLocationForAudit(order: IOrder, driverGeoposition: any, user: any, car: any) {
  const startPoint = getOrderStartPoint(order)
  const destinationPoint = getOrderDestinationPoint(order)
  const distanceFromDriverKm = getOrderDistanceFromDriverKm(order, driverGeoposition)
  const currentDriver = order.drivers?.find(driver => String(driver.u_id) === String(user?.u_id))
  const orderClassId = (order as any).b_car_class || (order as any).b_car_class_id || (order as any).cc_id || null
  const carClassId = (car as any)?.cc_id || (car as any)?.c_class_id || (car as any)?.car_class_id || null
  const distanceFilterDecision = getDistanceFilterDecision(order, driverGeoposition, user)

  return {
    orderId: order.b_id,
    orderState: order.b_state,
    orderType: (order as any).b_options?.customer_price ? 'offer' : 'active',
    startAddress: order.b_start_address ?? null,
    destinationAddress: order.b_destination_address ?? null,
    startPoint,
    destinationPoint,
    distanceFromDriverKm: distanceFromDriverKm === null ? null : Number(distanceFromDriverKm.toFixed(3)),
    driverLocation: summarizeDriverGeoposition(driverGeoposition),
    driverCity: user?.u_city ?? null,
    orderCity: (order as any).b_city ?? (order as any).b_city_id ?? null,
    driverInOrder: Boolean(currentDriver),
    driverStateInOrder: currentDriver?.c_state ?? null,
    requiredCarClassId: orderClassId,
    currentCarClassId: carClassId,
    maxVisibleDistanceKm: MAX_DRIVER_VISIBLE_ORDER_DISTANCE_KM,
    isCurrentDriverActiveTrip: isOrderCurrentDriverActiveTrip(order, user),
    ...distanceFilterDecision,
    hasStartCoordinates: Boolean(startPoint),
    hasDestinationCoordinates: Boolean(destinationPoint),
  }
}

function isOrderCurrentDriverActiveTrip(order: IOrder, user: any) {
  const state = order.drivers?.find(driver => String(driver.u_id) === String(user?.u_id))?.c_state
  return state !== undefined && [
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(state)
}

function getDistanceFilterDecision(order: IOrder, driverGeoposition: any, user: any) {
  const distanceFromDriverKm = getOrderDistanceFromDriverKm(order, driverGeoposition)
  if (distanceFromDriverKm === null)
    return {
      distanceFilterWouldHide: false,
      distanceFilterReason: 'distance_unavailable',
    }

  if (distanceFromDriverKm <= MAX_DRIVER_VISIBLE_ORDER_DISTANCE_KM)
    return {
      distanceFilterWouldHide: false,
      distanceFilterReason: 'inside_visible_radius',
    }

  if (isOrderCurrentDriverActiveTrip(order, user))
    return {
      distanceFilterWouldHide: false,
      distanceFilterReason: 'active_trip_kept_even_if_far',
    }

  return {
    distanceFilterWouldHide: true,
    distanceFilterReason: 'outside_visible_radius',
  }
}

function getOrderLocationDecisionReason(order: IOrder, driverGeoposition: any, user: any) {
  const currentDriver = order.drivers?.find(driver => String(driver.u_id) === String(user?.u_id))
  if (currentDriver)
    return 'server_returned_current_driver_in_order'
  if (!driverGeoposition?.coords)
    return 'driver_geolocation_missing'
  if (!getOrderStartPoint(order))
    return 'order_start_coordinates_missing'
  return 'server_returned_active_order_nearby_or_by_backend_filter'
}

function writeActiveOrderLocationAudit(
  event: 'ACTIVE_ORDER_LOCATION_EVALUATED' | 'ACTIVE_ORDER_FILTER_DECISION',
  order: IOrder,
  driverGeoposition: any,
  user: any,
  car: any,
  extraData: Record<string, any> = {},
) {
  const data = {
    ...summarizeOrderLocationForAudit(order, driverGeoposition, user, car),
    reason: getOrderLocationDecisionReason(order, driverGeoposition, user),
    ...extraData,
  }

  writeFlowEvent(event, {
    orderId: order.b_id,
    driverId: user?.u_id ?? null,
    screen: 'OrdersSaga',
    uiState: 'ActiveOrdersLocationAudit',
    data,
  })
  writeRawLog(event, {
    source: 'orders-saga',
    screen: 'OrdersSaga',
    uiState: 'ActiveOrdersLocationAudit',
    ...data,
    orderId: order.b_id,
    driverId: user?.u_id ?? null,
  })
}

function* getActiveOrdersSaga() {
  const prev = (yield* select(activeOrders)) ?? []
  const pollStartedAt = Date.now()
  const currentUserAtStart = yield* select(userSelector)

  if (isDriverEmulatorOnlyUiForcedEmpty(currentUserAtStart)) {
    writeFlowEvent('ACTIVE_ORDERS_REQUEST_SKIPPED', {
      driverId: currentUserAtStart?.u_id ?? null,
      screen: 'OrdersSaga',
      uiState: 'EmulatorOnlyGate',
      data: {
        reason: 'emulator_not_running',
        type: 'activeOrders',
        previousCount: prev.length,
        previousOrderIds: prev.map(order => order.b_id),
      },
    })
    writeRawLog('ACTIVE_ORDERS_REQUEST_SKIPPED', {
      source: 'orders-saga',
      screen: 'OrdersSaga',
      uiState: 'EmulatorOnlyGate',
      driverId: currentUserAtStart?.u_id ?? null,
      reason: 'emulator_not_running',
      type: 'activeOrders',
      previousCount: prev.length,
      previousOrderIds: prev.map(order => order.b_id),
    })
    yield put(setSelectedOrder(null))
    yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_SUCCESS, payload: [] })
    writeOrdersUiForcedEmpty('emulator_not_running', 'activeOrders', prev)
    return
  }

  writeFlowEvent('POLL_REQUEST', {
    screen: 'OrdersSaga',
    uiState: 'ActiveOrdersPolling',
    data: {
      type: 'activeOrders',
      previousCount: prev.length,
    },
  })
  writeFlowEvent('ACTIVE_ORDERS_REQUEST', {
    screen: 'OrdersSaga',
    uiState: 'ActiveOrdersPolling',
    data: {
      previousSelectorCount: prev.length,
      previousSelectorOrderIds: prev.map(order => order.b_id),
    },
  })
  writeRawLog('ACTIVE_ORDERS_REQUEST', {
    source: 'orders-saga',
    screen: 'OrdersSaga',
    uiState: 'ActiveOrdersPolling',
    previousSelectorCount: prev.length,
    previousSelectorOrderIds: prev.map(order => order.b_id),
  })

  try {
    const response = yield* call(API.getOrders, EOrderTypes.Active)
    const responseData = response as any
    const responseOrders: IOrder[] = Array.isArray(responseData?.data?.booking) ? responseData.data.booking : []

    writeFlowEvent('POLL_RESPONSE', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      data: {
        type: 'activeOrders',
        code: (response as any)?.code,
        count: responseOrders.length,
        durationMs: Date.now() - pollStartedAt,
      },
    })
    writeFlowEvent('ACTIVE_ORDERS_RESPONSE', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      data: {
        code: (response as any)?.code,
        responseCount: responseOrders.length,
        responseOrderIds: responseOrders.map(order => order.b_id),
        durationMs: Date.now() - pollStartedAt,
      },
    })
    writeRawLog('ACTIVE_ORDERS_RESPONSE', {
      source: 'orders-saga',
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      code: (response as any)?.code,
      responseCount: responseOrders.length,
      responseOrderIds: responseOrders.map(order => order.b_id),
      durationMs: Date.now() - pollStartedAt,
    })

    if ((response as any).code !== '200')
      throw response

    const driverGeoposition = yield* select(geopositionSelector)
    const currentUser = yield* select(userSelector)
    const currentCar = yield* select(userPrimaryCarSelector)

    writeFlowEvent('DRIVER_GEOLOCATION_SNAPSHOT', {
      driverId: currentUser?.u_id ?? null,
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      data: {
        source: 'before_active_orders_location_audit',
        driverLocation: summarizeDriverGeoposition(driverGeoposition),
        driverCity: currentUser?.u_city ?? null,
        driverStatus: currentUser?.u_active ? 'active' : 'inactive',
        carClassId: (currentCar as any)?.cc_id || (currentCar as any)?.c_class_id || (currentCar as any)?.car_class_id || null,
      },
    })
    writeRawLog('DRIVER_GEOLOCATION_SNAPSHOT', {
      source: 'orders-saga',
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      driverId: currentUser?.u_id ?? null,
      driverLocation: summarizeDriverGeoposition(driverGeoposition),
      driverCity: currentUser?.u_city ?? null,
      driverStatus: currentUser?.u_active ? 'active' : 'inactive',
      carClassId: (currentCar as any)?.cc_id || (currentCar as any)?.c_class_id || (currentCar as any)?.car_class_id || null,
    })

    let orders: IOrder[] = responseOrders.map(updateCompletedOrderDuration)
    orders.forEach(order => writeActiveOrderLocationAudit(
      'ACTIVE_ORDER_LOCATION_EVALUATED',
      order,
      driverGeoposition,
      currentUser,
      currentCar,
      {
        responseStage: 'api_response_before_store',
        responseOrderIds: responseOrders.map(item => item.b_id),
      },
    ))

    orders = yield* cancelExpiredOrdersSaga(orders)
    yield* notifyMissingExpiredVotingOrdersSaga(prev, orders)
    writeActiveOrderDiffFlowEvents(prev, orders)
    if (orders.length === 0)
      yield put(setSelectedOrder(null))

    yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_SUCCESS, payload: orders })
    const selectedActiveOrdersAfterStore: IOrder[] = (yield* select(activeOrders)) ?? []
    writeFlowEvent('ORDERS_STORE_UPDATED', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersStoreUpdate',
      data: {
        type: 'activeOrders',
        reducerPayloadCount: orders.length,
        selectorCount: selectedActiveOrdersAfterStore.length,
        reducerPayloadOrderIds: orders.map(order => order.b_id),
        selectorOrderIds: selectedActiveOrdersAfterStore.map(order => order.b_id),
      },
    })
    writeFlowEvent('ACTIVE_ORDERS_STORE_UPDATED', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersStoreUpdate',
      data: {
        reducerPayloadCount: orders.length,
        selectorCount: selectedActiveOrdersAfterStore.length,
        reducerPayloadOrderIds: orders.map(order => order.b_id),
        selectorOrderIds: selectedActiveOrdersAfterStore.map(order => order.b_id),
      },
    })
    writeFlowEvent('ACTIVE_ORDERS_SELECTOR_RESULT', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersSelectorResult',
      data: {
        selectorCount: selectedActiveOrdersAfterStore.length,
        selectorOrderIds: selectedActiveOrdersAfterStore.map(order => order.b_id),
      },
    })
    writeRawLog('ACTIVE_ORDERS_STORE_UPDATED', {
      source: 'orders-saga',
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersStoreUpdate',
      reducerPayloadCount: orders.length,
      selectorCount: selectedActiveOrdersAfterStore.length,
      reducerPayloadOrderIds: orders.map(order => order.b_id),
      selectorOrderIds: selectedActiveOrdersAfterStore.map(order => order.b_id),
    })
    writeRawLog('ACTIVE_ORDERS_SELECTOR_RESULT', {
      source: 'orders-saga',
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersSelectorResult',
      selectorCount: selectedActiveOrdersAfterStore.length,
      selectorOrderIds: selectedActiveOrdersAfterStore.map(order => order.b_id),
    })

    const selectorOrderIds = new Set(selectedActiveOrdersAfterStore.map(order => String(order.b_id)))
    orders.forEach(order => writeActiveOrderLocationAudit(
      'ACTIVE_ORDER_FILTER_DECISION',
      order,
      driverGeoposition,
      currentUser,
      currentCar,
      {
        responseStage: 'after_store_and_selector',
        inReducerPayload: true,
        inSelectorResult: selectorOrderIds.has(String(order.b_id)),
        selectorCount: selectedActiveOrdersAfterStore.length,
        selectorOrderIds: selectedActiveOrdersAfterStore.map(item => item.b_id),
        decision: selectorOrderIds.has(String(order.b_id)) ? 'visible_for_driver_ui' : 'hidden_by_selector_or_filter',
      },
    ))

    const geoposition = driverGeoposition
    if (geoposition) {
      const areaPoints = [
        ...orders
          .flatMap(order => [
            [order.b_start_latitude, order.b_start_longitude],
            [order.b_destination_latitude, order.b_destination_longitude],
          ])
          .filter(([lat, lng]) => lat && lng) as [number, number][],
        geopositionToPoint(geoposition),
      ]
      const areaKey = areaPoints
        .map(([lat, lng]) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`)
        .join('|')

      // Не пересчитываем зоны на каждом polling, если точки не менялись.
      // Это снижает нагрузку на Android Chrome при карте + списке заказов.
      if (areaKey && areaKey !== lastAreasBetweenPointsKey) {
        lastAreasBetweenPointsKey = areaKey
        yield put(getAreasBetweenPoints(areaPoints))
      }
    }

    yield fork(function*() {
      while (orders.length > 0) {
        const [keptOrders] = yield race([
          call(cancelOrdersOnNextExpireSaga, orders),
          take(ActionTypes.GET_ACTIVE_ORDERS_REQUEST),
        ])
        if (!keptOrders)
          break
        orders = keptOrders
        yield put({
          type: ActionTypes.GET_ACTIVE_ORDERS_SUCCESS,
          payload: orders,
        })
      }
    })

    yield* afterOrdersChangeSaga(prev, orders)
  }

  catch (error) {
    writeFlowEvent('POLL_RESPONSE', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      data: {
        type: 'activeOrders',
        result: 'failed',
        durationMs: Date.now() - pollStartedAt,
        message: getApiErrorMessage(error) || String(error),
      },
    })
    writeFlowEvent('ACTIVE_ORDERS_RESPONSE', {
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      data: {
        result: 'failed',
        durationMs: Date.now() - pollStartedAt,
        message: getApiErrorMessage(error) || String(error),
      },
    })
    writeRawLog('ACTIVE_ORDERS_RESPONSE', {
      source: 'orders-saga',
      screen: 'OrdersSaga',
      uiState: 'ActiveOrdersPolling',
      result: 'failed',
      durationMs: Date.now() - pollStartedAt,
      message: getApiErrorMessage(error) || String(error),
    })
    console.error(error)
    yield put({ type: ActionTypes.GET_ACTIVE_ORDERS_FAIL, payload: error })
  }
}

function* getReadyOrdersSaga() {
  const prev = (yield* select(readyOrders)) ?? []
  const currentUserAtStart = yield* select(userSelector)
  if (isDriverEmulatorOnlyUiForcedEmpty(currentUserAtStart)) {
    yield put({ type: ActionTypes.GET_READY_ORDERS_SUCCESS, payload: [] })
    writeOrdersUiForcedEmpty('emulator_not_running', 'readyOrders', prev)
    return
  }

  if ((yield* select(userPrimaryCarSelector)) === null)
    return

  try {
    const response = yield* call(API.getOrders, EOrderTypes.Ready)
    const responseData = response as any

    if (
      responseData.code === '404' &&
      responseData.data?.detail === 'used_car_not_found'
    ) {
      yield fork(function*() {
        const success = yield* drivePrimaryCarSaga()
        if (success)
          yield put({ type: ActionTypes.GET_READY_ORDERS_REQUEST })
      })
      return
    }

    if ((response as any).code !== '200')
      throw response
    const orders: IOrder[] = ((response as any).data?.booking ?? []).map(updateCompletedOrderDuration)
    yield put({ type: ActionTypes.GET_READY_ORDERS_SUCCESS, payload: orders })

    const geoposition = yield* select(geopositionSelector)
    if (geoposition) {
      yield put(getAreasBetweenPoints([
        ...orders
          .flatMap(order => [
            [order.b_start_latitude, order.b_start_longitude],
            [order.b_destination_latitude, order.b_destination_longitude],
          ])
          .filter(([lat, lng]) => lat && lng) as [number, number][],
        geopositionToPoint(geoposition),
      ]))
      yield put(getUserCars())
    }

    yield* afterOrdersChangeSaga(prev, orders)
  }

  catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_READY_ORDERS_FAIL, payload: error })
  }
}

function* getHistoryOrdersSaga() {
  const prev = (yield* select(historyOrders)) ?? []
  const currentUserAtStart = yield* select(userSelector)
  if (isDriverEmulatorOnlyUiForcedEmpty(currentUserAtStart)) {
    yield put({ type: ActionTypes.GET_HISTORY_ORDERS_SUCCESS, payload: [] })
    writeOrdersUiForcedEmpty('emulator_not_running', 'historyOrders', prev)
    return
  }

  try {
    const response = yield* call(API.getOrders, EOrderTypes.History)
    if ((response as any).code !== '200')
      throw response
    const orders: IOrder[] = ((response as any).data?.booking ?? []).map(updateCompletedOrderDuration)
    yield put({ type: ActionTypes.GET_HISTORY_ORDERS_SUCCESS, payload: orders })

    yield* afterOrdersChangeSaga(prev, orders)
  }

  catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_HISTORY_ORDERS_FAIL, payload: error })
  }
}

function* getOrderSaga({ payload: id }: TAction) {
  if (yield* select((state: IRootState) =>
    !moduleSelector(state).orders.get(id)?.mutations,
  )) {
    try {
      const order = yield* call(API.getOrder, id)
      if (order)
        yield put({ type: ActionTypes.GET_ORDER_SUCCESS, payload: order })
      else
        yield put({ type: ActionTypes.GET_ORDER_NOT_FOUND, payload: id })
    } catch (error) {
      yield put({ type: ActionTypes.GET_ORDER_FAIL, payload: { id, error } })
    }
  }
}

function* afterOrdersChangeSaga(prev: IOrder[], current: IOrder[]) {
  const currentIds = new Set(current.map(order => order.b_id))
  const diff = prev.filter(order => !currentIds.has(order.b_id))

  const existing =
    yield* select((state: IRootState) => moduleSelector(state).orders)
  for (const order of diff)
    if (existing.has(order.b_id))
      yield put({ type: ActionTypes.GET_ORDER_REQUEST, payload: order.b_id })
}

function getBookingDriverStateValue(state?: EBookingDriverState | string | number | null) {
  const value = Number(state)
  return Number.isFinite(value) ? value : undefined
}

function hasVotingSelectedDriver(order: IOrder) {
  return !!order.drivers?.some(driver => {
    const state = getBookingDriverStateValue(driver.c_state)
    return state !== undefined && [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].map(Number).includes(state)
  })
}

function getVotingCancelStartedAt(order: IOrder) {
  if (!order.b_start_datetime && !order.b_created)
    return null

  if (order.b_created && order.b_start_datetime) {
    const createdAt = +order.b_created
    const startAt = +order.b_start_datetime

    // Для voting-заказа таймер ожидания должен считаться от создания/старта,
    // но на некоторых конфигурациях b_start_datetime может приходить старым
    // или с другим часовым поясом. Тогда не отменяем заказ сразу после кнопки
    // «Голосовать», а берём более позднюю дату создания.
    return moment(Math.max(createdAt, startAt))
  }

  return order.b_created || order.b_start_datetime
}

function isVotingStillWaitingForDriver(order: IOrder) {
  return !!(
    order.b_voting &&
    order.b_state !== EBookingStates.Completed &&
    !getPassengerConfirmedChoice(order.b_id) &&
    !hasVotingSelectedDriver(order) &&
    (getVotingCancelStartedAt(order) || typeof order.remaining_lifetime_seconds === 'number')
  )
}

function getVotingCancelAt(order: IOrder) {
  if (!isVotingStillWaitingForDriver(order))
    return null

  const now = +moment()
  const stableRemaining = getStableRemainingLifetimeSeconds(order, now)
  if (stableRemaining !== null)
    return now + Math.max(0, stableRemaining) * 1000

  const startedAt = getVotingCancelStartedAt(order)
  if (!startedAt)
    return null

  return +startedAt +
    (order.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL) * 1000
}

function* showClientVotingTimeoutMessageSaga(order: IOrder) {
  if (shownClientVotingTimeoutNotifications[order.b_id])
    return

  if (!isVotingStillWaitingForDriver(order) ||
    hasVotingSelectedDriver(order) ||
    order.b_state === EBookingStates.Completed ||
    getPassengerConfirmedChoice(order.b_id))
    return

  shownClientVotingTimeoutNotifications[order.b_id] = true
  yield put(closeAllModals())
  yield put(setSelectedOrder(null))
  yield put(setMessageModal({
    isOpen: true,
    status: EStatuses.Warning,
    message: t(TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT),
  }))
}

function* notifyMissingExpiredVotingOrdersSaga(prev: IOrder[], current: IOrder[]) {
  const user = yield* select(userSelector)
  if (!user || user.u_role !== EUserRoles.Client)
    return

  const currentIds = new Set(current.map(order => order.b_id))
  const now = +moment()

  for (const order of prev) {
    const cancelAt = getVotingCancelAt(order)
    if (
      !currentIds.has(order.b_id) &&
      cancelAt &&
      cancelAt <= now
    )
      yield* showClientVotingTimeoutMessageSaga(order)
  }
}

function* cancelOrdersOnNextExpireSaga(orders: IOrder[]) {
  const nextCancel = orders.reduce((value, order) => {
    const cancelAt = getVotingCancelAt(order)
    return cancelAt ? Math.min(cancelAt, value) : value
  }, Infinity) - +moment()
  if (nextCancel === Infinity)
    return null
  yield delay(Math.max(nextCancel, 0))
  return yield* cancelExpiredOrdersSaga(orders)
}

function* cancelExpiredOrdersSaga(orders: IOrder[]) {
  const user = yield* select(userSelector)
  if (!user || user.u_role !== EUserRoles.Client)
    return orders

  const ordersToCancel: IOrder[] = []
  const keptOrders: IOrder[] = []
  const now = +moment()

  for (const order of orders) {
    const cancelAt = getVotingCancelAt(order)
    ;(
      cancelAt && cancelAt <= now ?
        ordersToCancel :
        keptOrders
    ).push(order)
  }

  for (const order of ordersToCancel) {
    try {
      yield* call(API.cancelDrive, order.b_id)
      yield* showClientVotingTimeoutMessageSaga(order)
    } catch (error) {
      console.error(error)
    }
  }

  return keptOrders
}

function* drivePrimaryCarSaga() {
  let car = yield* select(userPrimaryCarSelector)
  if (car === undefined)
    yield put(getUserCars())
  while (car === undefined) {
    yield take()
    car = yield* select(userPrimaryCarSelector)
  }
  if (car) {
    try {
      const response = yield* putResolve(driveCar(car))
      if (String(response.code) === '200')
        return true
      yield put(setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: getApiErrorMessage(response, { context: 'driver-order' }),
      }))
      return false
    } catch (error) {
      console.error(error)
    }
  }
  return false
}
