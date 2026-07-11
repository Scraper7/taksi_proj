import { all, takeEvery, takeLatest, put } from 'redux-saga/effects'
import { TAction } from '../../types'
import { EPointType, IAddressPoint } from '../../types/types'
import * as API from '../../API'
import {
  getCurrentPosition, shortenAddress, getPhoneNumberError,
} from '../../tools/utils'
import { getItem, setItem, removeItem } from '../../tools/localStorage'
import { rememberPersonalAddress } from '../../tools/addressBook'
import { call, select } from '../../tools/sagaUtils'
import { IRootState } from '..'
import { configConstants } from '../config'
import { IClientOrderState, ActionTypes } from './constants'
import { moduleSelector } from './selectors'

export const saga = function* () {
  yield all([
    takeLatest(ActionTypes.SET_FROM_REQUEST, setPointSaga),
    takeLatest(ActionTypes.SET_TO_REQUEST, setPointSaga),
    takeEvery(
      configConstants.ActionTypes.SET_CONFIG_SUCCESS,
      loadFromStorageSaga,
    ),
    takeEvery([
      ActionTypes.SET_CAR_CLASS,
      ActionTypes.SET_SEATS,
      ActionTypes.SET_LOCATION_CLASS,
      ActionTypes.SET_FROM_POLYGONS,
      ActionTypes.SET_TO_POLYGONS,
    ], dumpSelectsToStorageSaga),
    takeEvery(ActionTypes.SET_COMMENTS, setCommentsSaga),
    takeEvery(ActionTypes.SET_TIME, setTimeSaga),
    takeEvery(ActionTypes.SET_PHONE, setPhoneSaga),
    takeEvery(ActionTypes.SET_CUSTOMER_PRICE, setCustomerPriceSaga),
    takeEvery(ActionTypes.SET_PICKUP_PRICE, setPickupPriceSaga),
    takeEvery(ActionTypes.RESET, resetSaga),
  ])
}

function* loadFromStorageSaga() {
  const actions: [
    typeof ActionTypes[keyof typeof ActionTypes],
    keyof IClientOrderState
  ][] = [
    [ActionTypes.SET_FROM_REQUEST, 'from'],
    [ActionTypes.SET_TO_REQUEST, 'to'],
    [ActionTypes.SET_CAR_CLASS, 'carClass'],
    [ActionTypes.SET_SEATS, 'seats'],
    [ActionTypes.SET_COMMENTS, 'comments'],
    [ActionTypes.SET_LOCATION_CLASS, 'locationClass'],
  ]
  for (const [type, payload] of actions.map(
    ([type, key]): [string, unknown] =>
      [type, getItem(`state.clientOrder.${key}`)],
  ))
    if (payload !== undefined)
      yield put({ type, payload })
}

function* dumpSelectsToStorageSaga() {
  const keys: (keyof IClientOrderState)[] = [
    'carClass',
    'seats',
    'locationClass',
  ]
  for (const key of keys)
    setItem(
      `state.clientOrder.${key}`,
      yield* select(keySelector(key)),
    )
}
function* setCommentsSaga() {
  const value = yield* select(keySelector('comments'))
  setItem('state.clientOrder.comments', value)
}
function* setTimeSaga() {
  const value = yield* select(keySelector('time'))
  setItem('state.clientOrder.time', value)
}
function* setPhoneSaga() {
  const value = yield* select(keySelector('phone'))
  if (!getPhoneNumberError(value))
    setItem('state.clientOrder.phone', value)
}
function* setCustomerPriceSaga() {
  // Customer offer price must start from 0 for each fresh order.
  // Do not persist old values between reloads/orders; PriceInput keeps only
  // the current in-memory floor and still prevents decreasing it.
  removeItem('state.clientOrder.customerPrice')
}
function* setPickupPriceSaga() {
  // Pickup amount is separate from the customer offer price and must not
  // duplicate the third segment between orders/reloads.
  removeItem('state.clientOrder.pickupPrice')
}

