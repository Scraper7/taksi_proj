import { all } from 'redux-saga/effects'
import { saga as geolocationSaga } from './geolocation/sagas'
import { saga as clientOrderSaga } from './clientOrder/sagas'
import { saga as userSaga } from './user/sagas'
import { saga as carsSaga } from './cars/sagas'
import { saga as ordersSaga } from './orders/sagas'
import { saga as ordersDetailsSaga } from './ordersDetails/sagas'
import { saga as orderSaga } from './order/sagas'
import { saga as configSaga } from './config/sagas'
import { saga as areasSaga } from './areas/sagas'

export default function* rootSaga() {
  yield all([
    geolocationSaga(),
    clientOrderSaga(),
    userSaga(),
    carsSaga(),
    ordersSaga(),
    ordersDetailsSaga(),
    orderSaga(),
    configSaga(),
    areasSaga(),
  ])
}