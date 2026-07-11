import { Record } from 'immutable'
import { createSelector } from 'reselect'
import SITE_CONSTANTS from '../../siteConstants'
import { TAction } from '../../types'
import { EStatuses } from '../../types/types'
import { firstItem } from '../../tools/utils'
import { getItem } from '../../tools/localStorage'
import { configConstants } from '../config'
import * as util from './util'
import { polygonsLocationClasses } from './util'
import { ActionTypes, IClientOrderState } from './constants'

const defaultRecord: IClientOrderState = {
  from: null,
  fromPolygons: null,
  fromLoading: false,

  to: null,
  toPolygons: null,
  toLoading: false,

  carClass: SITE_CONSTANTS.DEFAULT_CAR_CLASS,
  seats: 1,
  comments: {
    custom: '',
    flightNumber: '',
    placard: '',
    ids: [],
  },
  time: 'now',
  locationClass: SITE_CONSTANTS.DEFAULT_BOOKING_LOCATION_CLASS,
  locationClassSelectionMode: 'auto',
  phone: null,
  phoneEdited: false,
  customerPrice: null,
  pickupPrice: null,
  selectedOrder: null,
  status: EStatuses.Default,
  message: '',
}

const record = Record<IClientOrderState>({
  ...defaultRecord,
  from: getItem('state.clientOrder.from', defaultRecord.from),
  to: getItem('state.clientOrder.to', defaultRecord.to),
  time: getItem('state.clientOrder.time', defaultRecord.time),
  phone: getItem('state.clientOrder.phone', defaultRecord.phone),
  customerPrice: defaultRecord.customerPrice,
  pickupPrice: defaultRecord.pickupPrice,
})

