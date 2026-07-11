import React, { useEffect, useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import './styles.scss'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import SITE_CONSTANTS from '../../siteConstants'
import { IRootState } from '../../state'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import moment from 'moment'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { useInterval } from '../../tools/hooks'
import images from '../../constants/images'
import Overlay from './Overlay'
import { getStableRemainingLifetimeSeconds } from '../../tools/reliableTime'
import { getPassengerPickupEta } from '../../tools/driverOffer'
import { EBookingDriverState, EColorTypes, EStatuses, ICar, IDriver, IUser } from '../../types/types'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isVoteModalOpen(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  activeOrders: ordersSelectors.activeOrders(state),
})

const mapDispatchToProps = {
  setVoteModal: modalsActionCreators.setVoteModal,
  setCancelModal: modalsActionCreators.setCancelModal,
  setMessageModal: modalsActionCreators.setMessageModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const VoteModal: React.FC<IProps> = ({
  isOpen,
  selectedOrder,
  activeOrders,
  setVoteModal,
  setCancelModal,
  setMessageModal,
}) => {
  const order = activeOrders?.find(item => item.b_id === selectedOrder)
  const [pickupEtaVersion, setPickupEtaVersion] = useState(0)

  const candidates = useMemo(() =>
    sortCandidateDriversByEta(
      order?.drivers?.filter(driver => driver.c_state === EBookingDriverState.Considering) ?? [],
      order,
    )
  , [
    order?.drivers?.map(driver => `${driver.u_id}:${driver.c_id}:${driver.c_state}:${JSON.stringify(driver.c_options ?? {})}:${driver.c_latitude}:${driver.c_longitude}`).join('|'),
    order?.b_start_latitude,
    order?.b_start_longitude,
    pickupEtaVersion,
  ])
  const selectedPerformer = useMemo(() =>
    order?.drivers?.find(driver => [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
    ].includes(driver.c_state)) ?? null
  , [order?.drivers])

  const [sumSeconds, setSumSeconds] = useState(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
  const [seconds, setSeconds] = useState(
    order?.b_start_datetime ?
      (sumSeconds - moment().diff(order?.b_start_datetime, 'seconds')) :
      sumSeconds,
  )
  const [activeCandidate, setActiveCandidate] = useState<IDriver['u_id'] | null>(null)
  const [users, setUsers] = useState<IUser[]>([])
  const [cars, setCars] = useState<ICar[]>([])
  const [isChoosing, setIsChoosing] = useState(false)
  const [isExtendingWaiting, setIsExtendingWaiting] = useState(false)

  useEffect(() => {
    const handlePickupEtaChange = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.orderId && String(detail.orderId) !== String(order?.b_id ?? ''))
        return

      setPickupEtaVersion(version => version + 1)
    }

    window.addEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
    return () => window.removeEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
  }, [order?.b_id])

  useInterval(() => {
    if (selectedPerformer)
      return

    const stableRemaining = getStableRemainingLifetimeSeconds(order, Date.now())
    const newSeconds = order?.b_start_datetime ?
      ((sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL) - moment().diff(order?.b_start_datetime, 'seconds')) :
      stableRemaining !== null ? stableRemaining : sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL
    if (newSeconds <= 0 && isOpen) {
      console.error('Seconds is less then 0')
      setVoteModal(false)
      setSeconds(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
      setSumSeconds(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
      return
    }
    setSeconds(newSeconds)
  }, 1000)

  useEffect(() => {
    if (isOpen) {
      const stableRemaining = getStableRemainingLifetimeSeconds(order, Date.now())
      setSeconds(
        order?.b_start_datetime ?
          ((sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL) - moment().diff(order?.b_start_datetime, 'seconds')) :
          stableRemaining !== null ? stableRemaining : sumSeconds || SITE_CONSTANTS.WAITING_INTERVAL,
      )
      setSumSeconds(order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)
    }
  }, [isOpen, selectedOrder])

  useEffect(() => {
    if (!isOpen || !order?.drivers?.length)
      return

    API.getUsers(order.drivers.map(driver => driver.u_id))
      .then(setUsers)
      .catch(error => console.error(error))
    API.getCars(order.drivers.map(driver => driver.c_id).filter(Boolean))
      .then(setCars)
      .catch(error => console.error(error))
  }, [isOpen, order?.drivers?.map(driver => `${driver.u_id}_${driver.c_id}`).sort().join('.')])

  useEffect(() => {
    if (!candidates.length) {
      setActiveCandidate(null)
      return
    }
    if (activeCandidate && !candidates.some(driver => driver.u_id === activeCandidate))
      setActiveCandidate(null)
  }, [candidates.map(driver => driver.u_id).join('|'), activeCandidate])

  const onWaiting = () => {
    if (!selectedOrder || isExtendingWaiting) return

    const additionalTime = 180
    const previousWaitingTime = sumSeconds || order?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL

    setIsExtendingWaiting(true)
    API.setWaitingTime(selectedOrder, previousWaitingTime, additionalTime)
      .then(() => {
        setSumSeconds(prev => (prev || previousWaitingTime) + additionalTime)
        setSeconds(prev => Math.max(0, prev) + additionalTime)
      })
      .catch(error => console.error(error))
      .finally(() => setIsExtendingWaiting(false))
  }

  const handleChoose = () => {
    if (!selectedOrder || !activeCandidate || isChoosing) return

    setIsChoosing(true)
    API.chooseCandidate(selectedOrder, activeCandidate)
      .then(() => {
        setVoteModal(false)
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: t(TRANSLATION.CLIENT_DRIVER_SELECT_ERROR),
          status: EStatuses.Fail,
        })
      })
      .finally(() => setIsChoosing(false))
  }

  const selectedCandidate = candidates.find(driver => driver.u_id === activeCandidate) ?? null

  return (
    <Overlay
      isOpen={isOpen && !selectedPerformer}
      onClick={() => setVoteModal(false)}
      wrapperClassName="vote-modal-overlay"
      overlayClassName="vote-modal-overlay__backdrop"
    >
      <div
        className="modal vote-modal vote-modal--client-choice"
      >
        <div className="vote-modal__topline">
          <div>
            <div className="vote-modal__eyebrow">{t(TRANSLATION.CLIENT_VOTING_EYEBROW)}</div>
            <div className="vote-modal__counter">
              {t(TRANSLATION.CLIENT_RESPONDED_DRIVERS)}: <b>{candidates.length}</b>
            </div>
          </div>
          <button
            type="button"
            className="vote-modal__close"
            onClick={() => setVoteModal(false)}
            aria-label={t(TRANSLATION.CLOSE)}
          >
            ×
          </button>
        </div>

        <button
          type="button"
          className="vote-modal__timer-card vote-modal__timer-card--button"
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            onWaiting()
          }}
          disabled={isExtendingWaiting}
          title={t(TRANSLATION.CLIENT_SELECT_OR_WAIT_MORE)}
        >
          <img src={images.timer} className="vote-modal__timer-img" alt={t(TRANSLATION.TIMER)} />
          <div>
            <span>{t(TRANSLATION.CLIENT_WAITING_CUSTOMER)}</span>
            <strong>{formatTimer(seconds)}</strong>
            <small>{isExtendingWaiting ? t(TRANSLATION.LOADING) : t(TRANSLATION.CLIENT_SELECT_OR_WAIT_MORE)}</small>
          </div>
        </button>

        {candidates.length ? (
          <>
            <div className="vote-modal__cards" onClick={event => event.stopPropagation()}>
              {candidates.map(driver => {
                const user = users.find(item => item.u_id === driver.u_id)
                const car = cars.find(item => item.c_id === driver.c_id)
                const isActive = driver.u_id === selectedCandidate?.u_id
                const offer = getCandidateOfferInfo(driver)
                const seatsText = getFirstFilledOfferValue(offer.seats) || '—'
                const commentText = getFirstFilledOfferValue(offer.comment) || '—'
                const pickupEta = getPassengerPickupEta(order?.b_id, driver) || '—'

                return (
                  <button
                    type="button"
                    key={driver.u_id}
                    className={`vote-candidate-card${isActive ? ' vote-candidate-card--active' : ''}`}
                    onClick={() => setActiveCandidate(driver.u_id)}
                  >
                    <img src={images.driverAvatar} alt="driver" />
                    <span className="vote-candidate-card__main">
                      <b>{getCandidateName(driver, user)}</b>
                      <small>{getCarText(car)}</small>
                      <small className="vote-candidate-card__details">
                        {formatDriverDistance(order, driver) || '—'} · {t(TRANSLATION.CLIENT_PICKUP_ETA)}: {pickupEta} · {t(TRANSLATION.DRIVER_OFFER_SEATS)}: {seatsText}
                      </small>
                      <small className="vote-candidate-card__details vote-candidate-card__details--comment">
                        {t(TRANSLATION.DRIVER_OFFER_COMMENT)}: {commentText}
                      </small>
                    </span>
                    <span className="vote-candidate-card__meta">
                      {pickupEta}
                    </span>
                  </button>
                )
              })}
            </div>

            {!!selectedCandidate && (
              <div className="vote-modal__selected" onClick={event => event.stopPropagation()}>
                <div className="vote-modal__selected-title">{t(TRANSLATION.DRIVER)}</div>
                <div className="vote-modal__selected-row">
                  <span>{getCandidateName(selectedCandidate, users.find(item => item.u_id === selectedCandidate.u_id))}</span>
                  <b>{formatDriverDistance(order, selectedCandidate) || '—'}</b>
                </div>
                <div className="vote-modal__selected-row">
                  <span>{t(TRANSLATION.CLIENT_PICKUP_ETA)}</span>
                  <b>{getPassengerPickupEta(order?.b_id, selectedCandidate) || '—'}</b>
                </div>
                <div className="vote-modal__selected-row">
                  <span>{t(TRANSLATION.CLIENT_ROUTE_DURATION)}</span>
                  <b>{getOrderTravelTimeText(order)}</b>
                </div>
                <div className="vote-modal__selected-row">
                  <span>{t(TRANSLATION.DRIVER_OFFER_SEATS)}</span>
                  <b>{getFirstFilledOfferValue(getCandidateOfferInfo(selectedCandidate).seats) || '—'}</b>
                </div>
                <div className="vote-modal__selected-row">
                  <span>{t(TRANSLATION.DRIVER_OFFER_COMMENT)}</span>
                  <b>{getFirstFilledOfferValue(getCandidateOfferInfo(selectedCandidate).comment) || '—'}</b>
                </div>
                <div className="vote-modal__selected-row">
                  <span>{getCarText(cars.find(item => item.c_id === selectedCandidate.c_id))}</span>
                  <b>{selectedCandidate.c_options?.performers_price ? `${selectedCandidate.c_options.performers_price}` : ''}</b>
                </div>
                <div className="vote-modal__actions">
                  <Button
                    text={t(TRANSLATION.SELECT)}
                    onClick={handleChoose}
                    disabled={isChoosing}
                  />
                  <Button
                    type="button"
                    text={t(TRANSLATION.CLIENT_WAIT_MORE)}
                    colorType={EColorTypes.Accent}
                    onClick={onWaiting}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="vote-modal__empty">
            {t(TRANSLATION.CLIENT_NO_DRIVER_RESPONSES)}
          </div>
        )}

        <Button
          type="button"
          text={t(TRANSLATION.CANCEL)}
          className='vote-modal-btn cancel'
          colorType={EColorTypes.Accent}
          onClick={() => {
            setVoteModal(false)
            setCancelModal(true)
          }}
        />
      </div>
    </Overlay>
  )
}

