import { all, takeEvery, put, take, fork } from 'redux-saga/effects'
import { TAction } from '../../types'
import { IArea } from '../../types/types'
import { select, call } from '../../tools/sagaUtils'
import * as API from '../../API'
import { ActionTypes } from './constants'
import { getArea } from './actionCreators'
import { area } from './selectors'

export function* saga() {
  yield all([
    call(function*() {

      const runningRequests = new Set<IArea['id']>()
      while (true) {
        const action: TAction = yield take(ActionTypes.GET_AREA_REQUEST)
        const id: IArea['id'] = action.payload
        if (runningRequests.has(id))
          continue
        runningRequests.add(id)
        yield fork(function*() {
          try {
            yield* call(getAreaSaga, action)
          } finally {
            runningRequests.delete(id)
          }
        })
      }

    }),
    takeEvery(
      ActionTypes.GET_AREAS_BETWEEN_POINTS_REQUEST,
      getAreasBetweenPointsSaga,
    ),
  ])
}

function* getAreaSaga(action: TAction) {
  const id: IArea['id'] = action.payload
  try {
    const area = yield* call(API.getArea, id)
    yield put({ type: ActionTypes.GET_AREA_SUCCESS, payload: area })
  } catch (e) {
    console.error(e)
    yield put({ type: ActionTypes.GET_AREA_FAIL, payload: e })
  }
}

function* getAreasBetweenPointsSaga(action: TAction) {
  const points: [number, number][] = action.payload
  try {
    const ids = yield* call(
      API.getAreasIdsBetweenPoints,
      points,
    )
    for (const id of ids)
      if (!(yield* select(area, id)))
        yield put(getArea(id))
  } catch (e) {
    console.error(e)
    yield put({ type: ActionTypes.GET_AREA_FAIL, payload: e })
  }
}