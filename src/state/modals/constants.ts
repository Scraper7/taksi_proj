import { IAddressPoint, IOrder } from '../../types/types'
import { EStatuses } from '../../types/types'
import { appName } from '../../constants'

export const moduleName = 'modals'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  SET_CANCEL_MODAL: `${prefix}/SET_CANCEL_MODAL`,
  SET_PICK_TIME_MODAL: `${prefix}/SET_PICK_TIME_MODAL`,
  SET_COMMENTS_MODAL: `${prefix}/SET_COMMENTS_MODAL`,
  SET_DRIVER_MODAL: `${prefix}/SET_DRIVER_MODAL`,
  SET_RATING_MODAL: `${prefix}/SET_RATING_MODAL`,
  SET_TIE_CARD_MODAL: `${prefix}/SET_TIE_CARD_MODAL`,
  SET_CARD_DETAILS_MODAL: `${prefix}/SET_CARD_DETAILS_MODAL`,
  SET_VOTE_MODAL: `${prefix}/SET_VOTE_MODAL`,
  SET_SEATS_MODAL: `${prefix}/SET_PLACE_MODAL`,
  SET_LOGIN_MODAL: `${prefix}/SET_LOGIN_MODAL`,
  SET_ALARM_MODAL: `${prefix}/SET_ALARM_MODAL`,
  SET_WACODE_MODAL: `${prefix}/SET_WACODE_MODAL`,
  SET_REFCODE_MODAL: `${prefix}/SET_REFCODE_MODAL`,
  SET_TAKE_PASSENGER_MODAL: `${prefix}/SET_TAKE_PASSENGER_MODAL`,
  UPDATE_TAKE_PASSENGER_MODAL: `${prefix}/UPDATE_TAKE_PASSENGER_MODAL`,
  SET_TAKE_PASSENGER_MODAL_FROM_REQUEST: `${prefix}/SET_TAKE_PASSENGER_MODAL_FROM_REQUEST`,
  SET_TAKE_PASSENGER_MODAL_FROM: `${prefix}/SET_TAKE_PASSENGER_MODAL_FROM`,
  SET_TAKE_PASSENGER_MODAL_TO_REQUEST: `${prefix}/SET_TAKE_PASSENGER_MODAL_TO_REQUEST`,
  SET_TAKE_PASSENGER_MODAL_TO: `${prefix}/SET_TAKE_PASSENGER_MODAL_TO`,
  SET_DRIVER_CANCEL_MODAL: `${prefix}/SET_DRIVER_CANCEL_MODAL`,
  SET_ON_THE_WAY_MODAL: `${prefix}/SET_ON_THE_WAY_MODAL`,
  SET_MAP_MODAL: `${prefix}/SET_MAP_MODAL`,
  SET_MESSAGE_MODAL: `${prefix}/SET_MESSAGE_MODAL`,
  CLOSE_ALL_MODALS: `${prefix}/CLOSE_ALL_MODALS`,
  SET_ACTIVE_CHAT: `${prefix}/SET_ACTIVE_CHAT`,
  SET_PROFILE_MODAL: `${prefix}/SET_PROFILE_MODAL`,
  SET_CANDIDATES_MODAL: `${prefix}/SET_CANDIDATES_MODAL`,
  SET_DELETE_FILES_MODAL: `${prefix}/SET_DELETE_FILES_MODAL`,
  SET_SHOW_SWITCHERS_MENU: `${prefix}/SET_SHOW_SWITCHERS_MENU`,
  SET_ORDER_CARD_MODAL: `${prefix}/SET_ORDER_CARD_MODAL`,
} as const

export enum EMapModalTypes {
  Client,
  TakePassenger,
  OrderDetails,
  VotingNavigation
}

export interface IModalsState {
  isCancelModalOpen: boolean
  isPickTimeModalOpen: boolean
  isCommentsModalOpen: boolean
  isDriverModalOpen: boolean
  isTieCardModalOpen: boolean
  isCardDetailsModalOpen: boolean
  isVoteModalOpen: boolean
  isSeatsModalOpen: boolean
  isLoginModalOpen: boolean
  isCandidatesModalOpen: boolean
  isShowSwitchersMenu: boolean
  WACodeModal: {
    isOpen: boolean
    login: any
    data: any
  }
  RefCodeModal: {
    isOpen: boolean
    login: any
    data: any
  }
  alarmModal: {
    isOpen: boolean
    seconds: number
  }
  takePassengerModal: {
    isOpen: boolean
    from?: IAddressPoint | null | undefined
    to?: IAddressPoint | null | undefined
  }
  isDriverCancelModalOpen: boolean
  isOnTheWayModalOpen: boolean
  mapModal: {
    isOpen: boolean
    type?: EMapModalTypes
    defaultCenter?: [number, number] | null
    from?: IAddressPoint | null
    to?: IAddressPoint | null
    highlight?: 'from' | 'to' | null
  }
  messageModal: {
    isOpen: boolean
    status?: EStatuses
    kind?: string
    orderID?: IOrder['b_id'] | null
    message?: string
  }
  ratingModal: {
    isOpen: boolean
    orderID?: IOrder['b_id'] | null
  }
  /** "${from};${to}" */
  activeChat: string | null
  profileModal: {
    isOpen: boolean
    status?: EStatuses
  }
  deleteFilesModal: {
    isOpen: boolean
    handleDeleteFile?: () => any
    handleDeleteFiles?: () => any
  }
  orderCardModal: {
    isOpen: boolean
    orderId: IOrder['b_id']
  } | {
    isOpen: false
    orderId?: undefined
  }
}
