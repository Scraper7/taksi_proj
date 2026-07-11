import { ArrayValue } from './../../types/index'
import { appName } from '../../constants'
import { TRANSLATION } from '../../localization'
import { EStatuses, IRegisterResponse, ITokens, IUser } from '../../types/types'

export const moduleName = 'user' as const

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  REGISTER_REQUEST: `${prefix}/REGISTER_REQUEST`,
  REGISTER_START: `${prefix}/REGISTER_START`,
  REGISTER_SUCCESS: `${prefix}/REGISTER_SUCCESS`,
  REGISTER_FAIL: `${prefix}/REGISTER_FAIL`,

  GOOGLE_LOGIN_REQUEST: `${prefix}/GOOGLE_LOGIN_REQUEST`,
  GOOGLE_LOGIN_START: `${prefix}/GOOGLE_LOGIN_START`,
  GOOGLE_LOGIN_SUCCESS: `${prefix}/GOOGLE_LOGIN_SUCCESS`,
  GOOGLE_LOGIN_FAIL: `${prefix}/GOOGLE_LOGIN_FAIL`,

  LOGIN_REQUEST: `${prefix}/LOGIN_REQUEST`,
  LOGIN_START: `${prefix}/LOGIN_START`,
  LOGIN_SUCCESS: `${prefix}/LOGIN_SUCCESS`,
  LOGIN_FAIL: `${prefix}/LOGIN_FAIL`,
  LOGIN_WHATSAPP: `${prefix}/LOGIN_WHATSAPP`,

  LOGOUT_REQUEST: `${prefix}/LOGOUT_REQUEST`,
  LOGOUT_START: `${prefix}/LOGOUT_START`,
  LOGOUT_SUCCESS: `${prefix}/LOGOUT_SUCCESS`,
  LOGOUT_FAIL: `${prefix}/LOGOUT_FAIL`,

  REMIND_PASSWORD_REQUEST: `${prefix}/REMIND_PASSWORD_REQUEST`,
  REMIND_PASSWORD_START: `${prefix}/REMIND_PASSWORD_START`,
  REMIND_PASSWORD_SUCCESS: `${prefix}/REMIND_PASSWORD_SUCCESS`,
  REMIND_PASSWORD_FAIL: `${prefix}/REMIND_PASSWORD_FAIL`,

  SET_TAB: `${prefix}/SET_TAB`,
  SET_STATUS: `${prefix}/SET_STATUS`,
  SET_MESSAGE: `${prefix}/SET_MESSAGE`,

  INIT_USER: `${prefix}/INIT_USER`,
  SET_USER: `${prefix}/SET_USER`,
  SET_TOKENS: `${prefix}/SET_TOKENS`,

  WHATSAPP_SIGNUP_SUCCESS: `${prefix}/WHATSAPP_SIGNUP_SUCCESS`,
  WHATSAPP_SIGNUP_START: `${prefix}/WHATSAPP_SIGNUP_START`,
  WHATSAPP_SIGNUP_FAIL: `${prefix}/WHATSAPP_SIGNUP_FAIL`,
  WHATSAPP_SIGNUP_REQUEST: `${prefix}/WHATSAPP_SIGNUP_REQUEST`,
} as const

export enum ERegistrationType {
  Email = 'e-mail',
  Phone = 'phone',
  Whatsapp = 'whatsapp',
}

export const LOGIN_TABS = [
  { label: TRANSLATION.SIGNIN, id: 'sign-in' },
  { label: TRANSLATION.SIGNUP, id: 'sign-up' },
] as const
export const LOGIN_TABS_IDS = LOGIN_TABS.map(item => item.id)

export type TLoginTab = ArrayValue<typeof LOGIN_TABS_IDS>

export interface IUserState {
  user: IUser | null,
  tokens: ITokens | null,
  status: EStatuses,
  message: string,
  tab: TLoginTab,
  response: IRegisterResponse | null,
  whatsappSignUpData?:{u_phone: string}|null,
}