export default function reducer(
  state = new record(),
  action: TAction,
  performedActions = new Set<string>(),
) {
  const { type, payload } = action
  if (performedActions.has(type))
    return state
  performedActions.add(type)

  if (type === configConstants.ActionTypes.SET_CONFIG_SUCCESS) {
    defaultRecord.carClass = SITE_CONSTANTS.DEFAULT_CAR_CLASS
    defaultRecord.locationClass = SITE_CONSTANTS.DEFAULT_BOOKING_LOCATION_CLASS
    state = reducer(state, {
      type: ActionTypes.SET_CAR_CLASS,
      payload: state.carClass,
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_SEATS,
      payload: state.seats,
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_COMMENTS,
      payload: state.comments,
    }, performedActions)
    state = reducer(state, {
      type: ActionTypes.SET_LOCATION_CLASS,
      payload: state.locationClass,
    }, performedActions)
    return state
  }

  if (type === ActionTypes.SET_CAR_CLASS) {
    const available = availableCarClassesIds(state)
    const carClass = available.has(payload) ?
      payload :
      firstItem(available) ?? defaultRecord.carClass
    const carClassData = SITE_CONSTANTS.CAR_CLASSES[carClass]
    state = state
      .set('carClass', carClass)
    state = reducer(state, {
      type: ActionTypes.SET_SEATS,
      payload: Math.min(state.seats, carClassData.seats),
    }, performedActions)

    const manualAvailable = manualLocationClassesIds(state)
    const keepManualLocation =
      state.locationClassSelectionMode === 'manual' &&
      manualAvailable.has(state.locationClass)
    state = reducer(state, {
      type: ActionTypes.SET_LOCATION_CLASS,
      payload: keepManualLocation ?
        { id: state.locationClass, mode: 'manual' } :
        state.locationClass,
    }, performedActions)
    return state
  }

  if (type === ActionTypes.SET_SEATS) {
    const seats = Math.min(payload, maxAvailableSeats(state))
    state = state
      .set('seats', seats)
    state = reducer(state, {
      type: ActionTypes.SET_CAR_CLASS,
      payload: SITE_CONSTANTS.CAR_CLASSES[state.carClass].seats < seats ?
        availableCarClasses(state).find(cc => cc.seats >= seats)?.id ??
          defaultRecord.carClass :
        state.carClass,
    }, performedActions)
    return state
  }

  if (type === ActionTypes.SET_COMMENTS) {
    return state
      .set('comments', {
        ...payload,
        ids: payload.ids
          .filter((id: string) => id in SITE_CONSTANTS.BOOKING_COMMENTS),
      })
  }

  if (type === ActionTypes.SET_LOCATION_CLASS) {
    const locationPayload = normalizeLocationClassPayload(payload)
    const isManualSelection = locationPayload.mode === 'manual'
    const manualAvailable = manualLocationClassesIds(state)
    const autoAvailable = algorithmLocationClassesIds(state)
    const requestedLocationClass = locationPayload.id

    let locationClass = state.locationClass
    let selectionMode: IClientOrderState['locationClassSelectionMode'] = state.locationClassSelectionMode

    if (isManualSelection) {
      if (!manualAvailable.has(requestedLocationClass))
        return state
      locationClass = requestedLocationClass
      selectionMode = 'manual'
    } else {
      locationClass = autoAvailable.has(requestedLocationClass) ?
        requestedLocationClass :
        firstItem(autoAvailable) ?? firstItem(manualAvailable) ?? defaultRecord.locationClass
      selectionMode = 'auto'
    }

    const carClassData = SITE_CONSTANTS.CAR_CLASSES[state.carClass]
    const currentCarClassIsAllowed = carClassData &&
      util.carClassSupportsLocationClass(carClassData, locationClass) &&
      util.carClassAllowedForRoute(carClassData, state.fromPolygons, state.toPolygons, state.from, state.to)

    state = state
      .set('locationClass', locationClass)
      .set('locationClassSelectionMode', selectionMode)

    const selectedLocationClassData = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.find(({ id }) =>
      String(id) === String(locationClass),
    )
    state = reducer(state, {
      type: ActionTypes.SET_CAR_CLASS,
      payload: currentCarClassIsAllowed ?
        state.carClass :
        util.availableCarClasses(
          selectedLocationClassData ? [selectedLocationClassData] : SITE_CONSTANTS.BOOKING_LOCATION_CLASSES,
          state.fromPolygons,
          state.toPolygons,
          state.from,
          state.to,
        )[0]?.id ?? defaultRecord.carClass,
    }, performedActions)
    return state
  }

  if (
    type === ActionTypes.SET_FROM_POLYGONS ||
    type === ActionTypes.SET_TO_POLYGONS
  ) {
    state = state
      .set(
        type === ActionTypes.SET_FROM_POLYGONS ? 'fromPolygons' : 'toPolygons',
        payload,
      )
    state = reducer(state, {
      type: ActionTypes.SET_LOCATION_CLASS,
      payload: { id: state.locationClass, mode: 'auto' },
    }, performedActions)
    return state
  }

  switch (type) {
    case ActionTypes.SET_FROM_REQUEST:
      return state
        .set('fromPolygons', defaultRecord.fromPolygons)
        .set('fromLoading', true)
    case ActionTypes.SET_FROM:
      state = state
        .set('from', payload)
      return reducer(state, {
        type: ActionTypes.SET_LOCATION_CLASS,
        payload: { id: state.locationClass, mode: 'auto' },
      }, performedActions)
    case ActionTypes.SET_FROM_SUCCESS:
      return state
        .set('fromLoading', false)
    case ActionTypes.SET_TO_REQUEST:
      return state
        .set('toPolygons', defaultRecord.toPolygons)
        .set('toLoading', true)
    case ActionTypes.SET_TO:
      state = state
        .set('to', payload)
      return reducer(state, {
        type: ActionTypes.SET_LOCATION_CLASS,
        payload: { id: state.locationClass, mode: 'auto' },
      }, performedActions)
    case ActionTypes.SET_TO_SUCCESS:
      return state
        .set('toLoading', false)
    case ActionTypes.SET_TIME:
      return state
        .set('time', payload)
    case ActionTypes.SET_PHONE:
      return state
        .set('phone', payload)
        .set('phoneEdited', state.phoneEdited || payload !== state.phone)
    case ActionTypes.SET_CUSTOMER_PRICE:
      return state
        .set('customerPrice', payload)
    case ActionTypes.SET_PICKUP_PRICE:
      return state
        .set('pickupPrice', payload)
    case ActionTypes.SET_SELECTED_ORDER:
      return state
        .set('selectedOrder', payload)
    case ActionTypes.SET_STATUS:
      return state
        .set('status', payload)
    case ActionTypes.SET_MESSAGE:
      return state
        .set('message', payload)
    case ActionTypes.RESET:
      return state
        .set('carClass', defaultRecord.carClass)
        .set('seats', defaultRecord.seats)
        .set('to', defaultRecord.to)
        .set('toPolygons', defaultRecord.toPolygons)
        .set('comments', defaultRecord.comments)
        .set('time', defaultRecord.time)
        .set('locationClassSelectionMode', defaultRecord.locationClassSelectionMode)
        .set('customerPrice', defaultRecord.customerPrice)
        .set('pickupPrice', defaultRecord.pickupPrice)
    default:
      return state
  }
}


