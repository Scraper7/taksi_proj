import { createSelector } from 'reselect'
import { moduleName } from './constants'
import { IRootState } from '../'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const isCancelModalOpen = createSelector(moduleSelector, state => state.isCancelModalOpen)
export const isPickTimeModalOpen = createSelector(moduleSelector, state => state.isPickTimeModalOpen)
export const isCommentsModalOpen = createSelector(moduleSelector, state => state.isCommentsModalOpen)
export const isDriverModalOpen = createSelector(moduleSelector, state => state.isDriverModalOpen)
export const isWACodeModalOpen = createSelector(moduleSelector, state => state.WACodeModal)
export const isRefCodeModalOpen = createSelector(moduleSelector, state => state.RefCodeModal)
export const isRatingModalOpen = createSelector(moduleSelector, state => state.ratingModal.isOpen)
export const ratingModalOrderID = createSelector(moduleSelector, state => state.ratingModal.orderID)
export const isTieCardModalOpen = createSelector(moduleSelector, state => state.isTieCardModalOpen)
export const isCardDetailsModalOpen = createSelector(moduleSelector, state => state.isCardDetailsModalOpen)
export const isVoteModalOpen = createSelector(moduleSelector, state => state.isVoteModalOpen)
export const isSeatsModalOpen = createSelector(moduleSelector, state => state.isSeatsModalOpen)
export const isLoginModalOpen = createSelector(moduleSelector, state => state.isLoginModalOpen)
export const isAlarmModalOpen = createSelector(moduleSelector, state => state.alarmModal.isOpen)
export const alarmModalSeconds = createSelector(moduleSelector, state => state.alarmModal.seconds)
export const isDriverCancelModalOpen = createSelector(moduleSelector, state => state.isDriverCancelModalOpen)
export const isOnTheWayModalOpen = createSelector(moduleSelector, state => state.isOnTheWayModalOpen)
export const isMapModalOpen = createSelector(moduleSelector, state => state.mapModal.isOpen)
export const mapModalType = createSelector(moduleSelector, state => state.mapModal.type)
export const mapModalDefaultCenter = createSelector(moduleSelector, state => state.mapModal.defaultCenter)
export const mapModalFrom = createSelector(moduleSelector, state => state.mapModal.from)
export const mapModalTo = createSelector(moduleSelector, state => state.mapModal.to)
export const mapModalHighlight = createSelector(moduleSelector, state => state.mapModal.highlight)
export const isMessageModalOpen = createSelector(moduleSelector, state => state.messageModal.isOpen)
export const messageModalMessage = createSelector(moduleSelector, state => state.messageModal.message)
export const messageModalStatus = createSelector(moduleSelector, state => state.messageModal.status)
export const isTakePassengerModalOpen = createSelector(moduleSelector, state => state.takePassengerModal.isOpen)
export const takePassengerModalFrom = createSelector(moduleSelector, state => state.takePassengerModal.from)
export const takePassengerModalTo = createSelector(moduleSelector, state => state.takePassengerModal.to)
export const activeChat = createSelector(moduleSelector, state => state.activeChat)
export const isProfileModalOpen = createSelector(moduleSelector, state => state.profileModal.isOpen)
export const profileModalStatus = createSelector(moduleSelector, state => state.profileModal.status)
export const isCandidatesModalOpen = createSelector(moduleSelector, state => state.isCandidatesModalOpen)
export const isDeleteFilesModalOpen = createSelector(moduleSelector, state => state.deleteFilesModal.isOpen)
export const deleteFilesModalDeleteFile = createSelector(
  moduleSelector, state => state.deleteFilesModal.handleDeleteFile,
)
export const deleteFilesModalDeleteFiles = createSelector(
  moduleSelector, state => state.deleteFilesModal.handleDeleteFiles,
)
export const isShowSwitchersMenu = createSelector(moduleSelector, state => state.isShowSwitchersMenu)
export const orderCardModal = (state: IRootState) =>
  moduleSelector(state).orderCardModal
export const isOrderCardModalOpen = (state: IRootState) =>
  orderCardModal(state).isOpen
