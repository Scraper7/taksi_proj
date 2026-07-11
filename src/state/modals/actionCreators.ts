import { TAction } from '../../types/index'
import { ActionTypes, IModalsState } from './constants'

export const setCancelModal = (payload: IModalsState['isCancelModalOpen']): TAction => {
  return { type: ActionTypes.SET_CANCEL_MODAL, payload }
}
export const setPickTimeModal = (payload: IModalsState['isPickTimeModalOpen']): TAction => {
  return { type: ActionTypes.SET_PICK_TIME_MODAL, payload }
}
export const setCommentsModal = (payload: IModalsState['isCommentsModalOpen']): TAction => {
  return { type: ActionTypes.SET_COMMENTS_MODAL, payload }
}
export const setDriverModal = (payload: IModalsState['isDriverModalOpen']): TAction => {
  return { type: ActionTypes.SET_DRIVER_MODAL, payload }
}
export const setRatingModal = (payload: IModalsState['ratingModal']): TAction => {
  return { type: ActionTypes.SET_RATING_MODAL, payload }
}
export const setTieCardModal = (payload: IModalsState['isTieCardModalOpen']): TAction => {
  return { type: ActionTypes.SET_TIE_CARD_MODAL, payload }
}
export const setCardDetailsModal = (payload: IModalsState['isCardDetailsModalOpen']): TAction => {
  return { type: ActionTypes.SET_CARD_DETAILS_MODAL, payload }
}
export const setVoteModal = (payload: IModalsState['isVoteModalOpen']): TAction => {
  return { type: ActionTypes.SET_VOTE_MODAL, payload }
}
export const setSeatsModal = (payload: IModalsState['isSeatsModalOpen']): TAction => {
  return { type: ActionTypes.SET_SEATS_MODAL, payload }
}
export const setLoginModal = (payload: IModalsState['isLoginModalOpen']): TAction => {
  return { type: ActionTypes.SET_LOGIN_MODAL, payload }
}
export const setAlarmModal = (payload: Partial<IModalsState['alarmModal']>): TAction => {
  return { type: ActionTypes.SET_ALARM_MODAL, payload }
}
export const setWACodeModal = (payload: Partial<IModalsState['WACodeModal']>): TAction => {
  return { type: ActionTypes.SET_WACODE_MODAL, payload }
}
export const setRefCodeModal = (payload: Partial<IModalsState['RefCodeModal']>): TAction => {
  return { type: ActionTypes.SET_REFCODE_MODAL, payload }
}
export const setTakePassengerModal = (payload: IModalsState['takePassengerModal']): TAction => {
  return { type: ActionTypes.SET_TAKE_PASSENGER_MODAL, payload }
}
export const updateTakePassengerModal = (payload: Partial<IModalsState['takePassengerModal']>): TAction => {
  return { type: ActionTypes.UPDATE_TAKE_PASSENGER_MODAL, payload }
}
export const setTakePassengerModalFrom = (payload: IModalsState['takePassengerModal']['from']): TAction => {
  return { type: ActionTypes.SET_TAKE_PASSENGER_MODAL_FROM_REQUEST, payload }
}
export const setTakePassengerModalTo = (payload: IModalsState['takePassengerModal']['to']): TAction => {
  return { type: ActionTypes.SET_TAKE_PASSENGER_MODAL_TO_REQUEST, payload }
}
export const setDriverCancelModal = (payload: IModalsState['isDriverCancelModalOpen']): TAction => {
  return { type: ActionTypes.SET_DRIVER_CANCEL_MODAL, payload }
}
export const setOnTheWayModal = (payload: IModalsState['isOnTheWayModalOpen']): TAction => {
  return { type: ActionTypes.SET_ON_THE_WAY_MODAL, payload }
}
export const setMapModal = (payload: IModalsState['mapModal']): TAction => {
  return { type: ActionTypes.SET_MAP_MODAL, payload }
}
export const setMessageModal = (payload: IModalsState['messageModal']): TAction => {
  return { type: ActionTypes.SET_MESSAGE_MODAL, payload }
}
export const closeAllModals = (): TAction => {
  return { type: ActionTypes.CLOSE_ALL_MODALS }
}
export const setActiveChat = (payload: IModalsState['activeChat']): TAction => {
  return { type: ActionTypes.SET_ACTIVE_CHAT, payload }
}
export const setProfileModal = (payload: IModalsState['profileModal']): TAction => {
  return { type: ActionTypes.SET_PROFILE_MODAL, payload }
}
export const setCandidatesModal = (payload: IModalsState['isCandidatesModalOpen']): TAction => {
  return { type: ActionTypes.SET_CANDIDATES_MODAL, payload }
}
export const setDeleteFilesModal = (payload: IModalsState['deleteFilesModal']): TAction => {
  return { type: ActionTypes.SET_DELETE_FILES_MODAL, payload }
}
export const setIsShowSwitchersMenu = (payload: IModalsState['isShowSwitchersMenu']): TAction => {
  return { type: ActionTypes.SET_SHOW_SWITCHERS_MENU, payload }
}
export const setOrderCardModal = (
  payload: IModalsState['orderCardModal'],
): TAction => ({ type: ActionTypes.SET_ORDER_CARD_MODAL, payload })