function resetSaga() {
  const keys = [
    'carClass',
    'seats',
    'to',
    'comments',
    'time',
    'customerPrice',
    'pickupPrice',
  ]
  for (const key of keys)
    removeItem(`state.clientOrder.${key}`)
}

const keySelector = <K extends keyof IClientOrderState>(key: K) =>
  (state: IRootState) => moduleSelector(state)[key]

const getAddressCityPart = (address: any) =>
  address?.city ||
  address?.country ||
  address?.village ||
  address?.town ||
  address?.state

const hasCoordinates = (point?: IAddressPoint | null): point is IAddressPoint =>
  Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))

function* setPointSaga(action: TAction) {
  const type = action.type === ActionTypes.SET_TO_REQUEST ?
    EPointType.To :
    EPointType.From
  const setAction = type === EPointType.To ?
    ActionTypes.SET_TO :
    ActionTypes.SET_FROM

  const stateBefore = yield* select(moduleSelector)
  const searchCenter = type === EPointType.To ?
    (hasCoordinates(stateBefore.from) ? stateBefore.from : hasCoordinates(stateBefore.to) ? stateBefore.to : undefined) :
    (hasCoordinates(stateBefore.from) ? stateBefore.from : hasCoordinates(stateBefore.to) ? stateBefore.to : undefined)

  let value: IAddressPoint = action.payload
  yield put({ type: setAction, payload: value })

  if (action.payload.isCurrent && navigator.geolocation) {
    try {
      const position = yield* call(getCurrentPosition)
      const { latitude, longitude } = position.coords
      value = { ...value, latitude, longitude }
      yield put({ type: setAction, payload: value })
    } catch (error) {
      console.warn('Geolocation error', error)
    }
  }

  if (
    value.resolveAddress &&
    (value.address || value.shortAddress) &&
    !(value.latitude && value.longitude)
  ) {
    try {
      const query = String(value.address || value.shortAddress || '').trim()
      const address = yield* call(API.geocode, query, { details: true, searchCenter })
      if (address?.display_name && address.lat && address.lon) {
        const displayName = address.display_name
        value = {
          ...value,
          address: displayName,
          shortAddress: shortenAddress(
            displayName,
            getAddressCityPart(address.address),
          ) || displayName,
          latitude: Number(address.lat),
          longitude: Number(address.lon),
          resolveAddress: false,
        }
        yield put({ type: setAction, payload: value })
      }
    } catch (error) {
      console.warn('Manual address geocode failed', error)
    }
  }

  yield all([
    call(function*() {
      if (
        !(value.address || value.shortAddress) &&
        value.latitude && value.longitude
      ) {
        try {
          const address = yield* call(
            API.reverseGeocode,
            value.latitude.toString(),
            value.longitude.toString(),
          )
          const displayName = address.display_name || ''
          if (displayName) {
            value = {
              ...value,
              address: displayName,
              shortAddress: shortenAddress(
                displayName,
                getAddressCityPart(address.address),
              ) || displayName,
            }
            yield put({ type: setAction, payload: value })
          }
        } catch (error) {
          console.warn('Reverse geocode failed for selected point', error)
        }
      }
    }),

    call(function*() {
      if (value.latitude && value.longitude) {
        try {
          const polygons = yield* call(API.getPolygonsIdsOnPoint, [
            value.latitude,
            value.longitude,
          ])
          yield put({
            type: type === EPointType.To ?
              ActionTypes.SET_TO_POLYGONS :
              ActionTypes.SET_FROM_POLYGONS,
            payload: polygons,
          })
        } catch (error) {
          console.error(error)
        }
      }
    }),
  ])

  rememberPersonalAddress(value)
  setItem(
    `state.clientOrder.${type === EPointType.From ? 'from' : 'to'}`,
    value,
  )

  yield put({
    type: type === EPointType.To ?
      ActionTypes.SET_TO_SUCCESS :
      ActionTypes.SET_FROM_SUCCESS,
  })
}