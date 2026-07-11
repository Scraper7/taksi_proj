import { appName } from '../../constants'

export const moduleName = 'geolocation'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  WATCH: `${prefix}/WATCH_GEOLOCATION`,
  UNWATCH: `${prefix}/UNWATCH_GEOLOCATION`,
  GET_SUCCESS: `${prefix}/GET_GEOLOCATION_SUCCESS`,
  GET_FAIL: `${prefix}/GET_GEOLOCATION_FAIL`,

  ACTIVATE_SENDING: `${prefix}/ACTIVATE_GEOLOCATION_SENDING`,
  DEACTIVATE_SENDING: `${prefix}/DEACTIVATE_GEOLOCATION_SENDING`,
}

export interface IGeolocationState {
  geoposition?: GeolocationPosition
}