import React, { useEffect, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { ICar, IDriver, IOrder, IReply, IUser } from '../../types/types'
import { dateFormatDate, distanceBetweenEarthCoordinates } from '../../tools/utils'
import { useInterval } from '../../tools/hooks'
import images from '../../constants/images'
import * as API from '../../API'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { userSelectors } from '../../state/user'
import { clientOrderSelectors } from '../../state/clientOrder'
import { t, TRANSLATION } from '../../localization'
import { getPassengerPickupEta } from '../../tools/driverOffer'
import Button from '../Button'
import ChatToggler from '../Chat/Toggler'
import './styles.scss'
import Overlay from './Overlay'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isCandidatesModalOpen(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  user: userSelectors.user(state),
})

const mapDispatchToProps = {
  setCandidatesModal: modalsActionCreators.setCandidatesModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}


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


function getSyntheticOfferIndex(driver: IDriver, order?: any) {
  const source = `${driver.u_id || ''}_${driver.c_id || ''}_${order?.b_id || ''}`
  return source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function getSyntheticOfferEta(driver: IDriver, order?: any) {
  const variants = ['Буду через 5 минут', 'Буду через 8 минут', 'Буду через 10 минут', 'Буду через 12 минут', 'Буду через 15 минут', 'Буду через 20 минут']
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getSyntheticOfferComment(driver: IDriver, order?: any) {
  const variants = ['Еду напрямую', 'Могу быстро подъехать', 'Есть кондиционер', 'Большой багажник', 'Свободен рядом', 'Буду аккуратно']
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getCandidateOfferInfo(driver: IDriver, order?: IOrder | null) {
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

function getCandidatePickupEtaText(driver: IDriver, order?: IOrder | null) {
  const eta = getCandidateOfferInfo(driver, order).eta
  if (eta !== undefined && eta !== null && String(eta).trim())
    return String(eta).trim()

  const minutes = getCandidateEstimatedPickupMinutes(driver, order)
  return minutes ? `≈ ${minutes} ${t(TRANSLATION.MINUTES)}` : '—'
}

function getCandidatePickupEtaMinutes(driver: IDriver, order?: IOrder | null) {
  const eta = parseOfferEtaMinutes(getCandidateOfferInfo(driver, order).eta)
  if (eta !== Number.POSITIVE_INFINITY)
    return eta

  return getCandidateEstimatedPickupMinutes(driver, order) ?? Number.POSITIVE_INFINITY
}

function getCandidateFallbackComment(driver: IDriver, order?: IOrder | null) {
  const comments = [
    'Еду напрямую',
    'Могу быстро подъехать',
    'Есть кондиционер',
    'Большой багажник',
    'Буду аккуратно',
    'Свободен рядом',
  ]
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

function CandidatesModal({
  isOpen,
  selectedOrder,
  user,
  setCandidatesModal,
}: IProps) {
  const [activeCandidate, setActiveCandidate] = useState<IUser['u_id'] | null>(null)
  const [pickupEtaVersion, setPickupEtaVersion] = useState(0)
  const [order, setOrder] = useState<IOrder | null>(null)
  const [users, setUsers] = useState<IUser[]>([])
  const [cars, setCars] = useState<ICar[]>([])

  useEffect(() => {
    if (user && isOpen && selectedOrder) {
      API.getOrder(selectedOrder)
        .then(setOrder)
    }
  }, [selectedOrder, isOpen])

  useEffect(() => {
    const handlePickupEtaChange = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.orderId && String(detail.orderId) !== String(order?.b_id ?? selectedOrder ?? ''))
        return

      setPickupEtaVersion(version => version + 1)
    }

    window.addEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
    return () => window.removeEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
  }, [order?.b_id, selectedOrder])

  useInterval(() => {
    if (user && isOpen && selectedOrder) {
      API.getOrder(selectedOrder)
        .then(setOrder)
    }
  }, 3000)

  useEffect(() => {
    if (user && selectedOrder) {
      API.getUsers(order?.drivers?.map(i => i.u_id) || [])
        .then(setUsers)
      API.getCars(order?.drivers?.map(i => i.c_id) || [])
        .then(setCars)
    }
  }, [order?.drivers?.map(i => `${i.u_id}_${i.c_id}`).sort().join('.'), pickupEtaVersion])

  const handleCandidateClick = (candidate: IUser['u_id']) => {
    setActiveCandidate(prev => prev === candidate ? null : candidate)
  }

  const handleChoseClick = () => {
    if (!selectedOrder || !activeCandidate) return
    API.chooseCandidate(selectedOrder, activeCandidate)
      .then(() => {
        setCandidatesModal(false)
      })
  }

  return (
    <Overlay
      isOpen={isOpen && !!order?.drivers?.length}
      onClick={() => setCandidatesModal(false)}
    >
      <div
        className="modal candidates-modal"
        style={{ display: isOpen && !!order?.drivers?.length ? 'flex' : 'none' }}
      >
        <form>
          <fieldset>
            <legend>{t(TRANSLATION.RESPONDING_PERFORMERS)}</legend>
            {sortCandidateDriversByEta(order?.drivers ?? [], order).map(item => {
              const user = users.find(i => i.u_id === item.u_id)
              const car = cars.find(i => i.c_id === item.c_id)
              const offer = getCandidateOfferInfo(item, order)

              return  (
                <div
                  className={
                    cn(
                      'candidate colored',
                      { 'candidate--active': item.u_id === activeCandidate },
                    )
                  }
                  onClick={() => handleCandidateClick(item.u_id)}
                >
                  <div className="candidate__header">
                    <div className="candidate__header-avatar">
                      <img src={images.driverAvatar} alt={item.u_id} />
                    </div>
                    <div className="candidate__header-info">
                      <h6 className="candidate__header-name">
                        {user?.u_name}{user?.u_family ? ` ${user?.u_family}` : ''}(#{user?.u_id}),
                      </h6>
                      <h6 className="candidate__header-name">
                        {!!car?.color && t(TRANSLATION.CAR_COLORS[car.color])}&nbsp;
                        {!!car?.cm_id && t(TRANSLATION.CAR_MODELS[car.cm_id])}&nbsp;
                        <span className="candidate__registration-plate">
                          {car?.registration_plate}
                        </span>
                        (#{car?.c_id})
                      </h6>
                      <div className="candidate__header-subinfo">
                        <div>
                          {/* <p className="candidate__header-registration">{t(TRANSLATION.REGISTRATION)}:
                        {item.u_registration.format(dateFormatDate)}</p> */}
                          <p className="candidate__header-replies">
                            <span className="candidate__header-subinfo-item">{t(TRANSLATION.COMMENTS)}: {/*item.u_replies?.length || */0}</span>
                            <span className="candidate__header-subinfo-item">{t(TRANSLATION.CHOSEN)}: {/*item.u_choosen || */0}</span>
                            {offer.price !== undefined &&
                              <span className="candidate__header-subinfo-item">{t(TRANSLATION.PRICE_PERFORMER)}: {offer.price} {CURRENCY.SIGN}</span>
                            }
                            <span className="candidate__header-subinfo-item">{t(TRANSLATION.CLIENT_PICKUP_ETA)}: {getPassengerPickupEta(order?.b_id, item) || '—'}</span>
                            <span className="candidate__header-subinfo-item">{t(TRANSLATION.DRIVER_OFFER_SEATS)}: {offer.seats || '—'}</span>
                            <span className="candidate__header-subinfo-item candidate__header-subinfo-item--comment">{t(TRANSLATION.DRIVER_OFFER_COMMENT)}: {offer.comment || getCandidateFallbackComment(item, order)}</span>
                          </p>
                        </div>
                        <div
                          className={cn('candidate__header-arrow', { 'candidate__header-arrow--active': activeCandidate === item.u_id })}
                          style={{
                            borderRight: `10px solid ${SITE_CONSTANTS.PALETTE.primary.dark}`,
                            borderBottom: `10px solid ${SITE_CONSTANTS.PALETTE.primary.dark}`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className={cn('buttons candidate__buttons', { 'candidate__buttons--active': activeCandidate === item.u_id })}>
                    <Button
                      text={t(TRANSLATION.CHOSE)}
                      onClick={handleChoseClick}
                    />
                    {order && (
                      <ChatToggler
                        anotherUserID={item.u_id}
                        orderID={order.b_id}
                      />
                    )}
                  </div>
                  <div
                    className={cn('candidate__replies', { 'candidate__replies--active': activeCandidate === item.u_id })}
                    style={{ maxHeight: activeCandidate === item.u_id ? 600 * (/*item.u_replies?.length || */0) : 0 }}
                  >
                    {/*item.u_replies?*/([] as IReply[]).map(reply => (
                      <div className="reply">
                        <div className="reply__row">
                          <div className="reply__icon"><img src={images.timer} alt={t(TRANSLATION.DATE_P)}/></div>
                          <div className="reply__content">
                            <b>{t(TRANSLATION.DATE_P)}</b>: {reply.date.format(dateFormatDate)}
                          </div>
                        </div>
                        <div className="reply__row">
                          <div className="reply__icon"><img src={images.uGroup} alt={t(TRANSLATION.CUSTOMER)}/></div>
                          <div className="reply__content">
                            <b>{t(TRANSLATION.CUSTOMER)}</b>: {reply.customerName}
                          </div>
                        </div>
                        <div className="reply__row">
                          <div className="reply__icon"><img src={images.cash} alt={t(TRANSLATION.COST)}/></div>
                          <div className="reply__content">
                            <b>{t(TRANSLATION.COST)}</b>: {reply.payment}
                          </div>
                        </div>
                        <div className="reply__row">
                          <div className="reply__icon"><img src={images.chatIconBr} alt={t(TRANSLATION.COMMENT2)}/></div>
                          <div className="reply__content">
                            <b>{t(TRANSLATION.COMMENT2)}</b>: {reply.content}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(CandidatesModal)