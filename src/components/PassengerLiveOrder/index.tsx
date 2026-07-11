import React, { useEffect, useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { configSelectors } from '../../state/config'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { clientOrderActionCreators } from '../../state/clientOrder'
import { ordersActionCreators } from '../../state/orders'
import { userSelectors } from '../../state/user'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import {
  EBookingDriverState,
  EPaymentWays,
  EStatuses,
  ICar,
  IDriver,
  IOrder,
  IUser,
} from '../../types/types'
import { distanceBetweenEarthCoordinates, formatCurrency, getPayment } from '../../tools/utils'
import { candidateMode } from '../../tools/order'
import { getDriverOfferCommentLabels, getDriverOfferEtaLabels } from '../../tools/siteConstantOptions'
import {
  addPassengerRejectedChoice,
  clearPassengerConfirmedChoice,
  getPassengerConfirmedChoice,
  getPassengerPickupEta,
  getPassengerRejectedChoices,
  getChoiceDriverIdsToReleaseBeforeChoosing,
  isChoiceDriverSelectionBlockedError,
  isChoiceOrder,
  isOfferOrder,
  isStoredSimpleOrderMode,
  isVisibleChoiceDriverState,
  isVotingOrder,
  restartPassengerChoiceSearch,
  setPassengerConfirmedChoice,
} from '../../tools/driverOffer'
import { getDriverColor } from '../../tools/driverColors'
import { getDriverDoorNumber, normalizeDriverDoorNumber, shouldShowDriverDoorNumber } from '../../tools/driverDoorNumber'
import { getTimestamp } from '../../tools/reliableTime'
import CarClassBadge, { getCandidateCarClassKind, getRequiredCarClassKind } from '../CarClassBadge'
import DriverChoiceCancelReasonModal from '../modals/DriverChoiceCancelReasonModal'
import './styles.scss'

const DRIVER_AVATAR_FALLBACK = '/assets/images/default/driver-avatar-default.png'

const mapStateToProps = (state: IRootState) => ({
  currentUser: userSelectors.user(state),
  activeChat: modalsSelectors.activeChat(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  setActiveChat: modalsActionCreators.setActiveChat,
  setAlarmModal: modalsActionCreators.setAlarmModal,
  setCancelModal: modalsActionCreators.setCancelModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  setPickupPrice: clientOrderActionCreators.setPickupPrice,
  refreshActiveOrders: ordersActionCreators.refreshActiveOrders,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  order: IOrder
  onNewOrder?: () => void
}

function PassengerLiveOrder({
  order,
  onNewOrder,
  currentUser,
  activeChat,
  language,
  setActiveChat,
  setAlarmModal,
  setCancelModal,
  setMessageModal,
  setRatingModal,
  setSelectedOrder,
  setPickupPrice,
  refreshActiveOrders,
}: IProps) {
  const languageIso = language?.iso

  const [confirmedChoiceId, setConfirmedChoiceId] = useState<IDriver['u_id'] | null>(() => getPassengerConfirmedChoice(order.b_id))
  const [rejectedChoiceIds, setRejectedChoiceIds] = useState<IDriver['u_id'][]>(() => getPassengerRejectedChoices(order.b_id))
  const [pickupEtaVersion, setPickupEtaVersion] = useState(0)
  const candidateDriversCacheRef = React.useRef<Record<string, IDriver[]>>({})
  const offerOrder = useMemo(() => isOfferOrder(order), [order])
  const selectedDriver = useMemo(() => getSelectedDriver(order, confirmedChoiceId), [order, confirmedChoiceId, languageIso])
  const candidateDrivers = useMemo(() => {
    const rejected = new Set(rejectedChoiceIds.map(String))
    const orderKey = String(order.b_id)

    if (confirmedChoiceId) {
      candidateDriversCacheRef.current[orderKey] = []
      return []
    }

    const currentCandidates = getCandidateDrivers(order, offerOrder, confirmedChoiceId)
    const cachedCandidates = candidateDriversCacheRef.current[orderKey] || []
    const mergedCandidates = [...currentCandidates]

    cachedCandidates.forEach(candidate => {
      const candidateUserId = String(candidate.u_id ?? '')
      const candidateCarId = String(candidate.c_id ?? '')
      const exists = mergedCandidates.some(item =>
        (candidateUserId && String(item.u_id ?? '') === candidateUserId) ||
        (candidateCarId && String(item.c_id ?? '') === candidateCarId),
      )

      if (!exists)
        mergedCandidates.push(candidate)
    })

    const visibleCandidates = mergedCandidates.filter(driver =>
      !rejected.has(String(driver.u_id)) &&
      !rejected.has(String(driver.c_id ?? '')) &&
      isVisibleChoiceDriverState(driver.c_state),
    )

    candidateDriversCacheRef.current[orderKey] = visibleCandidates

    return sortCandidateDriversByEta(visibleCandidates, order)
  }, [order, offerOrder, confirmedChoiceId, rejectedChoiceIds.map(String).sort().join('|'), pickupEtaVersion, languageIso])

  const [driverUser, setDriverUser] = useState<IUser | null>(null)
  const [driverCar, setDriverCar] = useState<ICar | null>(null)
  const [driverDoorNumber, setDriverDoorNumber] = useState('')
  const [candidateUsers, setCandidateUsers] = useState<IUser[]>([])
  const [candidateCars, setCandidateCars] = useState<ICar[]>([])
  const [activeCandidate, setActiveCandidate] = useState<IDriver['u_id'] | null>(null)
  const [heldCandidate, setHeldCandidate] = useState<IDriver['u_id'] | null>(null)
  const [isChoosing, setIsChoosing] = useState(false)
  const [cancelingSelectedDriver, setCancelingSelectedDriver] = useState(false)
  const [driverCancelReasonModalOpen, setDriverCancelReasonModalOpen] = useState(false)
  const [driverCancelTarget, setDriverCancelTarget] = useState<IDriver['u_id'] | null>(null)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)

  useEffect(() => {
    setConfirmedChoiceId(getPassengerConfirmedChoice(order.b_id))
    setRejectedChoiceIds(getPassengerRejectedChoices(order.b_id))
  }, [order.b_id])

  useEffect(() => {
    const handlePickupEtaChange = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.orderId && String(detail.orderId) !== String(order.b_id))
        return

      setPickupEtaVersion(version => version + 1)
    }

    window.addEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
    return () => window.removeEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
  }, [order.b_id])

  useEffect(() => {
    const handlePassengerChoiceChange = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.orderId && String(detail.orderId) !== String(order.b_id))
        return

      setConfirmedChoiceId(getPassengerConfirmedChoice(order.b_id))
      setRejectedChoiceIds(getPassengerRejectedChoices(order.b_id))
    }

    window.addEventListener('passengerRejectedChoicesChanged', handlePassengerChoiceChange)
    window.addEventListener('passengerCanceledDriverChoice', handlePassengerChoiceChange)
    window.addEventListener('passengerConfirmedDriverChoice', handlePassengerChoiceChange)
    return () => {
      window.removeEventListener('passengerRejectedChoicesChanged', handlePassengerChoiceChange)
      window.removeEventListener('passengerCanceledDriverChoice', handlePassengerChoiceChange)
      window.removeEventListener('passengerConfirmedDriverChoice', handlePassengerChoiceChange)
    }
  }, [order.b_id])

  useEffect(() => {
    setHeldCandidate(null)
  }, [candidateDrivers.map(candidate => candidate.u_id).join('|')])

  useEffect(() => {
    setAvatarFailed(false)
  }, [selectedDriver?.u_id])

  useEffect(() => {
    let cancelled = false

    if (!selectedDriver) {
      setDriverUser(null)
      setDriverCar(null)
      return
    }

    API.getUser(selectedDriver.u_id)
      .then(user => {
        if (!cancelled) setDriverUser(user)
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) setDriverUser(null)
      })

    if (selectedDriver.c_id) {
      API.getCar(selectedDriver.c_id)
        .then(car => {
          if (!cancelled) setDriverCar(car)
        })
        .catch(error => {
          console.error(error)
          if (!cancelled) setDriverCar(null)
        })
    } else {
      setDriverCar(null)
    }

    return () => {
      cancelled = true
    }
  }, [selectedDriver?.u_id, selectedDriver?.c_id])

  useEffect(() => {
    if (!selectedDriver) {
      setDriverDoorNumber('')
      return
    }

    setDriverDoorNumber(getDriverDoorNumber(selectedDriver, driverCar))
  }, [
    order.b_id,
    selectedDriver?.u_id,
    selectedDriver?.c_id,
    driverCar?.c_id,
    driverCar?.registration_plate,
  ])

  useEffect(() => {
    let cancelled = false

    if (!candidateDrivers.length || selectedDriver) {
      setCandidateUsers([])
      setCandidateCars([])
      setActiveCandidate(null)
      return
    }

    API.getUsers(candidateDrivers.map(candidate => candidate.u_id))
      .then(users => {
        if (!cancelled) setCandidateUsers(users)
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) setCandidateUsers([])
      })

    API.getCars(candidateDrivers.map(candidate => candidate.c_id).filter(Boolean))
      .then(cars => {
        if (!cancelled) setCandidateCars(cars)
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) setCandidateCars([])
      })

    setActiveCandidate(prev => (
      prev && candidateDrivers.some(candidate => candidate.u_id === prev) ?
        prev :
        null
    ))

    return () => {
      cancelled = true
    }
  }, [
    selectedDriver?.u_id,
    candidateDrivers.map(candidate => `${candidate.u_id}_${candidate.c_id}`).sort().join('|'),
  ])

  const payment = getPayment(order)
  const hasDriver = Boolean(selectedDriver)
  const canCancelSelectedDriver = Boolean(isChoiceOrder(order) && selectedDriver && [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
  ].includes(selectedDriver.c_state))
  const driverName = getDriverName(selectedDriver, driverUser)
  const carText = getCarText(driverCar)
  const plate = driverCar?.registration_plate || selectedDriver?.c_id || '—'
  const avatarSrc = getAvatarSrc(driverUser, selectedDriver, avatarFailed)
  const pickup = getCleanAddress(
    order.b_options?.fromShortAddress,
    order.b_start_address,
  )
  const destination = getCleanAddress(
    order.b_options?.toShortAddress,
    order.b_destination_address,
  )
  const price = formatPayment(payment.value)
  const paymentWay = getPaymentWayText(order.b_payment_way)
  const selectedCandidate = candidateDrivers.find(candidate => candidate.u_id === activeCandidate) ?? null
  const requiredCarClassKind = getRequiredCarClassKind(order)
  const isTripStarted = selectedDriver?.c_state === EBookingDriverState.Started
  const canContactDriver = hasDriver && !isTripStarted

  useEffect(() => {
    if (!isTripStarted || !activeChat || !currentUser?.u_id || !selectedDriver?.u_id)
      return

    const from = `${currentUser.u_id}_${order.b_id}`
    const to = `${selectedDriver.u_id}_${order.b_id}`
    const chatID = `${from};${to}`

    if (activeChat === chatID)
      setActiveChat(null)
  }, [
    isTripStarted,
    activeChat,
    currentUser?.u_id,
    selectedDriver?.u_id,
    order.b_id,
    setActiveChat,
  ])

  const handleChatClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (isTripStarted || !currentUser?.u_id || !selectedDriver?.u_id)
      return

    const from = `${currentUser.u_id}_${order.b_id}`
    const to = `${selectedDriver.u_id}_${order.b_id}`
    const chatID = `${from};${to}`
    setActiveChat(activeChat === chatID ? null : chatID)
  }

  const handleCallClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const phone = driverUser?.u_phone || selectedDriver?.user?.u_phone
    if (phone) window.location.href = `tel:${phone}`
  }


  const handleCancelClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    setSelectedOrder(order.b_id)
    setCancelModal(true)
  }

  const handleFinishClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (isFinishing)
      return

    setSelectedOrder(order.b_id)
    setIsFinishing(true)

    API.setOrderState(order.b_id, EBookingDriverState.Finished)
      .then(() => {
        setPickupPrice(null)
        refreshActiveOrders()
        setRatingModal({ isOpen: true, orderID: order.b_id })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
      .finally(() => setIsFinishing(false))
  }

  const handleSosClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setAlarmModal({ isOpen: true })
  }

  const handleChooseCandidate = async(event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!selectedCandidate?.u_id || isChoosing || cancelingSelectedDriver)
      return

    const nextCandidateId = selectedCandidate.u_id
    setIsChoosing(true)
    try {
      const releaseIds = Array.from(new Set([
        ...getChoiceDriverIdsToReleaseBeforeChoosing(order, nextCandidateId),
        ...rejectedChoiceIds
          .map(String)
          .filter(rejectedId => rejectedId && rejectedId !== String(nextCandidateId)),
      ]))

      try {
        await API.releaseCandidateChoice(order.b_id)
      } catch (error) {
        console.error(error)
      }

      for (const releaseId of releaseIds) {
        try {
          await API.releaseCandidateChoice(order.b_id, releaseId)
        } catch (error) {
          console.error(error)
        }
      }

      try {
        await API.chooseCandidate(order.b_id, nextCandidateId)
      } catch (error) {
        if (!isChoiceDriverSelectionBlockedError(error))
          throw error

        const hardReleaseIds = Array.from(new Set([
          ...releaseIds,
          ...(order.drivers ?? [])
            .filter(driver =>
              String(driver.u_id ?? '') &&
              String(driver.u_id) !== String(nextCandidateId) &&
              [
                EBookingDriverState.Performer,
                EBookingDriverState.Arrived,
                EBookingDriverState.Started,
              ].includes(driver.c_state),
            )
            .map(driver => String(driver.u_id)),
        ]))

        try {
          await API.releaseCandidateChoice(order.b_id)
        } catch (releaseError) {
          console.error(releaseError)
        }

        for (const releaseId of hardReleaseIds) {
          try {
            await API.releaseCandidateChoice(order.b_id, releaseId)
          } catch (releaseError) {
            console.error(releaseError)
          }
        }

        await wait(650)
        await API.chooseCandidate(order.b_id, nextCandidateId)
      }

      setPassengerConfirmedChoice(order.b_id, nextCandidateId)
      setConfirmedChoiceId(nextCandidateId)
      setActiveCandidate(nextCandidateId)
      refreshActiveOrders()
    } catch (error) {
      console.error(error)

      if (canUseLocalChoiceFallback(order, nextCandidateId, rejectedChoiceIds)) {
        setPassengerConfirmedChoice(order.b_id, nextCandidateId)
        setConfirmedChoiceId(nextCandidateId)
        setActiveCandidate(nextCandidateId)
        refreshActiveOrders()
        return
      }

      setMessageModal({
        isOpen: true,
        status: EStatuses.Fail,
        message: t(TRANSLATION.CLIENT_DRIVER_SELECT_ERROR),
      })
    } finally {
      setIsChoosing(false)
    }
  }

  const handleCancelSelectedDriverClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!isChoiceOrder(order) || !selectedDriver?.u_id || cancelingSelectedDriver)
      return

    setDriverCancelTarget(selectedDriver.u_id)
    setDriverCancelReasonModalOpen(true)
  }

  const handleCloseDriverCancelReasonModal = () => {
    if (cancelingSelectedDriver)
      return

    setDriverCancelReasonModalOpen(false)
    setDriverCancelTarget(null)
  }

  const handleConfirmCancelSelectedDriver = (reason?: string) => {
    const driverId = driverCancelTarget ?? selectedDriver?.u_id
    if (!driverId || cancelingSelectedDriver)
      return

    setCancelingSelectedDriver(true)

    ;(async() => {
      let releasedByBackend = false
      try {
        await API.releaseCandidateChoice(order.b_id, driverId)
        releasedByBackend = true
      } catch (error) {
        console.error(error, reason)
      }

      if (!releasedByBackend) {
        try {
          await API.releaseCandidateChoice(order.b_id)
          releasedByBackend = true
        } catch (error) {
          console.error(error)
        }
      }

      if (!releasedByBackend)
        throw new Error('backend_release_candidate_failed')

      addPassengerRejectedChoice(order.b_id, driverId)
      restartPassengerChoiceSearch(order.b_id)
      clearPassengerConfirmedChoice(order.b_id, driverId)
      setRejectedChoiceIds(getPassengerRejectedChoices(order.b_id))
      setConfirmedChoiceId(null)
      setActiveCandidate(null)
      setDriverCancelReasonModalOpen(false)

      if (isChoiceOrder(order)) {
        try {
          const elapsedSeconds = getOrderElapsedSeconds(order)
          await API.setWaitingTime(
            order.b_id,
            elapsedSeconds ?? getOrderWaitingSeconds(order),
            SITE_CONSTANTS.WAITING_INTERVAL,
          )
        } catch (error) {
          console.error(error)
        }
      }
    })()
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
      .finally(() => {
        refreshActiveOrders()
        setCancelingSelectedDriver(false)
        setDriverCancelTarget(null)
      })
  }


  return (
    <>
      <section className={cn('passenger-live-order', {
      'passenger-live-order--search': !hasDriver,
      'passenger-live-order--trip': isTripStarted,
    })}>
      <div className="passenger-live-order__handle" />

      {!hasDriver ? (
        <div className="passenger-live-order__search-body">
          <div className="passenger-live-order__metrics passenger-live-order__metrics--search">
            <div>
              <span>{t(TRANSLATION.CLIENT_RESPONSES_COUNT)}</span>
              <strong>{candidateDrivers.length}</strong>
            </div>
            <div className="passenger-live-order__metrics-car-class">
              <span>Класс авто</span>
              <CarClassBadge kind={requiredCarClassKind} />
            </div>
          </div>

          <div className="passenger-live-order__details-grid passenger-live-order__details-grid--search">
            <div className="passenger-live-order__detail passenger-live-order__detail--route passenger-live-order__detail--from">
              <span>{t(TRANSLATION.FROM)}</span>
              <strong>{pickup}</strong>
            </div>
            <div className="passenger-live-order__detail passenger-live-order__detail--route passenger-live-order__detail--to">
              <span>{t(TRANSLATION.TO)}</span>
              <strong>{destination}</strong>
            </div>
            <div className="passenger-live-order__detail passenger-live-order__detail--price">
              <span>{t(TRANSLATION.COST)}</span>
              <strong>{price}</strong>
            </div>
          </div>

          {candidateDrivers.length ? (
            <div className={cn('passenger-live-order__candidates', {
              'passenger-live-order__candidates--offer': offerOrder,
            })}>
              <div className="passenger-live-order__section-title">
                {offerOrder ? t(TRANSLATION.CLIENT_OFFER_TITLE) : t(TRANSLATION.CLIENT_CHOOSE_DRIVER)}
              </div>
              <div className={cn('passenger-live-order__candidate-list', {
                'passenger-live-order__candidate-list--offer': offerOrder,
              })}>
              {candidateDrivers.map(candidate => {
                const user = candidateUsers.find(item => item.u_id === candidate.u_id)
                const car = candidateCars.find(item => item.c_id === candidate.c_id)
                const isActive = activeCandidate === candidate.u_id
                const isHeld = heldCandidate === candidate.u_id
                const isExpandedCandidate = isActive || isHeld
                const offer = getDriverOfferInfo(candidate, order)
                const pickupEta = getCandidatePickupEtaText(candidate, order ?? null, getPassengerPickupEta(order?.b_id, candidate))
                const seatsText = getFirstFilledOfferValue(offer.seats) || '—'
                const candidateCarClassKind = getCandidateCarClassKind(car, order)
                const candidateColor = getDriverColor(candidate, order.drivers ?? candidateDrivers)

                return (
                  <button
                    type="button"
                    key={candidate.u_id}
                    className={cn('passenger-live-order__candidate', { 'is-active': isActive, 'is-held': isExpandedCandidate })}
                    onClick={() => setActiveCandidate(prev => prev === candidate.u_id ? null : candidate.u_id)}
                    onPointerDown={() => setHeldCandidate(candidate.u_id)}
                    onPointerUp={() => setHeldCandidate(null)}
                    onPointerLeave={() => setHeldCandidate(null)}
                    onPointerCancel={() => setHeldCandidate(null)}
                    onTouchStart={() => setHeldCandidate(candidate.u_id)}
                    onTouchEnd={() => setHeldCandidate(null)}
                    onTouchCancel={() => setHeldCandidate(null)}
                    onMouseDown={() => setHeldCandidate(candidate.u_id)}
                    onMouseUp={() => setHeldCandidate(null)}
                    onMouseLeave={() => setHeldCandidate(null)}
                  >
                    <img
                      src={getAvatarSrc(user, candidate, false)}
                      onError={event => {
                        event.currentTarget.onerror = null
                        event.currentTarget.src = DRIVER_AVATAR_FALLBACK
                      }}
                      alt={getDriverName(candidate, user)}
                    />
                    <span className="passenger-live-order__candidate-main">
                      <b>{getDriverName(candidate, user)}</b>
                      <small>{getCarText(car)}</small>
                      {isExpandedCandidate && (
                        <em>
                          {[
                            `${t(TRANSLATION.CLIENT_PICKUP_ETA)}: ${pickupEta}`,
                            `${t(TRANSLATION.CLIENT_ROUTE_DURATION)}: ${getOrderTravelTimeText(order)}`,
                            `${t(TRANSLATION.DRIVER_OFFER_SEATS)}: ${seatsText}`,
                          ].join(' · ')}
                        </em>
                      )}
                    </span>
                    <span className="passenger-live-order__candidate-side">
                      <strong>{offerOrder ? formatOfferPrice(offer.price) : formatDriverPrice(candidate)}</strong>
                      <span className="passenger-live-order__candidate-class-row">
                        <span
                          className="passenger-live-order__driver-color-dot passenger-live-order__driver-color-dot--candidate"
                          style={{ backgroundColor: candidateColor }}
                          aria-hidden="true"
                        />
                        <CarClassBadge kind={candidateCarClassKind} compact className="passenger-live-order__candidate-class" />
                      </span>
                    </span>
                    {isExpandedCandidate && (
                      <small className="passenger-live-order__candidate-comment">
                        {t(TRANSLATION.DRIVER_OFFER_COMMENT)}: {offer.comment || getCandidateFallbackComment(candidate, order)}
                      </small>
                    )}
                  </button>
                )
              })}
              </div>
              <button
                type="button"
                className="passenger-live-order__choose-button"
                disabled={!selectedCandidate || isChoosing || cancelingSelectedDriver}
                onClick={handleChooseCandidate}
              >
                {isChoosing || cancelingSelectedDriver ? t(TRANSLATION.LOADING) : t(TRANSLATION.SELECT)}
              </button>
            </div>
          ) : (
            <div className="passenger-live-order__empty">
              <span aria-hidden="true">i</span>
              {t(TRANSLATION.CLIENT_NO_DRIVER_RESPONSES)}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="passenger-live-order__driver-row">
            <div className="passenger-live-order__avatar-wrap">
              <img
                className="passenger-live-order__avatar"
                src={avatarSrc}
                alt={driverName}
                onError={() => setAvatarFailed(true)}
              />
            </div>

            <div className="passenger-live-order__driver-main">
              <div className="passenger-live-order__driver-name">{driverName}</div>
              <div className="passenger-live-order__driver-car">{carText}</div>
              <div className="passenger-live-order__plate">{plate}</div>
            </div>
            <div className="passenger-live-order__driver-actions">
              <span className="passenger-live-order__driver-class-row">
                {selectedDriver && (
                  <span
                    className="passenger-live-order__driver-color-dot"
                    style={{ backgroundColor: getDriverColor(selectedDriver, order.drivers ?? [selectedDriver]) }}
                    aria-hidden="true"
                  />
                )}
                <CarClassBadge kind={getCandidateCarClassKind(driverCar, order)} className="passenger-live-order__driver-class" />
              </span>
              {canCancelSelectedDriver && (
                <button
                  type="button"
                  className="passenger-live-order__driver-cancel"
                  disabled={cancelingSelectedDriver}
                  onClick={handleCancelSelectedDriverClick}
                >
                  {cancelingSelectedDriver ? t(TRANSLATION.LOADING) : t(TRANSLATION.CANCEL, { toUpper: false })}
                </button>
              )}
              <button
                type="button"
                className="passenger-live-order__call"
                onClick={handleCallClick}
                disabled={!driverUser?.u_phone && !selectedDriver?.user?.u_phone}
                aria-label={t(TRANSLATION.PHONE_TO_CALL)}
              >
                <PhoneIcon />
              </button>
            </div>
          </div>

          <div className="passenger-live-order__details-grid passenger-live-order__details-grid--driver">
            <div className="passenger-live-order__detail passenger-live-order__detail--route passenger-live-order__detail--from">
              <span>{t(TRANSLATION.FROM)}</span>
              <strong>{pickup}</strong>
            </div>
            <div className="passenger-live-order__detail passenger-live-order__detail--route passenger-live-order__detail--to">
              <span>{t(TRANSLATION.TO)}</span>
              <strong>{destination}</strong>
            </div>
            <div className="passenger-live-order__detail">
              <span>{t(TRANSLATION.COST)}</span>
              <strong>{price}</strong>
            </div>
            <div className="passenger-live-order__detail">
              <span>{t(TRANSLATION.PAYMENT_WAY)}</span>
              <strong>{paymentWay}</strong>
            </div>
          </div>

          {shouldShowDriverDoorNumber(selectedDriver) && (
            <div className="passenger-live-order__boarding-code passenger-live-order__boarding-code--door-number">
              <span>{t(TRANSLATION.DRIVE_NUMBER)}</span>
              <input
                className="passenger-live-order__door-number-input"
                value={driverDoorNumber}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                placeholder="000"
                aria-label={t(TRANSLATION.DRIVE_NUMBER)}
                onChange={event => setDriverDoorNumber(normalizeDriverDoorNumber(event.target.value))}
              />
              <small>{t(TRANSLATION.DRIVE_NUMBER_HINT)}</small>
            </div>
          )}
        </>
      )}

      {hasDriver && (
        <div className={cn('passenger-live-order__actions', {
          'passenger-live-order__actions--compact': isTripStarted,
        })}>
          {!isTripStarted && canContactDriver && (
            <button
              type="button"
              className="passenger-live-order__action passenger-live-order__action--secondary"
              onClick={handleChatClick}
            >
              <ChatIcon />
              {t(TRANSLATION.CHAT)}
            </button>
          )}
          {isTripStarted ? (
            <>
              <button
                type="button"
                className="passenger-live-order__action passenger-live-order__action--finish"
                disabled={isFinishing}
                onClick={handleFinishClick}
              >
                {isFinishing ? t(TRANSLATION.LOADING) : t(TRANSLATION.CLIENT_FINISH_TRIP)}
              </button>
              <button
                type="button"
                className="passenger-live-order__action passenger-live-order__action--sos"
                onClick={handleSosClick}
              >
                <SosIcon />
                SOS
              </button>
            </>
          ) : (
            <button
              type="button"
              className="passenger-live-order__action passenger-live-order__action--secondary"
              onClick={handleCancelClick}
            >
              <CancelIcon />
              {t(TRANSLATION.CANCEL)}
            </button>
          )}
          {onNewOrder && (
            <button
              type="button"
              className="passenger-live-order__action passenger-live-order__action--switch"
              aria-label={t(TRANSLATION.CREATE_ORDER)}
              title={t(TRANSLATION.CREATE_ORDER)}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                onNewOrder()
              }}
            >
              &lt;&gt;
            </button>
          )}
        </div>
      )}

      {!hasDriver && (
        <div className="passenger-live-order__actions">
          <button
            type="button"
            className="passenger-live-order__action passenger-live-order__action--secondary"
            onClick={handleCancelClick}
          >
            <CancelIcon />
            {t(TRANSLATION.CANCEL)}
          </button>
          {onNewOrder && (
            <button
              type="button"
              className="passenger-live-order__action passenger-live-order__action--switch"
              aria-label={t(TRANSLATION.CREATE_ORDER)}
              title={t(TRANSLATION.CREATE_ORDER)}
              onClick={event => {
                event.preventDefault()
                event.stopPropagation()
                onNewOrder()
              }}
            >
              &lt;&gt;
            </button>
          )}
        </div>
      )}
      </section>
      {isChoiceOrder(order) && (
        <DriverChoiceCancelReasonModal
          isOpen={driverCancelReasonModalOpen}
          isSubmitting={cancelingSelectedDriver}
          onClose={handleCloseDriverCancelReasonModal}
          onConfirm={handleConfirmCancelSelectedDriver}
        />
      )}
    </>
  )
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

