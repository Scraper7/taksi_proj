import { List as ImmutableList, is } from 'immutable'
import { createSelector, weakMapMemoize } from 'reselect'
import { IOrder, ICar, EBookingDriverState, EUserRoles } from '../../types/types'
import { estimateOrder } from '../../tools/order'
import {
  filterOrdersForBrowserEmulator,
  filterOrderDriversForBrowserEmulator,
  isAnyBrowserEmulatorModeRunning,
  isBrowserEmulatorRunning,
  isLocalBrowserEmulatorOrder,
  shouldHideOrderFromNormalMode,
} from '../../tools/emulatorMode'
import {
  IWayGraph,
  calculateDistance, geopositionToPoint,
} from '../../tools/maps'
import { IRootState } from '../'
import { geoposition } from '../geolocation/selectors'
import { userPrimaryCar } from '../cars/selectors'
import { user as currentUser } from '../user/selectors'
import { wayGraph } from '../areas/selectors'
import { moduleName } from './constants'

const GEOLOCATION_CHANGE_THRESHOLD_METERS = 100
export const MAX_DRIVER_VISIBLE_ORDER_DISTANCE_KM = 80

function shouldUseStrictEmulatorOnlyOrders(user: any) {
  return user?.u_role === EUserRoles.Driver
}

function shouldForceEmptyDriverOrders(user: any) {
  return shouldUseStrictEmulatorOnlyOrders(user) && !isAnyBrowserEmulatorModeRunning()
}

function filterOrdersForStrictDriverEmulatorMode(
  orders: IOrder[] | null,
  kind: 'active' | 'ready' | 'history',
  user: any,
): IOrder[] | null {
  if (!shouldUseStrictEmulatorOnlyOrders(user))
    return filterOrdersForBrowserEmulator(orders, kind) as IOrder[] | null

  if (shouldForceEmptyDriverOrders(user))
    return []

  return filterOrdersForBrowserEmulator(orders, kind) as IOrder[] | null
}

function getCurrentDriverStateInOrder(order: IOrder, userID?: string | null) {
  if (!userID)
    return undefined

  return order.drivers?.find(driver => String(driver.u_id) === String(userID))?.c_state
}

