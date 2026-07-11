import React, { useRef } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { createSelector } from 'reselect'
import { IRootState } from '../../state'
import { modalsSelectors } from '../../state/modals'
import Chat from '../Chat'
import CancelOrderModal from './CancelModal'
import TimerModal from './PickTimeModal'
import CommentsModal from './CommentsModal'
import DriverModal from './DriverModal'
import RatingModal from './RatingModal'
import OnTheWayModal from './OnTheWayModal'
import TieCardModal from './TieCardModal'
import CardDetailsModal from './CardDetailsModal'
import VoteModal from './VoteModal'
import PlaceModal from './SeatsModal'
import LoginModal from './LoginModal'
import AlarmModal from './AlarmModal'
import MapModal from './MapModal'
import TakePassengerModal from './TakePassengerModal'
import CancelDriverOrderModal from './DriverCancelModal'
import ProfileModal from './ProfileModal'
import CandidatesModal from './CandidatesModal'
import MessageModal from './MessageModal'
import WACodeModal from './LoginModal/WACodeModal'
import RefCodeModal from './LoginModal/RefCodeModal'
import CardModal from './CardModal'

const COMPONENTS = [
  [Chat, modalsSelectors.activeChat],
  [CancelOrderModal, modalsSelectors.isCancelModalOpen],
  [TimerModal, modalsSelectors.isPickTimeModalOpen],
  [CommentsModal, modalsSelectors.isCommentsModalOpen],
  [DriverModal, modalsSelectors.isDriverModalOpen],
  [RatingModal, modalsSelectors.isRatingModalOpen],
  [OnTheWayModal, modalsSelectors.isOnTheWayModalOpen],
  [TieCardModal, modalsSelectors.isTieCardModalOpen],
  [CardDetailsModal, modalsSelectors.isCardDetailsModalOpen],
  [VoteModal, modalsSelectors.isVoteModalOpen],
  [PlaceModal, modalsSelectors.isSeatsModalOpen],
  [LoginModal, modalsSelectors.isLoginModalOpen],
  [AlarmModal, modalsSelectors.isAlarmModalOpen],
  [MapModal, modalsSelectors.isMapModalOpen],
  [TakePassengerModal, modalsSelectors.isTakePassengerModalOpen],
  [CancelDriverOrderModal, modalsSelectors.isDriverCancelModalOpen],
  [ProfileModal, modalsSelectors.isProfileModalOpen],
  [CandidatesModal, modalsSelectors.isCandidatesModalOpen],
  [MessageModal, modalsSelectors.isMessageModalOpen],
  [WACodeModal, modalsSelectors.isWACodeModalOpen],
  [RefCodeModal, modalsSelectors.isRefCodeModalOpen],
  [CardModal, modalsSelectors.isOrderCardModalOpen],
] as const

const modalsSelector = createSelector(
  (state: IRootState) => state,
  state => new Map<React.ComponentType, boolean>(COMPONENTS.map(
    ([Component, selector]) => [Component, !!selector(state)],
  )),
  { memoizeOptions: {
    resultEqualityCheck: (oldValue, newValue) => [...newValue]
      .every(([Component, isOpen]) => oldValue.get(Component) === isOpen),
  } },
)

const mapStateToProps = (state: IRootState) => ({
  modals: modalsSelector(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function ModalStack({ modals }: IProps) {
  const modalStack = useRef<[React.ComponentType, React.ReactNode][]>([])
  const prevModals = useRef<typeof modals | undefined>(undefined)
  if (modals !== prevModals.current) {

    const added = new Map<React.ComponentType, number>()
    for (const [index, [Component]] of COMPONENTS.entries())
      if (modals.get(Component) && !prevModals.current?.get(Component))
        added.set(Component, index)
    modalStack.current = modalStack.current
      .filter(([Component]) => !added.has(Component))
    for (const [Component, index] of added)
      modalStack.current.push([Component, <Component key={index} />])

    prevModals.current = modals
  }

  return modalStack.current.map(([_, element]) => element)
}

export default connector(ModalStack)