export default connector(PassengerLiveOrder)

function getOrderWaitingSeconds(order?: IOrder | null) {
  return normalizeSeconds(order?.b_max_waiting, SITE_CONSTANTS.WAITING_INTERVAL)
}

function getOrderElapsedSeconds(order: IOrder) {
  const time = getTimestamp(order.b_created || order.b_start_datetime)
  return time !== null && Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 1000)) : null
}

function normalizeSeconds(value: unknown, fallback: number = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : fallback
}

function getSelectedDriver(order: IOrder, confirmedChoiceId?: IDriver['u_id'] | null) {
  const drivers = order.drivers ?? []

  if (confirmedChoiceId) {
    const confirmedDriver = drivers.find(driver =>
      String(driver.u_id) === String(confirmedChoiceId) &&
      [
        EBookingDriverState.Performer,
        EBookingDriverState.Arrived,
        EBookingDriverState.Started,
        EBookingDriverState.Finished,
      ].includes(driver.c_state),
    )

    if (confirmedDriver)
      return confirmedDriver
  }

  const startedDriver = drivers.find(driver => driver.c_state === EBookingDriverState.Started)
  if (startedDriver)
    return startedDriver

  if (isChoiceOrder(order) || (candidateMode(order) && !isStoredSimpleOrderMode(order))) {
    // Пока идёт подбор водителей, не показываем «Водитель едет» из-за
    // временного Performer от backend/эмулятора.
    return null
  }

  return drivers.find(driver => driver.c_state > EBookingDriverState.Canceled) ?? null
}

