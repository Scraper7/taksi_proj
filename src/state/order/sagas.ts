import { all, takeEvery, put } from 'redux-saga/effects'
import { TAction } from '../../types'
import { call } from '../../tools/sagaUtils'
import { updateCompletedOrderDuration } from '../../tools/order'
import * as API from '../../API'
import { ActionTypes } from './constants'

export const saga = function* () {
  yield all([
    takeEvery(ActionTypes.GET_ORDER_REQUEST, getOrderSaga),
  ])
}

function* getOrderSaga({ payload }: TAction) {
  yield put({ type: ActionTypes.GET_ORDER_START })

  try {
    let order = (yield* call(API.getOrder, payload))
    order = order ? updateCompletedOrderDuration(order) : null
    yield put({ type: ActionTypes.GET_ORDER_SUCCESS, payload: order })
  }

  catch (error) {
    yield put({
      type: ActionTypes.GET_ORDER_FAIL,
      payload: (error as Error).message,
    })
  }
}
