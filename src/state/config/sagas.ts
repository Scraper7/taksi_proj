import { all, takeEvery, put } from 'redux-saga/effects'
import { call } from '../../tools/sagaUtils'
import * as API from '../../API'
import { TAction } from '../../types'
import Config from '../../config'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import { setCookie } from '../../utils/cookies'
import { ActionTypes } from './constants'

export const saga = function* () {
  yield all([
    takeEvery(ActionTypes.CHECK_CONFIG_REQUEST, checkConfigSaga),
    takeEvery(ActionTypes.CLEAR_CONFIG_REQUEST, clearConfigSaga),
    takeEvery(ActionTypes.SET_CONFIG_LOADED_REQUEST, setConfigLoadedSaga),
    takeEvery(ActionTypes.SET_LANGUAGE_REQUEST, setLanguageSaga),
  ])
}

function* checkConfigSaga(data: TAction) {
  yield put({ type: ActionTypes.CHECK_CONFIG_START })
  try {
    yield* call(API.checkConfig, data.payload)
    // yield put({ type: ActionTypes.CHECK_CONFIG_SUCCESS })
    Config.setConfig(data.payload)
  } catch (error) {
    console.error(error)
    yield put({ type: ActionTypes.CHECK_CONFIG_FAIL })
    Config.setDefaultName()
  }
}

function* clearConfigSaga() {
  yield Config.clearConfig()
}

function* setConfigLoadedSaga() {
  SITE_CONSTANTS.recalculate()
  CURRENCY.recalculated()

  setTimeout(() => {
    (window as any).preloader?.classList.remove('active')
  }, 1000)

  yield put({ type: ActionTypes.SET_CONFIG_SUCCESS })
}

function* setLanguageSaga(data: TAction) {
  yield put({ type: ActionTypes.SET_LANGUAGE, payload: data.payload })
  setCookie('user_lang', data.payload.iso)

  try {
    yield* call(API.editUser, { u_lang: data.payload.id })
  } catch (error) {
    console.error(error)
  }
}