function getVotingCandidates(order: IOrder) {
  if (!isVotingOrder(order))
    return []

  return (order.drivers ?? [])
    .filter(driver => driver.c_state === EBookingDriverState.Considering)
}

function getCandidateDrivers(
  order: IOrder,
  offerOrder: boolean,
  confirmedChoiceId?: IDriver['u_id'] | null,
) {
  if (!isVotingOrder(order) && !offerOrder)
    return []

  if (confirmedChoiceId)
    return []

  return (order.drivers ?? [])
    .filter(driver => isVisibleChoiceDriverState(driver.c_state))
}

function canUseLocalChoiceFallback(
  order: IOrder,
  nextCandidateId: IDriver['u_id'],
  rejectedChoiceIds: IDriver['u_id'][],
) {
  if (!isChoiceOrder(order) || !rejectedChoiceIds.length)
    return false

  const nextCandidate = order.drivers?.find(driver => String(driver.u_id) === String(nextCandidateId))
  return Boolean(nextCandidate && isVisibleChoiceDriverState(nextCandidate.c_state))
}

function ChatIcon() {
  return (
    <svg className="passenger-live-order__action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.4 17.2h-.9A3.5 3.5 0 0 1 2 13.7V7.8A3.8 3.8 0 0 1 5.8 4h12.4A3.8 3.8 0 0 1 22 7.8v5.9a3.5 3.5 0 0 1-3.5 3.5h-5.8l-4.4 3.2c-.8.6-1.9 0-1.9-1v-2.2Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.4 10.4h9.2M7.4 13.3h5.7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function SosIcon() {
  return (
    <svg className="passenger-live-order__action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.9 19 5.5v5.2c0 4.8-2.9 8.9-7 10.4-4.1-1.5-7-5.6-7-10.4V5.5l7-2.6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.7v5.6M12 16.7h.01" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function CancelIcon() {
  return (
    <svg className="passenger-live-order__action-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function PhoneIcon() {
  return (
    <svg className="passenger-live-order__call-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.2 4.5 9 4.1c.8-.2 1.6.2 1.9 1l.8 2.1c.3.7.1 1.5-.5 2l-1 .8a10.4 10.4 0 0 0 4 4l.8-1c.5-.6 1.3-.8 2-.5l2.1.8c.8.3 1.2 1.1 1 1.9l-.4 1.8c-.2.9-1 1.5-1.9 1.5C10.7 18.5 5.5 13.3 5.5 6.2c0-.9.7-1.6 1.7-1.7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RouteIcon() {
  return (
    <svg className="passenger-live-order__state-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6 19c3.5 0 3.5-14 7-14s3.5 14 7 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4.8 19h2.4M18.8 19h2.4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function getPassengerStatusTitle(driver?: IDriver | null) {
  if (driver?.c_state === EBookingDriverState.Started)
    return t(TRANSLATION.CLIENT_TRIP_STARTED_TITLE)

  if (driver?.c_state === EBookingDriverState.Arrived)
    return t(TRANSLATION.CLIENT_DRIVER_ARRIVED_TITLE)

  return t(TRANSLATION.CLIENT_DRIVER_ON_WAY_TITLE)
}

function getPassengerStatusSubtitle(driver?: IDriver | null) {
  if (driver?.c_state === EBookingDriverState.Started)
    return t(TRANSLATION.CLIENT_TRIP_STARTED_SUBTITLE)

  if (driver?.c_state === EBookingDriverState.Arrived)
    return t(TRANSLATION.CLIENT_DRIVER_WAITING_SUBTITLE)

  return t(TRANSLATION.CLIENT_DRIVER_ON_WAY_SUBTITLE)
}

function getDriverRating(driver?: IDriver | null) {
  const rating = Number(driver?.c_rating)
  if (Number.isFinite(rating) && rating > 0)
    return rating.toFixed(1)

  return driver ? '4.8' : '—'
}

function getDriverName(driver?: IDriver | null, user?: IUser | null) {
  const name = [
    user?.u_name,
    user?.u_family,
    driver?.u_name,
    driver?.u_family,
    driver?.user?.u_name,
    driver?.user?.u_family,
  ].filter(Boolean).join(' ').trim()

  if (name)
    return name

  const id = driver?.u_id || driver?.c_id
  return id ? `${t(TRANSLATION.DRIVER)} #${id}` : t(TRANSLATION.DRIVER)
}

function getAvatarSrc(user?: IUser | null, driver?: IDriver | null, failed?: boolean) {
  if (failed)
    return DRIVER_AVATAR_FALLBACK

  const src = [
    user?.u_photo,
    driver?.user?.u_photo,
  ].find(value => typeof value === 'string' && value.trim())

  return src?.trim() || DRIVER_AVATAR_FALLBACK
}

function getCarText(car?: ICar | null) {
  if (!car)
    return t(TRANSLATION.AUTO)

  const model = car.cm_id ? t(TRANSLATION.CAR_MODELS[car.cm_id]) : ''
  const color = car.color ? t(TRANSLATION.CAR_COLORS[car.color]) : ''
  const text = [model, color ? `(${color})` : ''].filter(Boolean).join(' ')

  return text || t(TRANSLATION.AUTO)
}

function getCleanAddress(...values: Array<string | null | undefined>) {
  const value = values.find(item => typeof item === 'string' && item.trim())
  return value?.trim() || t(TRANSLATION.ADDRESS_NOT_SPECIFIED)
}

function formatPayment(value: number | string) {
  if (typeof value === 'number' && Number.isFinite(value))
    return formatCurrency(value, { currencyDisplay: 'narrowSymbol' })

  return String(value || `${CURRENCY.SIGN}0`)
}

function getPaymentWayText(paymentWay?: EPaymentWays) {
  switch (paymentWay) {
    case EPaymentWays.Credit:
      return t(TRANSLATION.CARD)
    case EPaymentWays.Paypal:
      return 'PayPal'
    case EPaymentWays.Cash:
    default:
      return t(TRANSLATION.CASH)
  }
}

function formatDriverPrice(driver: IDriver) {
  const price = driver.c_options?.performers_price
  if (!price)
    return ''

  return `${CURRENCY.SIGN}${price}`
}


function getSyntheticOfferIndex(driver: IDriver, order?: IOrder | null) {
  const source = `${driver.u_id || ''}_${driver.c_id || ''}_${order?.b_id || ''}`
  return source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function getSyntheticOfferEta(driver: IDriver, order?: IOrder | null) {
  const variants = getDriverOfferEtaLabels()
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getSyntheticOfferComment(driver: IDriver, order?: IOrder | null) {
  const variants = getDriverOfferCommentLabels()
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getDriverOfferInfo(driver: IDriver, order?: IOrder | null) {
  const rawDriver = driver as any
  const options = normalizeCandidateOfferObject(rawDriver.c_options)
  const driverOfferObject = normalizeCandidateOfferObject(options.driver_offer)
  const offerObject = normalizeCandidateOfferObject(options.offer)
  const topDriverOfferObject = normalizeCandidateOfferObject(rawDriver.driver_offer)
  const topOfferObject = normalizeCandidateOfferObject(rawDriver.offer)
  const rawDriverData = normalizeCandidateOfferObject(rawDriver.c_data ?? rawDriver.data)
  const rawOffer = Object.keys(driverOfferObject).length ? driverOfferObject :
    Object.keys(offerObject).length ? offerObject :
      Object.keys(topDriverOfferObject).length ? topDriverOfferObject :
        topOfferObject
  const storedOffer = getStoredCandidateOffer(order?.b_id, driver.u_id, driver.c_id)

  return {
    price: getFirstFilledOfferValue(
      options.driver_offer_price,
      rawDriver.driver_offer_price,
      rawOffer.price,
      rawOffer.driver_price,
      rawOffer.performers_price,
      storedOffer?.price,
      options.performers_price,
      rawDriver.performers_price,
      rawDriver.c_price,
      options.price,
    ),
    eta: getFirstFilledOfferValue(
      options.driver_offer_eta,
      rawDriver.driver_offer_eta,
      rawDriverData.driver_offer_eta,
      rawDriverData.c_pickup_time,
      rawDriverData.pickup_time,
      rawOffer.eta,
      rawOffer.pickup_time,
      rawOffer.arrival_time,
      rawOffer.time,
      storedOffer?.eta,
      getSyntheticOfferEta(driver, order),
      options.eta,
      rawDriver.eta,
      rawDriver.pickup_time,
      rawDriver.arrival_time,
      rawDriver.c_eta,
      rawDriver.c_pickup_time,
      options.c_pickup_time,
      options.pickup_time,
      options.arrival_time,
      options.time,
    ),
    seats: getFirstFilledOfferValue(
      options.driver_offer_free_seats,
      rawDriver.driver_offer_free_seats,
      rawOffer.freeSeats,
      rawOffer.free_seats,
      rawOffer.seats,
      storedOffer?.freeSeats,
      options.freeSeats,
      rawDriver.freeSeats,
      rawDriver.free_seats,
      rawDriver.seats,
      options.free_seats,
      options.seats,
    ),
    comment: getFirstFilledOfferValue(
      options.driver_offer_comment,
      rawDriver.driver_offer_comment,
      rawDriverData.driver_offer_comment,
      rawDriverData.c_comment,
      rawDriverData.comment,
      rawOffer.comment,
      rawOffer.driver_comment,
      storedOffer?.comment,
      getSyntheticOfferComment(driver, order),
      options.driver_comment,
      rawDriver.driver_comment,
      rawDriver.comment,
      rawDriver.c_comment,
      options.c_comment,
      options.comment,
    ),
  }
}

function getFirstFilledOfferValue(...values: any[]) {
  return values.find(value =>
    value !== undefined &&
    value !== null &&
    (typeof value !== 'string' || value.trim() !== '')
  )
}

function normalizeCandidateOfferObject(value: any): Record<string, any> {
  if (!value)
    return {}

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  return typeof value === 'object' ? value : {}
}

function getStoredCandidateOffer(orderId?: IOrder['b_id'], driverId?: IDriver['u_id'], carId?: IDriver['c_id']) {
  if (!orderId)
    return null

  try {
    const offers = JSON.parse(localStorage.getItem('driverOffers') || '{}')
    const ids = [driverId, carId].filter(Boolean).map(String)

    for (const id of ids) {
      const exact = offers[`${id}:${orderId}`]
      if (exact)
        return exact
    }

    const orderOffers = Object.values(offers || {}).filter((item: any) =>
      String(item?.orderId) === String(orderId) &&
      (!ids.length || ids.includes(String(item?.userId)) || ids.includes(String(item?.carId))),
    )

    if (orderOffers.length)
      return orderOffers[0]

    const onlyOrderOffers = Object.values(offers || {}).filter((item: any) =>
      String(item?.orderId) === String(orderId),
    )

    return onlyOrderOffers.length === 1 ? onlyOrderOffers[0] : null
  } catch {
    return null
  }
}

function sortCandidateDriversByEta(drivers: IDriver[], order?: IOrder | null) {
  return [...drivers].sort((a, b) => {
    const etaA = getCandidatePickupEtaMinutes(a, order)
    const etaB = getCandidatePickupEtaMinutes(b, order)

    if (etaA === etaB)
      return 0
    if (etaA === Number.POSITIVE_INFINITY)
      return 1
    if (etaB === Number.POSITIVE_INFINITY)
      return -1

    return etaA - etaB
  })
}

function getCandidatePickupEtaText(driver: IDriver, order?: IOrder | null, rawEta?: unknown) {
  const eta = getFirstFilledOfferValue(rawEta, getDriverOfferInfo(driver, order).eta)
  if (eta !== undefined && eta !== null && String(eta).trim())
    return String(eta).trim()

  const minutes = getCandidateEstimatedPickupMinutes(driver, order)
  return minutes ? `≈ ${minutes} ${t(TRANSLATION.MINUTES)}` : '—'
}

function getCandidatePickupEtaMinutes(driver: IDriver, order?: IOrder | null) {
  const eta = parseOfferEtaMinutes(getDriverOfferInfo(driver, order).eta)
  if (eta !== Number.POSITIVE_INFINITY)
    return eta

  return getCandidateEstimatedPickupMinutes(driver, order) ?? Number.POSITIVE_INFINITY
}

function getCandidateEstimatedPickupMinutes(driver: IDriver, order?: IOrder | null) {
  if (
    !order?.b_start_latitude ||
    !order?.b_start_longitude ||
    !driver.c_latitude ||
    !driver.c_longitude
  )
    return undefined

  const distanceKm = distanceBetweenEarthCoordinates(
    driver.c_latitude,
    driver.c_longitude,
    order.b_start_latitude,
    order.b_start_longitude,
  )

  return Math.max(1, Math.round((distanceKm * 1.2 / 30) * 60))
}

function getCandidateFallbackComment(driver: IDriver, order?: IOrder | null) {
  const comments = getDriverOfferCommentLabels()
  const seed = String(order?.b_id ?? '') + String(driver.u_id ?? '') + String(driver.c_id ?? '')
  const hash = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return comments[hash % comments.length]
}

function parseOfferEtaMinutes(value: unknown) {
  if (!value)
    return Number.POSITIVE_INFINITY

  const text = String(value).toLowerCase()
  const numbers = text.match(/\d+/g)?.map(Number) ?? []

  if (!numbers.length)
    return Number.POSITIVE_INFINITY

  const firstNumber = numbers[0] ?? 0

  if (/час|hour/.test(text))
    return firstNumber * 60

  return firstNumber
}

function getOrderTravelTimeText(order?: IOrder | null) {
  const minutes = getOrderTravelTimeMinutes(order)
  if (!minutes)
    return '—'

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  if (hours > 0 && restMinutes > 0)
    return `≈ ${hours} ${t(TRANSLATION.HOURS)} ${restMinutes} ${t(TRANSLATION.MINUTES)}`
  if (hours > 0)
    return `≈ ${hours} ${t(TRANSLATION.HOURS)}`

  return `≈ ${minutes} ${t(TRANSLATION.MINUTES)}`
}

function getOrderTravelTimeMinutes(order?: IOrder | null) {
  const storedValue = getFirstPositiveNumber(
    (order?.b_options as any)?.pricingModel?.options?.duration,
    (order?.b_options as any)?.pricingModel?.options?.routeDuration,
    (order?.b_options as any)?.pricingModel?.options?.time,
    (order as any)?.b_estimate_waiting,
  )

  if (storedValue)
    return Math.max(1, Math.round(storedValue > 120 ? storedValue / 60 : storedValue))

  if (
    !order?.b_start_latitude ||
    !order?.b_start_longitude ||
    !order?.b_destination_latitude ||
    !order?.b_destination_longitude
  )
    return undefined

  const distanceKm = distanceBetweenEarthCoordinates(
    order.b_start_latitude,
    order.b_start_longitude,
    order.b_destination_latitude,
    order.b_destination_longitude,
  )

  return Math.max(1, Math.round((distanceKm * 1.15 / 28) * 60))
}

function getFirstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '')
      continue

    const number = Number(value)
    if (Number.isFinite(number) && number > 0)
      return number
  }

  return undefined
}

function formatOfferPrice(price: unknown) {
  if (price === undefined || price === null || price === '')
    return ''

  return `${CURRENCY.SIGN}${price}`
}
