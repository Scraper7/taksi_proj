import { ActionTypes, IUserState, LOGIN_TABS_IDS } from './constants'
import { Record } from 'immutable'
import { TAction } from '../../types'
import { TRANSLATION } from '../../localization'
import { EStatuses } from '../../types/types'

export const record = Record<IUserState>({
  user: null,
  tokens: null,
  status: EStatuses.Default,
  message: '',
  tab: LOGIN_TABS_IDS[0],
  response: null,
  whatsappSignUpData: { u_phone: '' },
})

export default function reducer(state = new record(), action: TAction) {
  const { type, payload } = action

  switch (type) {
    case ActionTypes.LOGIN_START:
      return state
        .set('status', EStatuses.Loading)
        .set('message', '')
        .set('user', null)
        .set('tokens', null)
    case ActionTypes.LOGIN_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('user', payload.user)
        .set('tokens', payload.tokens)
    case ActionTypes.LOGIN_FAIL:
      console.log('LOGIN_FAIL', payload)
      return state
        .set('status', EStatuses.Fail)
        .set('message', payload)
    case ActionTypes.LOGIN_WHATSAPP:
      return state
        .set('status', EStatuses.Whatsapp)
        .set('message', 'Whatsapp message sent')

    case ActionTypes.GOOGLE_LOGIN_START:
      return state
        .set('status', EStatuses.Loading)
        .set('message', '')
        .set('user', null)
        .set('tokens', null)
    case ActionTypes.GOOGLE_LOGIN_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('user', payload.user)
        .set('tokens', payload.tokens)
    case ActionTypes.GOOGLE_LOGIN_FAIL:
      return state
        .set('status', EStatuses.Fail)
        .set('message', TRANSLATION.LOGIN_FAIL)

    case ActionTypes.LOGOUT_START:
      return state
        .set('status', EStatuses.Loading)
        .set('message', '')
        .set('user', null)
        .set('tokens', null)
    case ActionTypes.LOGOUT_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('message', TRANSLATION.LOGOUT_SUCCESS)
    case ActionTypes.LOGOUT_FAIL:
      return state
        .set('status', EStatuses.Fail)
        .set('message', TRANSLATION.LOGOUT_FAIL)

    case ActionTypes.REGISTER_START:
      return state
        .set('status', EStatuses.Loading)
        .set('message', '')
        .set('user', null)
        .set('tokens', null)
    case ActionTypes.REGISTER_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('message', TRANSLATION.REGISTER_SUCCESS)
        .set('response', payload)
    case ActionTypes.REGISTER_FAIL:
      return state
        .set('status', EStatuses.Fail)
        .set('message', payload && payload.message || TRANSLATION.REGISTER_FAIL)

    case ActionTypes.REMIND_PASSWORD_START:
      return state
        .set('status', EStatuses.Loading)
        .set('message', '')
        .set('user', null)
        .set('tokens', null)
    case ActionTypes.REMIND_PASSWORD_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('message', TRANSLATION.REMIND_PASSWORD_SUCCESS)
    case ActionTypes.REMIND_PASSWORD_FAIL:
      return state
        .set('status', EStatuses.Fail)
        .set('message', TRANSLATION.REMIND_PASSWORD_FAIL)

    case ActionTypes.SET_TAB:
      return state
        .set('tab', payload)
        .set('status', EStatuses.Default)
        .set('message', '')
    case ActionTypes.SET_TOKENS:
      return state
        .set('tokens', payload)
    case ActionTypes.SET_USER:
      return state
        .set('user', payload)
        .set('tab', payload ? LOGIN_TABS_IDS[0] : LOGIN_TABS_IDS[1])

    case ActionTypes.WHATSAPP_SIGNUP_START:
      return state
        .set('status', EStatuses.Loading)
        .set('message', '')
        .set('whatsappSignUpData', { u_phone: payload })
    case ActionTypes.WHATSAPP_SIGNUP_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('message', TRANSLATION.REGISTER_SUCCESS)
        .set('response', payload)
        .set('whatsappSignUpData', null)
    case ActionTypes.WHATSAPP_SIGNUP_FAIL:
      return state
        .set('status', EStatuses.Fail)
        .set('whatsappSignUpData', null)
        //  .set('message', payload && payload.message || TRANSLATION.REGISTER_FAIL)?

    default:
      return state

  }
}
