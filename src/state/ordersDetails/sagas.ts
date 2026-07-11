import { all, take, put } from 'redux-saga/effects'
import { TAction } from '../../types'
import { call, select, concurrency } from '../../tools/sagaUtils'
import * as API from '../../API'
import { IRootState } from '..'
import { orders } from '../orders/selectors'
import { ActionTypes } from './constants'
import { moduleSelector } from './selectors'

export function* saga() {
  const orderActionKey = ({ payload }: TAction) => payload.b_id

  yield all([
    concurrency({
      action: ActionTypes.GET_START_REQUEST,
      saga: getLocationSaga,
      sequenceKey: orderActionKey,
      leading: orderActionKey,
    }),
    concurrency({
      action: ActionTypes.GET_DESTINATION_REQUEST,
      saga: getLocationSaga,
      sequenceKey: orderActionKey,
      leading: orderActionKey,
    }),
    concurrency({
      action: ActionTypes.GET_CLIENT_REQUEST,
      saga: getClientSaga,
      sequenceKey: orderActionKey,
      leading: orderActionKey,
    }),
    call(setListenersWatchSaga),
  ])
}

function* getLocationSaga({ type, payload }: TAction) {
  const destination = type === ActionTypes.GET_DESTINATION_REQUEST
  if (yield* select((state: IRootState) =>
    moduleSelector(state).orders.get(payload.b_id, undefined)
      ?.[destination ? 'destination' : 'start'],
  )) return

  const successActionType = destination ?
    ActionTypes.GET_DESTINATION_SUCCESS :
    ActionTypes.GET_START_SUCCESS
  const address = destination ?
    payload.b_destination_address :
    payload.b_start_address
  const shortAddress = destination ?
    payload.b_options?.toShortAddress :
    payload.b_options?.fromShortAddress
  const latitude = destination ?
    payload.b_destination_latitude :
    payload.b_start_latitude
  const longitude = destination ?
    payload.b_destination_longitude :
    payload.b_start_longitude

  // Адреса и координаты уже есть в заказе. Не делаем внешний reverse-geocode
  // на каждую карточку/детали, чтобы не ловить 429/CORS и не ломать выбор адресов.
  if (address || shortAddress || (latitude && longitude)) {
    yield put({
      type: successActionType,
      payload: {
        id: payload.b_id,
        value: {
          shortAddress,
          latitude,
          longitude,
          address: address || shortAddress || '',
        },
      },
    })
    return
  }

  yield put({
    type: destination ?
      ActionTypes.GET_DESTINATION_FAIL :
      ActionTypes.GET_START_FAIL,
    payload,
  })
}

function* getClientSaga({ payload }: TAction) {
  try {
    const client = yield* call(API.getUser, payload.u_id)
    yield put({
      type: ActionTypes.GET_CLIENT_SUCCESS,
      payload: { id: payload.b_id, value: client },
    })
  }

  catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_CLIENT_FAIL, payload: error })
  }
}

function* setListenersWatchSaga() {
  let prevValue: ReturnType<typeof orders> | undefined
  while (true) {
    yield take()
    const value = yield* select(orders)
    if (value === prevValue)
      continue
    prevValue = value
    yield put({
      type: ActionTypes.SET_LISTENERS,
      payload: value.keySeq(),
    })
  }
}