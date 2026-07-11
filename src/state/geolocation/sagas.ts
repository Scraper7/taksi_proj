import { channel } from 'redux-saga'
import { all, race, take, takeEvery, put, delay } from 'redux-saga/effects'
import { TAction } from '../../types'
import {
  getCurrentPosition,
  HIGH_ACCURACY_GEOLOCATION_OPTIONS,
} from '../../tools/utils'
import { select, call, whileWatching } from '../../tools/sagaUtils'
import { sendPosition } from '../../API/location'
import { ActionTypes } from './constants'
import { geoposition as geopositionSelector } from './selectors'

export function* saga() {
  yield all([
    call(geolocationSaga),
  ])
}

function* geolocationSaga() {
  let latestGet = 0
  let latestSent: GeolocationPosition | undefined
  const listeners = new Map<number, number>()
  let pollInterval = Infinity
  const intervalChangeChannel = yield* call(channel)

  yield all([
    call(function*() {
      while (true) {
        if (pollInterval === Infinity) {
          yield take(intervalChangeChannel)
          continue
        }
        const [timePassed] = yield race([
          delay(Math.max(latestGet + pollInterval - Date.now(), 0), true),
          take(intervalChangeChannel),
        ])
        if (!timePassed)
          continue

        yield* getGeopositionSaga()
        latestGet = Date.now()
      }
    }),

    takeEvery(ActionTypes.WATCH, function*({ payload: { interval } }: TAction) {
      listeners.set(interval, (listeners.get(interval) ?? 0) + 1)
      if (interval < pollInterval) {
        pollInterval = interval
        yield put(intervalChangeChannel, {})
      }
    }),

    takeEvery(ActionTypes.UNWATCH, function*({
      payload: { interval },
    }: TAction) {
      const listenersWithInterval = listeners.get(interval)!
      if (listenersWithInterval > 1)
        listeners.set(interval, listenersWithInterval - 1)
      else {
        listeners.delete(interval)
        if (interval === pollInterval) {
          pollInterval = [...listeners.keys()].reduce(
            (min, interval) => interval < min ? interval : min,
            Infinity,
          )
          yield put(intervalChangeChannel, {})
        }
      }
    }),

    whileWatching(
      ActionTypes.ACTIVATE_SENDING,
      ActionTypes.DEACTIVATE_SENDING,

      function*() {
        yield* getGeopositionSaga()
        latestSent = yield* sendPositionSaga(latestSent)
        yield delay(1000 * 20)
      },
    ),
  ])
}

function* getGeopositionSaga() {
  try {
    const geoposition = yield* call(
      getCurrentPosition,
      HIGH_ACCURACY_GEOLOCATION_OPTIONS,
    )
    yield put({ type: ActionTypes.GET_SUCCESS, payload: geoposition })
  } catch (error) {
    yield put({ type: ActionTypes.GET_FAIL, payload: error })
  }
}

function* sendPositionSaga(latestSent?: GeolocationPosition) {
  const geoposition = yield* select(geopositionSelector)
  if (!geoposition)
    return latestSent
  try {
    const response = yield* call(sendPosition, geoposition.coords)
    if (response.code !== '200')
      console.error(response)
    return geoposition
  } catch (error) {
    console.error(error)
    return latestSent
  }
}
