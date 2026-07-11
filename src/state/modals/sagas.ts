import { shortenAddress } from './../../tools/utils'
import { all, takeEvery, put } from 'redux-saga/effects'
import { ActionTypes } from './constants'
import { EPointType, IAddressPoint } from '../../types/types'
import { TAction } from '../../types'
import { call } from '../../tools/sagaUtils'
import * as API from '../../API'

const getAddressCityPart = (address: any) =>
  address?.city || address?.country || address?.village || address?.town || address?.state

export const saga = function* () {
  yield all([
    takeEvery(ActionTypes.SET_TAKE_PASSENGER_MODAL_FROM_REQUEST, setPointSaga(EPointType.From)),
    takeEvery(ActionTypes.SET_TAKE_PASSENGER_MODAL_TO_REQUEST, setPointSaga(EPointType.To)),
  ])
}

const setPointSaga = (type: EPointType) => function* (data: TAction) {
  const value: IAddressPoint = { ...data.payload }
  try {
    if (!(value.address || value.shortAddress) && value.latitude && value.longitude) {
      try {
        const address = yield* call(
          API.reverseGeocode,
          value.latitude.toString(),
          value.longitude.toString(),
        )
        const displayName = address.display_name || ''
        if (displayName) {
          value.address = displayName
          value.shortAddress = shortenAddress(
            displayName,
            getAddressCityPart(address.address),
          ) || displayName
        }
      } catch (error) {
        console.warn('Reverse geocode failed for modal point', error)
      }
    }
  } catch (error) {
    console.warn('Point resolving failed', error)
  }

  yield put({
    type: type === EPointType.From ?
      ActionTypes.SET_TAKE_PASSENGER_MODAL_FROM :
      ActionTypes.SET_TAKE_PASSENGER_MODAL_TO,
    payload: value,
  })
}