function isCurrentDriverActiveTrip(order: IOrder, userID?: string | null) {
  const state = getCurrentDriverStateInOrder(order, userID)
  return state !== undefined && [
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(state)
}

function getOrderEmptyMileageKm(order: IOrder) {
  const value = Number((order as any).emptyMileageKm)
  return Number.isFinite(value) ? value : null
}

function filterOrdersByDriverDistance(orders: IOrder[] | null, user: any) {
  if (!orders || user?.u_role !== EUserRoles.Driver)
    return orders

  return orders.filter(order => {
    const emptyMileageKm = getOrderEmptyMileageKm(order)
    if (emptyMileageKm === null)
      return true

    if (emptyMileageKm <= MAX_DRIVER_VISIBLE_ORDER_DISTANCE_KM)
      return true

    // Если водитель уже выполняет поездку, не прячем её даже при плохом GPS/тестовых координатах.
    return isCurrentDriverActiveTrip(order, user?.u_id)
  })
}

function isDriverRelatedActiveOrder(order: IOrder, userID?: string | null) {
  if (!userID)
    return false

  return !!order.drivers?.some(driver =>
    String(driver.u_id) === String(userID) &&
    [
      EBookingDriverState.Considering,
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  )
}

function restoreDriverRelatedOrdersAfterEmulatorFilter(
  sourceOrders: IOrder[] | null,
  filteredOrders: IOrder[] | null,
  user: any,
) {
  if (!sourceOrders || user?.u_role !== EUserRoles.Driver || !user?.u_id)
    return filteredOrders

  // В режиме браузерного эмулятора список должен быть чистым:
  // показываем только локально созданные эмулятором заказы.
  // Старые activeOrders, где водитель уже когда-то оказался в drivers,
  // больше не восстанавливаем — именно они давали "активные" чужие/старые заказы.
  if (isBrowserEmulatorRunning('clients') || isBrowserEmulatorRunning('drivers'))
    return filteredOrders

  const visibleIds = new Set((filteredOrders ?? []).map(order => String(order.b_id)))
  const restoredOrders = sourceOrders.filter(order =>
    !visibleIds.has(String(order.b_id)) &&
    isDriverRelatedActiveOrder(order, user.u_id),
  )

  if (!restoredOrders.length)
    return filteredOrders

  return [
    ...(filteredOrders ?? []),
    ...restoredOrders.map(filterOrderDriversForBrowserEmulator),
  ]
}


export const moduleSelector = (state: IRootState) => state[moduleName]

const ordersData = (state: IRootState) => moduleSelector(state).orders
export const orders = createSelector(
  ordersData,
  orders => orders.map(order => order.value ?? order.partial).filter(Boolean),
  { memoizeOptions: {
    resultEqualityCheck: (oldValue, newValue) => newValue.equals(oldValue),
  } },
)
export function order(
  state: IRootState,
  id: IOrder['b_id'],
): IOrder | undefined {
  const orderData = ordersData(state).get(id)
  const currentOrder = orderData?.value ?? orderData?.partial ?? undefined
  if (!currentOrder) return undefined
  const clientEmulatorMode = isBrowserEmulatorRunning('clients')
  const driverEmulatorMode = isBrowserEmulatorRunning('drivers')
  const user = currentUser(state)

  if (shouldUseStrictEmulatorOnlyOrders(user) && !clientEmulatorMode && !driverEmulatorMode) return undefined
  if (clientEmulatorMode && !isLocalBrowserEmulatorOrder(currentOrder, 'clients')) return undefined
  if (driverEmulatorMode && !isLocalBrowserEmulatorOrder(currentOrder, 'drivers')) return undefined
  if (!clientEmulatorMode && !driverEmulatorMode && shouldHideOrderFromNormalMode(currentOrder)) return undefined

  const filteredOrder = filterOrderDriversForBrowserEmulator(currentOrder)
  const currentGeoPosition = geoposition(state)
  const currentGeolocation = currentGeoPosition ? geopositionToPoint(currentGeoPosition) : undefined
  const currentCar = userPrimaryCar(state)
  const currentWayGraph = wayGraph(state)

  if (currentGeolocation && currentCar)
    return {
      ...filteredOrder,
      ...estimateOrder(filteredOrder, currentCar, currentGeolocation, currentWayGraph),
    }

  return filteredOrder
}

export const orderMutates = (state: IRootState, id: IOrder['b_id']) => {
  const orderData = ordersData(state).get(id)
  return !!(orderData?.mutations || orderData?.stale)
}

const estimatedOrder = createSelector(
  [
    (order) => order,
    (_, geolocation) => geolocation,
    (_, __, car) => car,
    (_, __, ___, graph) => graph,
  ],
  (
    order: IOrder,
    geolocation: [number, number],
    car: ICar,
    graph: IWayGraph,
  ) => ({
    ...order,
    ...estimateOrder(order, car, geolocation, graph),
  }),
  { memoize: weakMapMemoize },
)
const estimatedOrders = (
  orders: ImmutableList<IOrder> | undefined,
  geolocation: [number, number] | undefined,
  car: ICar | null | undefined,
  graph: IWayGraph,
): ImmutableList<IOrder> | null =>
  orders && geolocation && car ?
    orders.map(order => estimatedOrder(order, geolocation, car, graph)) :
    (orders ?? null)

function getProfitSortValue(order: IOrder) {
  if (typeof order.profitSortValue === 'number' && Number.isFinite(order.profitSortValue))
    return order.profitSortValue

  if (typeof order.profitPerEmptyKm === 'number' && Number.isFinite(order.profitPerEmptyKm))
    return order.profitPerEmptyKm

  if (typeof order.profit === 'number' && Number.isFinite(order.profit))
    return order.profit

  return Number.NEGATIVE_INFINITY
}

function sortOrdersByProfit(orders: IOrder[] | null): IOrder[] | null {
  if (!orders)
    return null

  return [...orders].sort((a, b) => {
    const profitDiff = getProfitSortValue(b) - getProfitSortValue(a)
    if (profitDiff !== 0)
      return profitDiff

    return String(b.b_id).localeCompare(String(a.b_id))
  })
}
const approximatedCoords = createSelector(
  geoposition,
  geoposition => geoposition && geopositionToPoint(geoposition),
  { memoizeOptions: {
    resultEqualityCheck: (oldValue, newValue) => !!(
      oldValue === newValue || (oldValue && newValue && (
        (oldValue[0] === newValue[0] && oldValue[1] === newValue[1]) ||
        calculateDistance(oldValue, newValue) <
          GEOLOCATION_CHANGE_THRESHOLD_METERS
      ))
    ),
  } },
)

const ordersGroupSelector = (
  idsSelector: (state: IRootState) => ImmutableList<IOrder['b_id']> | null,
) => createSelector(
  [ordersData, idsSelector],
  (orders, ids) => ids
    ?.map(id => {
      const orderData = orders.get(id)
      return orderData?.value ?? orderData?.partial
    })
    .filter((order): order is IOrder => Boolean(order)),
  { memoizeOptions: { resultEqualityCheck: is } },
)

const activeOrdersIds = (state: IRootState) =>
  moduleSelector(state).activeOrders
const pureActiveOrders = ordersGroupSelector(activeOrdersIds)
export const activeOrders = createSelector(
  [pureActiveOrders, approximatedCoords, userPrimaryCar, wayGraph, currentUser],
  (orders, geolocation, car, graph, user): IOrder[] | null => {
    const estimated = estimatedOrders(orders, geolocation, car, graph)?.toArray() ?? null
    const filtered = filterOrdersForStrictDriverEmulatorMode(estimated, 'active', user)
    const restored = shouldUseStrictEmulatorOnlyOrders(user) ? filtered : restoreDriverRelatedOrdersAfterEmulatorFilter(estimated, filtered, user)
    const distanceFiltered = filterOrdersByDriverDistance(restored, user)

    return sortOrdersByProfit(distanceFiltered)
  },
)

const readyOrdersIds = (state: IRootState) =>
  moduleSelector(state).readyOrders
const pureReadyOrders = ordersGroupSelector(readyOrdersIds)
export const readyOrders = createSelector(
  [pureReadyOrders, approximatedCoords, userPrimaryCar, wayGraph, currentUser],
  (orders, geolocation, car, graph, user): IOrder[] | null => {
    const filtered = filterOrdersForStrictDriverEmulatorMode(
      estimatedOrders(orders, geolocation, car, graph)?.toArray() ?? null,
      'ready',
      user,
    )

    return sortOrdersByProfit(filterOrdersByDriverDistance(filtered, user))
  },
)

const historyOrdersIds = (state: IRootState) =>
  moduleSelector(state).historyOrders
const pureHistoryOrders = ordersGroupSelector(historyOrdersIds)
export const historyOrders = createSelector(
  [pureHistoryOrders, currentUser],
  (orders, user): IOrder[] | null => filterOrdersForStrictDriverEmulatorMode(orders?.toArray() ?? null, 'history', user),
)