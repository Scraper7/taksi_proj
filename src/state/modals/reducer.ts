import { ActionTypes, EMapModalTypes } from './constants'
import { Record } from 'immutable'
import { TAction } from '../../types'
import { IModalsState } from './constants'
import { EStatuses } from '../../types/types'

const ALARM_SECONDS = 60

export const defaultAlarmModal = {
  isOpen: false,
  seconds: 0,
}
export const defaultMessageModal = {
  isOpen: false,
  status: EStatuses.Default,
  message: '',
}
export const defaultMapModal = {
  isOpen: false,
  type: EMapModalTypes.Client,
  defaultCenter: null,
  from: null,
  to: null,
  highlight: null,
}
export const defaultWACodeModal = {
  isOpen: false,
  login: null,
  data: null,
}
export const defaultRefCodeModal = {
  isOpen: false,
  login: null,
  data: null,
}
export const defaultTakePassengerModal = {
  isOpen: false,
  from: null,
  to: null,
}
export const defaultRatingModal = {
  isOpen: false,
  orderID: null,
}
export const defaultProfileModal = {
  isOpen: false,
  status: EStatuses.Default,
}
export const defaultDeleteFilesModal = {
  isOpen: false,
}
const defaultOrderCardModal = {
  isOpen: false,
} as const

export const record = Record<IModalsState>({
  isCancelModalOpen: false,
  isPickTimeModalOpen: false,
  isCommentsModalOpen: false,
  isDriverModalOpen: false,
  isTieCardModalOpen: false,
  isCardDetailsModalOpen: false,
  isVoteModalOpen: false,
  isShowSwitchersMenu: false,
  WACodeModal: { ...defaultWACodeModal },
  RefCodeModal: { ...defaultRefCodeModal },
  isSeatsModalOpen: false,
  isLoginModalOpen: false,
  isDriverCancelModalOpen: false,
  isOnTheWayModalOpen: false,
  isCandidatesModalOpen: false,
  profileModal: { ...defaultProfileModal },
  alarmModal: { ...defaultAlarmModal },
  messageModal: { ...defaultMessageModal },
  mapModal: { ...defaultMapModal },
  takePassengerModal: { ...defaultTakePassengerModal },
  ratingModal: { ...defaultRatingModal },
  activeChat: null,
  deleteFilesModal: { ...defaultDeleteFilesModal },
  orderCardModal: defaultOrderCardModal,
})

export default function reducer(state = new record(), action: TAction) {
  const { type, payload } = action

  switch (type) {
    case ActionTypes.SET_CANCEL_MODAL:
      return state
        .set('isCancelModalOpen', payload)
    case ActionTypes.SET_PICK_TIME_MODAL:
      return state
        .set('isPickTimeModalOpen', payload)
    case ActionTypes.SET_COMMENTS_MODAL:
      return state
        .set('isCommentsModalOpen', payload)
    case ActionTypes.SET_DRIVER_MODAL:
      return state
        .set('isDriverModalOpen', payload)
    case ActionTypes.SET_RATING_MODAL:
      return state
        .set('ratingModal', payload)
    case ActionTypes.SET_TIE_CARD_MODAL:
      return state
        .set('isTieCardModalOpen', payload)
    case ActionTypes.SET_CARD_DETAILS_MODAL:
      return state
        .set('isCardDetailsModalOpen', payload)
    case ActionTypes.SET_VOTE_MODAL:
      return state
        .set('isVoteModalOpen', payload)
    case ActionTypes.SET_SEATS_MODAL:
      return state
        .set('isSeatsModalOpen', payload)
    case ActionTypes.SET_LOGIN_MODAL:
      return state
        .set('isLoginModalOpen', payload)
    case ActionTypes.SET_CANDIDATES_MODAL:
      return state
        .set('isCandidatesModalOpen', payload)
    case ActionTypes.SET_WACODE_MODAL:
      return state
        .set('WACodeModal', payload)
    case ActionTypes.SET_REFCODE_MODAL:
      return state
        .set('RefCodeModal', payload)
    case ActionTypes.SET_ALARM_MODAL:
      return state
        .set('alarmModal', { ...payload, seconds: payload.seconds || (payload.isOpen ? ALARM_SECONDS : 0) })
    case ActionTypes.SET_TAKE_PASSENGER_MODAL:
      return state
        .set('takePassengerModal', payload)
    case ActionTypes.UPDATE_TAKE_PASSENGER_MODAL:
      return state
        .mergeDeep({ takePassengerModal: payload })
    case ActionTypes.SET_TAKE_PASSENGER_MODAL_FROM:
      return state
        .setIn(['takePassengerModal', 'from'], payload)
    case ActionTypes.SET_TAKE_PASSENGER_MODAL_TO:
      return state
        .setIn(['takePassengerModal', 'to'], payload)
    case ActionTypes.SET_DRIVER_CANCEL_MODAL:
      return state
        .set('isDriverCancelModalOpen', payload)
    case ActionTypes.SET_ON_THE_WAY_MODAL:
      return state
        .set('isOnTheWayModalOpen', payload)
    case ActionTypes.SET_MAP_MODAL:
      return state
        .set('mapModal', payload)
    case ActionTypes.SET_MESSAGE_MODAL:
      return state
        .set('messageModal', payload)
    case ActionTypes.SET_ACTIVE_CHAT:
      return state
        .set('activeChat', payload)
    case ActionTypes.SET_PROFILE_MODAL:
      return state
        .set('profileModal', payload)
    case ActionTypes.SET_DELETE_FILES_MODAL:
      return state
        .set('deleteFilesModal', payload)
    case ActionTypes.SET_ORDER_CARD_MODAL:
      return state
        .set('orderCardModal', payload)
    case ActionTypes.CLOSE_ALL_MODALS:
      return state
        .set('isCancelModalOpen', false)
        .set('isPickTimeModalOpen', false)
        .set('isCommentsModalOpen', false)
        .set('isDriverModalOpen', false)
        .set('isTieCardModalOpen', false)
        .set('isCardDetailsModalOpen', false)
        .set('isVoteModalOpen', false)
        .set('isSeatsModalOpen', false)
        .set('isLoginModalOpen', false)
        .set('isDriverCancelModalOpen', false)
        .set('isOnTheWayModalOpen', false)
        .set('isCandidatesModalOpen', false)
        .set('takePassengerModal', { ...defaultTakePassengerModal })
        .set('alarmModal', { ...defaultAlarmModal })
        .set('mapModal', { ...defaultMapModal })
        .set('messageModal', { ...defaultMessageModal })
        .set('ratingModal', { ...defaultRatingModal })
        .set('profileModal', { ...defaultProfileModal })
        .set('deleteFilesModal', { ...defaultDeleteFilesModal })
        .set('orderCardModal', defaultOrderCardModal)
    case ActionTypes.SET_SHOW_SWITCHERS_MENU:
      return state.set('isShowSwitchersMenu', payload)
    default:
      return state
  }
}