type TLocationClassActionPayload =
  IClientOrderState['locationClass'] |
  { id: IClientOrderState['locationClass'], mode?: IClientOrderState['locationClassSelectionMode'] }

function normalizeLocationClassPayload(payload: TLocationClassActionPayload) {
  if (payload && typeof payload === 'object' && 'id' in payload)
    return {
      id: payload.id,
      mode: payload.mode ?? 'auto',
    }

  return {
    id: payload as IClientOrderState['locationClass'],
    mode: 'auto' as const,
  }
}

const fromPolygons = (state: IClientOrderState) => state.fromPolygons
const toPolygons = (state: IClientOrderState) => state.toPolygons
const fromPoint = (state: IClientOrderState) => state.from
const toPoint = (state: IClientOrderState) => state.to
const algorithmLocationClasses = createSelector(
  [fromPolygons, toPolygons, fromPoint, toPoint],
  (fromPolygons, toPolygons, fromPoint, toPoint) =>
    polygonsLocationClasses(fromPolygons, toPolygons, fromPoint, toPoint).length ?
      polygonsLocationClasses(fromPolygons, toPolygons, fromPoint, toPoint) :
      SITE_CONSTANTS.BOOKING_LOCATION_CLASSES,
)
const algorithmLocationClassesIds = createSelector(
  algorithmLocationClasses,
  locationClasses => new Set(locationClasses.map(({ id }) => id)),
)
const currentLocationClass = (state: IClientOrderState) => state.locationClass
const currentCarClass = (state: IClientOrderState) => state.carClass
const manualLocationClassesIds = createSelector(
  [currentCarClass, fromPolygons, toPolygons, fromPoint, toPoint],
  (carClass, fromPolygons, toPolygons, fromPoint, toPoint) => new Set(
    util.manualLocationClasses(carClass, fromPolygons, toPolygons, fromPoint, toPoint).map(({ id }) => id),
  ),
)
const availableLocationClassesIds = manualLocationClassesIds
const availableCarClasses = createSelector(
  [currentLocationClass, fromPolygons, toPolygons, fromPoint, toPoint],
  (locationClass, fromPolygons, toPolygons, fromPoint, toPoint) => {
    const strictLocationClass = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.find(({ id }) =>
      String(id) === String(locationClass),
    )

    return util.availableCarClasses(
      strictLocationClass ? [strictLocationClass] : SITE_CONSTANTS.BOOKING_LOCATION_CLASSES,
      fromPolygons,
      toPolygons,
      fromPoint,
      toPoint,
    )
  },
)
const availableCarClassesIds = createSelector(
  availableCarClasses,
  carClasses => new Set(carClasses.map(({ id }) => id)),
)
const maxAvailableSeats = createSelector(
  availableCarClasses,
  carClasses => util.maxAvailableSeats(carClasses),
)
