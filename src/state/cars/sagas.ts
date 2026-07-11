import { all, put } from 'redux-saga/effects'
import { TAction } from '../../types'
import { IUser } from '../../types/types'
import { select, call, concurrency } from '../../tools/sagaUtils'
import * as API from '../../API'
import { user as userSelector } from '../user/selectors'
import { ActionTypes } from './constants'
import { carMutates as carMutatesSelector } from './selectors'

export function* saga() {
  const loadState: LoadState = {}
  yield all([
    concurrency({
      action: [
        ActionTypes.GET_USER_CARS_REQUEST,
        ActionTypes.CREATE_USER_CAR_SUCCESS,
      ],
      saga: (action: TAction) => getUserCarsSaga(action, loadState),
      parallelKey: 0,
      leading: ({ type }: TAction) =>
        type === ActionTypes.GET_USER_CARS_REQUEST || undefined,
      latest: ({ type }: TAction) =>
        type === ActionTypes.CREATE_USER_CAR_SUCCESS || undefined,
    }, {
      action: ActionTypes.END_MUTATION,
      saga: getCarSaga,
      parallelKey: 1,
      sequenceKey: ({ payload }: TAction) => payload,
      latest: ({ payload }: TAction) => payload,
    }),
  ])
}

interface LoadState {
  lastUserId?: IUser['u_id']
}

function* getCarSaga({ type, payload }: TAction) {
  if (yield* select(carMutatesSelector, payload))
    return
  try {
    const car = yield* call(API.getCar, payload)
    if (car)
      yield put({ type: ActionTypes.GET_SUCCESS, payload: car })
    else
      yield put({ type: ActionTypes.GET_NOT_FOUND, payload })
  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_FAIL, payload: error })
  }
}

function* getUserCarsSaga({ type }: TAction, loadState: LoadState) {
  const userId = (yield* select(userSelector))?.u_id
  if (
    type === ActionTypes.GET_USER_CARS_REQUEST &&
    (!userId || userId === loadState.lastUserId)
  )
    return
  try {
    const cars = yield* call(API.getUserCars)
    yield put({ type: ActionTypes.GET_USER_CARS_SUCCESS, payload: cars })
    loadState.lastUserId = userId
  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.GET_USER_CARS_FAIL, payload: error })
  }
}