import { appName } from '../../constants'
import { EStatuses, ILanguage } from '../../types/types'

export const moduleName = 'config' as const

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  CHECK_CONFIG_REQUEST: `${prefix}/CHECK_CONFIG_REQUEST`,
  CHECK_CONFIG_START: `${prefix}/CHECK_CONFIG_START`,
  CHECK_CONFIG_SUCCESS: `${prefix}/CHECK_CONFIG_SUCCESS`,
  CHECK_CONFIG_FAIL: `${prefix}/CHECK_CONFIG_FAIL`,

  CLEAR_CONFIG_REQUEST: `${prefix}/CLEAR_CONFIG_REQUEST`,

  SET_CONFIG_LOADED_REQUEST: `${prefix}/SET_CONFIG_LOADED_REQUEST`,
  SET_CONFIG_SUCCESS: `${prefix}/SET_CONFIG_LOADED`,
  SET_CONFIG_FAIL: `${prefix}/SET_CONFIG_FAIL`,

  SET_LANGUAGE_REQUEST: `${prefix}/SET_LANGUAGE_REQUEST`,
  SET_LANGUAGE: `${prefix}/SET_LANGUAGE`,
} as const

export interface IConfigState {
  status: EStatuses
  language: ILanguage
}