export default connector(VoteModal)

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


function getSyntheticOfferIndex(driver: IDriver, order?: any) {
  const source = `${driver.u_id || ''}_${driver.c_id || ''}_${order?.b_id || ''}`
  return source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function getSyntheticOfferEta(driver: IDriver, order?: any) {
  const variants = [
    t(TRANSLATION.DRIVER_OFFER_ETA_5),
    t(TRANSLATION.DRIVER_OFFER_ETA_10),
    t(TRANSLATION.DRIVER_OFFER_ETA_15),
    t(TRANSLATION.DRIVER_OFFER_ETA_20),
    t(TRANSLATION.DRIVER_OFFER_ETA_30),
    t(TRANSLATION.DRIVER_OFFER_ETA_45),
  ]
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getSyntheticOfferComment(driver: IDriver, order?: any) {
  const variants = [
    t(TRANSLATION.DRIVER_OFFER_COMMENT_DIRECT),
    t(TRANSLATION.DRIVER_OFFER_COMMENT_FAST),
    t(TRANSLATION.DRIVER_OFFER_COMMENT_AC),
    t(TRANSLATION.DRIVER_OFFER_COMMENT_BIG_TRUNK),
    t(TRANSLATION.DRIVER_OFFER_COMMENT_NEARBY),
    t(TRANSLATION.DRIVER_OFFER_COMMENT_CAREFUL),
  ]
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getCandidateOfferInfo(driver: IDriver) {
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

  return {
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
      getSyntheticOfferEta(driver),
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
      getSyntheticOfferComment(driver),
      options.driver_comment,
      rawDriver.driver_comment,
      rawDriver.comment,
      rawDriver.c_comment,
      options.c_comment,
      options.comment,
    ),
  }
}

function sortCandidateDriversByEta(drivers: IDriver[], order?: any) {
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

function getCandidatePickupEtaText(driver: IDriver, order?: any) {
  const eta = getCandidateOfferInfo(driver).eta
  if (eta !== undefined && eta !== null && String(eta).trim())
    return String(eta).trim()

  const minutes = getCandidateEstimatedPickupMinutes(driver, order)
  return minutes ? `≈ ${minutes} ${t(TRANSLATION.MINUTES)}` : '—'
}

function getCandidatePickupEtaMinutes(driver: IDriver, order?: any) {
  const eta = parseOfferEtaMinutes(getCandidateOfferInfo(driver).eta)
  if (eta !== Number.POSITIVE_INFINITY)
    return eta

  return getCandidateEstimatedPickupMinutes(driver, order) ?? Number.POSITIVE_INFINITY
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

function getCandidateEstimatedPickupMinutes(driver: IDriver, order?: any) {
  if (!order?.b_start_latitude || !order.b_start_longitude || !driver.c_latitude || !driver.c_longitude)
    return undefined

  const distanceKm = distanceBetweenEarthCoordinates(
    driver.c_latitude,
    driver.c_longitude,
    order.b_start_latitude,
    order.b_start_longitude,
  )

  return Math.max(1, Math.round((distanceKm * 1.2 / 30) * 60))
}

function getOrderTravelTimeText(order?: any) {
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

function getOrderTravelTimeMinutes(order?: any) {
  const storedValue = getFirstPositiveNumber(
    order?.b_options?.pricingModel?.options?.duration,
    order?.b_options?.pricingModel?.options?.routeDuration,
    order?.b_options?.pricingModel?.options?.time,
    order?.b_estimate_waiting,
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

function getCandidateName(driver: IDriver, user?: IUser) {
  const name = [
    user?.u_name,
    user?.u_family,
    driver.u_name,
    driver.u_family,
    driver.user?.u_name,
    driver.user?.u_family,
  ].filter(Boolean).join(' ').trim()

  return name || t(TRANSLATION.DRIVER)
}

function getCarText(car?: ICar) {
  return [car?.cm_id, car?.color, car?.registration_plate]
    .filter(Boolean)
    .join(' · ') || t(TRANSLATION.AUTO)
}

function formatTimer(seconds: number) {
  const safeSeconds = Math.max(Math.round(seconds || 0), 0)
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function formatDriverDistance(order: any, driver: IDriver) {
  if (!order?.b_start_latitude || !order.b_start_longitude || !driver.c_latitude || !driver.c_longitude)
    return ''

  const distance = distanceBetweenEarthCoordinates(
    driver.c_latitude,
    driver.c_longitude,
    order.b_start_latitude,
    order.b_start_longitude,
  ) * 1000

  if (distance < 1000)
    return `${Math.round(distance / 10) * 10} ${t(TRANSLATION.METER_SHORT)}`

  return `${(distance / 1000).toFixed(1)} ${t(TRANSLATION.KILOMETER_SHORT)}`
}

function distanceBetweenEarthCoordinates(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const earthRadiusKm = 6371
  const dLat = degreesToRadians(lat2 - lat1)
  const dLon = degreesToRadians(lon2 - lon1)

  lat1 = degreesToRadians(lat1)
  lat2 = degreesToRadians(lat2)

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function degreesToRadians(degrees: number) {
  return degrees * Math.PI / 180
}
