import { ILanguage } from '../../types/types'
import { ActionTypes } from './constants'

export const checkConfig = (name: string) => {
  return { type: ActionTypes.CHECK_CONFIG_REQUEST, payload: name }
}

export const clearConfig = () => {
  return { type: ActionTypes.CLEAR_CONFIG_REQUEST }
}

export const setConfigLoaded = () => {
  return { type: ActionTypes.SET_CONFIG_LOADED_REQUEST }
}

export const setConfigError = () => {
  return { type: ActionTypes.SET_CONFIG_FAIL }
}

export const setLanguage = (language: ILanguage) => {
  return { type: ActionTypes.SET_LANGUAGE_REQUEST, payload: language }
}