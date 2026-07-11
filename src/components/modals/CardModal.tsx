import React, { useEffect, useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import cn from 'classnames'
import * as API from '../../API'
import {
  EBookingDriverState,
  EBookingStates,
  EColorTypes,
  EPaymentWays,
  EStatuses,
  EOrderProfitRank,
  IAddressDetails,
  IOrder,
} from '../../types/types'
import images from '../../constants/images'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import {
  addHiddenOrder,
  dateFormatDate,
  dateShowFormat,
  formatCommentWithEmoji,
  getOrderCount,
  getPayment,
  formatCurrency,
  distanceBetweenEarthCoordinates,
} from '../../tools/utils'
import {
  calculateFinalPrice,
  calculateFinalPriceFormula,
  candidateMode,
} from '../../tools/order'
import { getApiErrorMessage } from '../../tools/apiMessages'
import { useCachedState, useReliableNow, useSelector } from '../../tools/hooks'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { EMapModalTypes } from '../../state/modals/constants'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { orderActionCreators } from '../../state/order'
import {
  geolocationActionCreators,
  geolocationSelectors,
} from '../../state/geolocation'
import {
  ordersDetailsSelectors,
  ordersDetailsActionCreators,
} from '../../state/ordersDetails'
import { userSelectors } from '../../state/user'
import { configSelectors } from '../../state/config'
import { EDriverTabs } from '../../pages/Driver'
import {
  clearDriverOfferClientResponse,
  ensureDriverOfferClientResponse,
  getBackendDriverOffer,
  getDriverOfferClientResponse,
  getOfferCount,
  getOfferEvent,
  getStoredDriverOffer,
  IDriverOfferPayload,
  isDriverOfferExpired,
  isOfferAcceptedForDriver,
  isOfferOrder,
  isVotingOrder,
  IStoredDriverOffer,
  removeStoredDriverOffer,
  saveStoredDriverOffer,
  subscribeDriverOfferClientResponse,
  updateDriverOfferClientResponseStatus,
  updateStoredDriverOfferStatus,
} from '../../tools/driverOffer'
import Icon from '../Icon'
import Button from '../Button'
import Input, { EInputTypes } from '../Input'
import { Loader } from '../loader/Loader'
import { getStableRemainingLifetimeSeconds } from '../../tools/reliableTime'
import { DRIVER_DOOR_NUMBER_PATTERN, getDriverDoorNumber, normalizeDriverDoorNumber } from '../../tools/driverDoorNumber'
import { isAnyBrowserEmulatorOrder } from '../../tools/emulatorMode'
import '../Card/styles.scss'

const bookingStates: Record<number, keyof typeof EBookingStates> = {
  1: 'Processing',
  2: 'Approved',
  3: 'Canceled',
  4: 'Completed',
  5: 'PendingActivation',
  6: 'OfferedToDrivers',
}

const VOTING_PARTICIPATION_STORAGE_KEY = 'driverVotingParticipations'
const VOTING_ARRIVED_STORAGE_KEY = 'driverVotingArrived'
const DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY = 'driverStartedVotingOrderIds'

function getStoredVotingParticipationIds(): string[] {
  try {
    const value = localStorage.getItem(VOTING_PARTICIPATION_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function saveVotingParticipationId(orderId: IOrder['b_id']) {
  const ids = getStoredVotingParticipationIds()
  const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
  localStorage.setItem(VOTING_PARTICIPATION_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function removeVotingParticipationId(orderId: IOrder['b_id']) {
  const nextIds = getStoredVotingParticipationIds().filter(id => id !== orderId)
  localStorage.setItem(VOTING_PARTICIPATION_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function getStoredVotingArrivedIds(): string[] {
  try {
    const value = localStorage.getItem(VOTING_ARRIVED_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function saveVotingArrivedId(orderId: IOrder['b_id']) {
  const ids = getStoredVotingArrivedIds()
  const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
  localStorage.setItem(VOTING_ARRIVED_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function removeVotingArrivedId(orderId: IOrder['b_id']) {
  const nextIds = getStoredVotingArrivedIds().filter(id => id !== orderId)
  localStorage.setItem(VOTING_ARRIVED_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

function saveStartedVotingOrderId(orderId: IOrder['b_id']) {
  try {
    const value = localStorage.getItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY)
    const ids: string[] = value ? JSON.parse(value) : []
    const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify(nextIds))
  } catch {
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify([orderId]))
  }
}

function hasAnotherVotingDriverReached(order: IOrder | null, userId?: string) {
  return order?.drivers?.some(driver =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  ) ?? false
}

function canMarkVotingArrived(
  order: IOrder | null,
  geoposition?: GeolocationPosition,
  userId?: string,
) {
  if (!order?.b_start_latitude || !order.b_start_longitude || !geoposition)
    return false
  if (hasAnotherVotingDriverReached(order, userId))
    return false

  const distanceMeters = distanceBetweenEarthCoordinates(
    geoposition.coords.latitude,
    geoposition.coords.longitude,
    order.b_start_latitude,
    order.b_start_longitude,
  ) * 1000

  return distanceMeters <= 100
}

function canOpenVotingNavigation(order: IOrder | null, geoposition?: GeolocationPosition) {
  return Boolean(
    order?.b_start_latitude &&
    order.b_start_longitude,
  )
}

function isVotingDriverParticipating(driver?: { c_state?: EBookingDriverState } | null) {
  return !!driver && [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
  ].includes(driver.c_state!)
}

function getVotingInfo(
  order: IOrder | null,
  userId: string | undefined,
  now: number,
) {
  const competitors = order?.drivers?.filter(driver =>
    driver.u_id !== userId &&
    isVotingDriverParticipating(driver),
  ) ?? []
  const distances = competitors
    .map(driver => {
      if (
        !driver.c_latitude ||
        !driver.c_longitude ||
        !order?.b_start_latitude ||
        !order.b_start_longitude
      )
        return null

      return {
        name: getVotingDriverName(driver),
        distance: distanceBetweenEarthCoordinates(
          driver.c_latitude,
          driver.c_longitude,
          order.b_start_latitude,
          order.b_start_longitude,
        ) * 1000,
      }
    })
    .filter((item): item is { name: string, distance: number } => !!item)
    .sort((a, b) => a.distance - b.distance)

  return {
    competitorsCount: competitors.length,
    nearestCompetitor: distances[0] ? formatVotingDistance(distances[0].distance) : '',
    nearestCompetitors: distances.slice(0, 3).map(item => ({
      name: item.name,
      distance: formatVotingDistance(item.distance),
    })),
    remaining: formatVotingRemaining(order, now),
  }
}

function getVotingDriverName(driver: any) {
  const name = [
    driver?.u_name,
    driver?.u_family,
    driver?.user?.u_name,
    driver?.user?.u_family,
  ].filter(Boolean).join(' ').trim()

  return name || 'Водитель'
}

function formatVotingDistance(distanceMeters: number) {
  if (distanceMeters < 1000)
    return `${Math.round(distanceMeters / 10) * 10} м`

  return `${(distanceMeters / 1000).toFixed(1)} км`
}

function formatVotingRemaining(order: IOrder | null, now: number) {
  if (order?.b_max_waiting && order.b_created) {
    const createdAt = order.b_created.valueOf()
    const remainingSeconds = Math.max(
      Math.round(order.b_max_waiting - (now - createdAt) / 1000),
      0,
    )

    return formatSeconds(remainingSeconds)
  }

  const stableRemaining = getStableRemainingLifetimeSeconds(order, now)
  if (stableRemaining !== null)
    return formatSeconds(Math.max(Math.round(stableRemaining), 0))

  return ''
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getVotingCloseMessage(order: IOrder | null, userId?: string) {
  if (!order)
    return ''

  const currentDriver = order.drivers?.find(driver => driver.u_id === userId)
  const anotherDriverStarted = order.drivers?.some(driver =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  )
  if (
    currentDriver &&
    isVotingDriverParticipating(currentDriver) &&
    anotherDriverStarted
  )
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_OTHER)

  if (order.b_state === EBookingStates.Canceled)
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_CLIENT)

  if (order.b_state === EBookingStates.Completed)
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_OTHER)

  if (typeof order.remaining_lifetime_seconds === 'number' &&
    order.remaining_lifetime_seconds <= 0)
    return t(TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT)

  return ''
}


function getNumericValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === '')
      continue
    const number = Number(value)
    if (Number.isFinite(number))
      return number
  }
  return undefined
}

function formatOfferDistance(order: IOrder | null) {
  const meters = getNumericValue(
    order?.b_distance_estimate,
    (order?.b_options?.pricingModel?.options as any)?.distance,
    (order?.b_options?.pricingModel?.options as any)?.routeDistance,
  )
  if (!meters)
    return ''

  const kilometers = meters > 100 ? meters / 1000 : meters
  return `~${Math.max(1, Math.round(kilometers))} км`
}

function formatOfferDuration(order: IOrder | null) {
  const minutes = getNumericValue(
    (order?.b_options?.pricingModel?.options as any)?.duration,
    (order?.b_options?.pricingModel?.options as any)?.time,
    order?.b_estimate_waiting ? order.b_estimate_waiting / 60 : undefined,
  )
  if (!minutes)
    return ''

  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  if (hours <= 0)
    return `~${mins} мин`
  if (mins <= 0)
    return `~${hours} ч`
  return `~${hours} ч ${mins} мин`
}

function formatOfferPrice(value: number | string | undefined) {
  if (value === undefined || value === null || value === '')
    return ''
  return `${value} ${CURRENCY.SIGN}`
}

function getOfferCustomerDesiredPrice(order: IOrder | null) {
  return getNumericValue(
    order?.b_options?.customer_price,
    (order as any)?.customer_price,
    (order as any)?.b_customer_price,
  )
}

function getOfferCalculatedPrice(order: IOrder | null, paymentAmount?: unknown) {
  return getNumericValue(
    order?.b_options?.pricingModel?.price,
    calculateFinalPrice(order),
    paymentAmount,
    order?.b_options?.submitPrice,
  )
}

function getOfferDesiredPrice(order: IOrder | null, paymentAmount?: unknown) {
  return getNumericValue(
    getOfferCustomerDesiredPrice(order),
    order?.b_price_estimate,
    paymentAmount,
  )
}

function formatOfferPriceDifference(desired?: number, calculated?: number) {
  if (desired === undefined || calculated === undefined)
    return ''

  const difference = Math.round((desired - calculated) * 100) / 100
  return `${formatOfferPrice(desired)} - ${formatOfferPrice(calculated)} = ${formatOfferPrice(difference)}`
}

function getOfferCommentText(order: IOrder | null) {
  return [
    order?.b_custom_comment,
    (order?.b_options as any)?.customer_comment,
    order?.b_options?.from_way,
    order?.b_options?.to_way,
  ].filter(Boolean).join('; ')
}

function getOfferStatusText(status?: string) {
  switch (status) {
    case 'accepted': return t(TRANSLATION.DRIVER_OFFER_ACCEPTED)
    case 'rejected': return t(TRANSLATION.DRIVER_OFFER_REJECTED)
    case 'expired': return t(TRANSLATION.DRIVER_OFFER_EXPIRED)
    default: return t(TRANSLATION.DRIVER_OFFER_SENT)
  }
}

function getClientOfferResponseStatusText(status?: string) {
  switch (status) {
    case 'client_selected_this_driver': return t('driver_offer_client_selected_you')
    case 'client_selected_other_driver': return t('driver_offer_client_selected_other')
    case 'driver_confirmed': return t('driver_offer_driver_confirmed')
    case 'driver_declined': return t('driver_offer_driver_declined')
    default: return t('driver_offer_waiting_client_response')
  }
}

function normalizeCurrentOffer(
  backendOffer: IStoredDriverOffer | null,
  storedOffer: IStoredDriverOffer | null,
) {
  const offer = backendOffer ?? storedOffer
  if (!offer)
    return null
  if (isDriverOfferExpired(offer) && offer.status === 'sent')
    return { ...offer, status: 'expired' }
  return offer
}


const DRIVER_OFFER_COMMENT_TEMPLATE_STORAGE_KEY = 'driverOfferCommentTemplate'

function getStoredDriverOfferCommentTemplate() {
  try {
    return localStorage.getItem(DRIVER_OFFER_COMMENT_TEMPLATE_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function setStoredDriverOfferCommentTemplate(comment: string) {
  try {
    localStorage.setItem(DRIVER_OFFER_COMMENT_TEMPLATE_STORAGE_KEY, comment)
  } catch {}
}

function removeStoredDriverOfferCommentTemplate() {
  try {
    localStorage.removeItem(DRIVER_OFFER_COMMENT_TEMPLATE_STORAGE_KEY)
  } catch {}
}

function getDriverOfferEtaQuickOptions() {
  return getDriverOfferEtaOptions().slice(0, 4)
}

function getDriverOfferEtaMoreOptions() {
  return getDriverOfferEtaOptions().slice(4)
}

function getDriverOfferEtaMinuteLabel(value: string) {
  const match = String(value).match(/\d+(?:[,.]\d+)?/)
  return match ? match[0] : value
}

function getDriverOfferEtaOptions() {
  return [
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_5), label: t(TRANSLATION.DRIVER_OFFER_ETA_5) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_10), label: t(TRANSLATION.DRIVER_OFFER_ETA_10) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_15), label: t(TRANSLATION.DRIVER_OFFER_ETA_15) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_20), label: t(TRANSLATION.DRIVER_OFFER_ETA_20) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_30), label: t(TRANSLATION.DRIVER_OFFER_ETA_30) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_45), label: t(TRANSLATION.DRIVER_OFFER_ETA_45) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_60), label: t(TRANSLATION.DRIVER_OFFER_ETA_60) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_90), label: t(TRANSLATION.DRIVER_OFFER_ETA_90) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_120), label: t(TRANSLATION.DRIVER_OFFER_ETA_120) },
    { value: t(TRANSLATION.DRIVER_OFFER_ETA_180), label: t(TRANSLATION.DRIVER_OFFER_ETA_180) },
  ]
}

function getDriverOfferSeatOptions() {
  return [1, 2, 3, 4, 5, 6, 7, 8].map(value => ({
    value,
    label: value.toString(),
  }))
}

function getApiErrorText(error: any) {
  return [
    error?.message,
    error?.error,
    error?.info,
    error?.data?.message,
    error?.data?.error,
    error?.data?.info,
    JSON.stringify(error),
  ].filter(Boolean).join(' ').toLowerCase()
}

function isAlreadyVotingParticipantError(error: any) {
  const text = getApiErrorText(error)
  return text.includes('already performer') || text.includes('booking driver state 2')
}

function isNotAppointedPerformerError(error: any) {
  return getApiErrorText(error).includes('not appointed performer')
}


function getNumericRouteValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === '')
      continue
    const number = Number(value)
    if (Number.isFinite(number) && number > 0)
      return number
  }
  return undefined
}

function normalizeRouteDurationMinutes(value?: number | null) {
  if (!value || !Number.isFinite(value) || value <= 0)
    return undefined

  return Math.max(1, Math.round(value))
}

function getStoredRouteDurationMinutes(order: any) {
  const pricingDuration = getNumericRouteValue(
    order?.b_options?.pricingModel?.options?.duration,
    order?.b_options?.pricingModel?.options?.routeDuration,
    order?.b_options?.pricingModel?.options?.time,
  )
  if (pricingDuration)
    return normalizeRouteDurationMinutes(pricingDuration)

  const estimateWaiting = getNumericRouteValue(order?.b_estimate_waiting)
  if (!estimateWaiting)
    return undefined

  return normalizeRouteDurationMinutes(estimateWaiting > 120 ? estimateWaiting / 60 : estimateWaiting)
}

function getRouteDurationMinutes(routeInfo: any) {
  return normalizeRouteDurationMinutes(
    (Number(routeInfo?.time?.hours) || 0) * 60 +
    (Number(routeInfo?.time?.minutes) || 0),
  )
}


function getFallbackRouteDurationMinutes(order: any) {
  const storedDistance = getNumericRouteValue(
    order?.b_distance_estimate,
    order?.b_options?.pricingModel?.options?.distance,
    order?.b_options?.pricingModel?.options?.routeDistance,
  )
  if (storedDistance) {
    const distanceKm = storedDistance > 1000 ? storedDistance / 1000 : storedDistance
    const roadDistanceKm = distanceKm * 1.15
    const averageCitySpeedKmH = 28

    return normalizeRouteDurationMinutes((roadDistanceKm / averageCitySpeedKmH) * 60)
  }

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
  const roadDistanceKm = distanceKm * 1.35
  const averageCitySpeedKmH = 28

  return normalizeRouteDurationMinutes((roadDistanceKm / averageCitySpeedKmH) * 60)
}

function withRouteTimeout<T>(promise: Promise<T>, ms = 4500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('route timeout')), ms)
    promise
      .then(value => {
        window.clearTimeout(timer)
        resolve(value)
      })
      .catch(error => {
        window.clearTimeout(timer)
        reject(error)
      })
  })
}

function getOrderRoutePoints(order: any) {
  if (
    !order?.b_start_latitude ||
    !order?.b_start_longitude ||
    !order?.b_destination_latitude ||
    !order?.b_destination_longitude
  )
    return null

  return {
    from: {
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
      address: order.b_start_address,
    },
    to: {
      latitude: order.b_destination_latitude,
      longitude: order.b_destination_longitude,
      address: order.b_destination_address,
    },
  }
}

function formatApproximateRouteDuration(minutes?: number | null, isLoading?: boolean) {
  const normalizedMinutes = normalizeRouteDurationMinutes(minutes)
  if (!normalizedMinutes)
    return isLoading ? 'рассчитывается' : '—'

  const hours = Math.floor(normalizedMinutes / 60)
  const mins = normalizedMinutes % 60

  if (hours <= 0)
    return `${normalizedMinutes} мин`
  if (mins <= 0)
    return `${hours} ч`
  return `${hours} ч ${mins} мин`
}


const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
  modal: modalsSelectors.orderCardModal(state),
  activeChat: modalsSelectors.activeChat(state),
  geoposition: geolocationSelectors.geoposition(state),
})

const mapDispatchToProps = {
  watchOrder: ordersActionCreators.watchOrder,
  takeOrder: ordersActionCreators.take,
  setOrderState: ordersActionCreators.setState,
  cancelOrder: ordersActionCreators.cancel,
  getOrderStart: ordersDetailsActionCreators.getOrderStart,
  getOrderDestination: ordersDetailsActionCreators.getOrderDestination,
  setSelectedOrderId: orderActionCreators.setSelectedOrderId,
  setModal: modalsActionCreators.setOrderCardModal,
  setCancelDriverOrderModal: modalsActionCreators.setDriverCancelModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setAlarmModal: modalsActionCreators.setAlarmModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  setMapModal: modalsActionCreators.setMapModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setActiveChat: modalsActionCreators.setActiveChat,
  watchGeolocation: geolocationActionCreators.watch,
  activateGeolocationSending: geolocationActionCreators.activateSending,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IFormValues {
  votingNumber: string
  performers_price: number
  offerPrice: number
  offerEta: string
  offerComment: string
}

interface IProps extends ConnectedProps<typeof connector> {}

function CardModal({ modal, ...props }: IProps) {
  return modal.orderId &&
    <CardModalContent {...modal} {...props} />
}

interface IContentProps extends Omit<ConnectedProps<typeof connector>,
  'modal'
> {
  isOpen: boolean
  orderId: IOrder['b_id']
}

function CardModalContent({
  isOpen: active,
  orderId,
  setModal,
  user,
  activeChat,
  watchOrder,
  takeOrder,
  setOrderState,
  cancelOrder,
  getOrderStart,
  getOrderDestination,
  setSelectedOrderId,
  setMapModal,
  setRatingModal,
  setCancelDriverOrderModal,
  setMessageModal,
  setAlarmModal,
  setActiveChat,
  geoposition,
  watchGeolocation,
  activateGeolocationSending,
}: IContentProps) {

  const avatar = images.avatar
  const avatarSize = '48px'
  const closeModal = () => setModal({ isOpen: false, orderId })

  useEffect(() => active ? watchOrder(orderId) : undefined, [orderId, active])
  const order = useSelector(ordersSelectors.order, orderId) ?? null
  const orderMutates = useSelector(ordersSelectors.orderMutates, orderId)
  const inCandidateMode = useMemo(() =>
    candidateMode(order ?? undefined)
  , [order])

  useEffect(() => {
    if (order) {
      getOrderStart(order)
      getOrderDestination(order)
    }
  }, [order])
  let address = useSelector(ordersDetailsSelectors.start, orderId)
  if (address && 'details' in address)
    address = {
      ...address,
      shortAddress: formatShortAddress(address.details),
    }
  let destinationAddress =
    useSelector(ordersDetailsSelectors.destination, orderId)
  if (destinationAddress)
    destinationAddress = {
      ...destinationAddress,
      address: getSafeAddressValue(destinationAddress.address) ?? '',
      shortAddress: getSafeAddressValue(
        'details' in destinationAddress ?
          formatShortAddress(destinationAddress.details) :
          destinationAddress.shortAddress,
        destinationAddress.shortAddress,
      ),
    }

  const isVotingMode = Boolean(order && isVotingOrder(order))
  const driver = useMemo(() =>
    order?.drivers?.find(item => isVotingMode ?
      isVotingDriverParticipating(item) :
      item.c_state > EBookingDriverState.Canceled)
  , [order?.drivers, isVotingMode])
  const userAsDriver = useMemo(() =>
    user && order?.drivers?.find(i => i.u_id === user.u_id)
  , [order?.drivers])
  const currentLanguage = useSelector(configSelectors.language)
  const [votingParticipationIds, setVotingParticipationIds] = useState(() =>
    getStoredVotingParticipationIds(),
  )
  const [votingArrivedIds, setVotingArrivedIds] = useState(() =>
    getStoredVotingArrivedIds(),
  )
  const now = useReliableNow(Boolean(active && order), 1000)
  const [votingCloseHandled, setVotingCloseHandled] = useState(false)
  const storedRouteDurationMinutes = getStoredRouteDurationMinutes(order)
  const [calculatedRouteDurationMinutes, setCalculatedRouteDurationMinutes] = useState<number | undefined>(undefined)
  const [isRouteDurationLoading, setIsRouteDurationLoading] = useState(false)
  const routeDurationText = formatApproximateRouteDuration(
    calculatedRouteDurationMinutes || storedRouteDurationMinutes || getFallbackRouteDurationMinutes(order),
    isRouteDurationLoading,
  )

  useEffect(() => {
    const routePoints = getOrderRoutePoints(order)
    if (!active || !routePoints) {
      setCalculatedRouteDurationMinutes(undefined)
      setIsRouteDurationLoading(false)
      return
    }

    let cancelled = false
    setIsRouteDurationLoading(true)

    withRouteTimeout(API.makeRoutePoints(routePoints.from, routePoints.to))
      .then((routeInfo) => {
        if (cancelled)
          return
        setCalculatedRouteDurationMinutes(getRouteDurationMinutes(routeInfo))
      })
      .catch((error) => {
        if (cancelled)
          return
        setCalculatedRouteDurationMinutes(getFallbackRouteDurationMinutes(order))
      })
      .finally(() => {
        if (!cancelled)
          setIsRouteDurationLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [
    active,
    order?.b_id,
    order?.b_start_latitude,
    order?.b_start_longitude,
    order?.b_destination_latitude,
    order?.b_destination_longitude,
  ])
  const [offerFormOpen, setOfferFormOpen] = useState(false)
  const [offerEtaDropdownOpen, setOfferEtaDropdownOpen] = useState(false)
  const [localDriverOffer, setLocalDriverOffer] = useState<IStoredDriverOffer | null>(() =>
    getStoredDriverOffer(orderId, user?.u_id),
  )
  const [localOfferClientResponse, setLocalOfferClientResponse] = useState(() =>
    getDriverOfferClientResponse(orderId, user?.u_id),
  )
  const [isOfferCommentTemplateSaved, setIsOfferCommentTemplateSaved] = useState(() => Boolean(getStoredDriverOfferCommentTemplate()))
  const [handledOfferEvent, setHandledOfferEvent] = useState<string | null>(null)
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)

  const [isFromAddressShort, setIsFromAddressShort] = useCachedState(
    'components.modals.CardModal.isFromAddressShort',
    true,
  )
  const [isToAddressShort, setIsToAddressShort] = useCachedState(
    'components.modals.CardModal.isToAddressShort',
    true,
  )

  const navigate = useNavigate()

  const { register, formState: { errors }, handleSubmit: formHandleSubmit, getValues, setValue, watch } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onSubmit',
  })
  const offerEtaValue = watch('offerEta') || t(TRANSLATION.DRIVER_OFFER_ETA_15)

  useEffect(() => {
    if (!active || !user?.u_id)
      return

    if (DRIVER_DOOR_NUMBER_PATTERN.test(normalizeDriverDoorNumber(getValues('votingNumber'))))
      return

    let cancelled = false

    API.getUserCar(user.u_id)
      .then(car => {
        if (cancelled)
          return

        const doorNumber = getDriverDoorNumber(userAsDriver, car)
        if (doorNumber && !DRIVER_DOOR_NUMBER_PATTERN.test(normalizeDriverDoorNumber(getValues('votingNumber'))))
          setValue('votingNumber', doorNumber, { shouldValidate: false })
      })
      .catch(error => console.error(error))

    return () => {
      cancelled = true
    }
  }, [active, orderId, user?.u_id, userAsDriver?.c_id, getValues, setValue])

  const votingParticipationByState = Boolean(
    isVotingMode &&
    userAsDriver &&
    isVotingDriverParticipating(userAsDriver),
  )
  const isVotingParticipant = Boolean(
    isVotingMode &&
    (votingParticipationByState || votingParticipationIds.includes(orderId)),
  )
  const isVotingArrived = Boolean(
    isVotingMode &&
    (userAsDriver?.c_state === EBookingDriverState.Arrived || votingArrivedIds.includes(orderId)),
  )
  const isOfferMode = Boolean(order && isOfferOrder(order))
  const backendDriverOffer = getBackendDriverOffer(order, user?.u_id)
  const currentDriverOffer = normalizeCurrentOffer(backendDriverOffer, localDriverOffer)
  const currentOfferStatus = currentDriverOffer?.status
  const currentOfferExpired = Boolean(currentDriverOffer && isDriverOfferExpired(currentDriverOffer))
  const isOfferAssignedTrip = isOfferAcceptedForDriver(order, user?.u_id)
  const shouldUseOfferFlow = Boolean(isOfferMode && !isOfferAssignedTrip)
  // Backend-only contract: client response/selection must come from order data/polling,
  // not from a local frontend timer. Emulator orders still use backend for the driver offer.
  const shouldSimulateOfferClientResponse = false
  const offerClientResponse = shouldSimulateOfferClientResponse ? localOfferClientResponse : null

  useEffect(() => {
    if (!active || (!isVotingMode && (!shouldUseOfferFlow || !offerFormOpen)))
      return

    if (!getValues('offerEta'))
      setValue('offerEta', t(TRANSLATION.DRIVER_OFFER_ETA_15), { shouldValidate: false })
  }, [active, isVotingMode, shouldUseOfferFlow, offerFormOpen, getValues, setValue])

  useEffect(() => {
    if (!active || !offerFormOpen)
      return

    const storedComment = getStoredDriverOfferCommentTemplate()
    setIsOfferCommentTemplateSaved(Boolean(storedComment))
    if (storedComment && !getValues('offerComment'))
      setValue('offerComment', storedComment, { shouldValidate: false })
  }, [active, offerFormOpen, getValues, setValue])

  useEffect(() => {
    if (active && orderId)
      setSelectedOrderId(orderId)
  }, [active, orderId])

  useEffect(() => {
    setHideConfirmOpen(false)
  }, [active, orderId])

  useEffect(() => {
    if (!active || order)
      return

    const wasVotingParticipant = votingParticipationIds.includes(orderId)
    if (!wasVotingParticipant)
      return

    setVotingParticipationIds(removeVotingParticipationId(orderId))
    setVotingArrivedIds(removeVotingArrivedId(orderId))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_CLIENT),
    })
    closeModal()
  }, [active, order, orderId, votingParticipationIds])

  useEffect(() => {
    setLocalDriverOffer(getBackendDriverOffer(order, user?.u_id) ?? getStoredDriverOffer(orderId, user?.u_id))
    setLocalOfferClientResponse(getDriverOfferClientResponse(orderId, user?.u_id))
    setHandledOfferEvent(null)
  }, [orderId, order?.b_id, user?.u_id])

  useEffect(() => {
    if (!active || !shouldSimulateOfferClientResponse || !currentDriverOffer || currentOfferExpired) {
      setLocalOfferClientResponse(null)
      return
    }

    const syncOfferClientResponse = () => {
      const nextResponse = ensureDriverOfferClientResponse(
        orderId,
        user?.u_id,
        currentDriverOffer.createdAt,
        Date.now(),
      )
      setLocalOfferClientResponse(nextResponse)
    }

    syncOfferClientResponse()
    const unsubscribe = subscribeDriverOfferClientResponse(syncOfferClientResponse)
    return unsubscribe
  }, [
    active,
    shouldSimulateOfferClientResponse,
    currentDriverOffer?.createdAt,
    currentDriverOffer?.status,
    currentOfferExpired,
    orderId,
    user?.u_id,
    now,
  ])

  useEffect(() => {
    if (!active || !shouldUseOfferFlow || !currentDriverOffer)
      return

    if (currentOfferExpired && currentDriverOffer.status === 'sent') {
      const nextOffer = updateStoredDriverOfferStatus(orderId, user?.u_id, 'expired') ?? {
        ...currentDriverOffer,
        status: 'expired',
      }
      setLocalDriverOffer(nextOffer)
      setOfferFormOpen(false)
      if (handledOfferEvent !== 'expired') {
        setHandledOfferEvent('expired')
        setMessageModal({
          isOpen: true,
          status: EStatuses.Warning,
          message: t(TRANSLATION.DRIVER_OFFER_EXPIRED),
        })
      }
    }
  }, [active, shouldUseOfferFlow, currentDriverOffer, currentOfferExpired, handledOfferEvent, orderId, user?.u_id])

  useEffect(() => {
    if (!active || !shouldUseOfferFlow)
      return

    const offerEvent = getOfferEvent(order, user?.u_id) || currentOfferStatus
    if (!offerEvent || handledOfferEvent === offerEvent)
      return

    if (offerEvent === 'rejected') {
      setHandledOfferEvent(offerEvent)
      removeStoredDriverOffer(orderId, user?.u_id)
      setLocalDriverOffer(null)
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: t(TRANSLATION.DRIVER_OFFER_REJECTED),
      })
      closeModal()
      return
    }

    if (offerEvent === 'accepted') {
      setHandledOfferEvent(offerEvent)
      setLocalDriverOffer(currentDriverOffer ? { ...currentDriverOffer, status: 'accepted' } : null)
      setMessageModal({
        isOpen: true,
        status: EStatuses.Success,
        message: t(TRANSLATION.DRIVER_OFFER_ACCEPTED),
      })
      return
    }

    if (offerEvent === 'expired') {
      setHandledOfferEvent(offerEvent)
      const nextOffer = updateStoredDriverOfferStatus(orderId, user?.u_id, 'expired') ?? (
        currentDriverOffer ? { ...currentDriverOffer, status: 'expired' } : null
      )
      setLocalDriverOffer(nextOffer)
      setOfferFormOpen(false)
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: t(TRANSLATION.DRIVER_OFFER_EXPIRED),
      })
    }
  }, [active, shouldUseOfferFlow, order, user?.u_id, currentOfferStatus, currentDriverOffer, handledOfferEvent, orderId])

  useEffect(() => {
    if (!active || !isVotingParticipant)
      return

    const unwatch = watchGeolocation({ interval: 3000 })
    const deactivateSending = activateGeolocationSending()

    return () => {
      deactivateSending()
      unwatch()
    }
  }, [active, isVotingParticipant, watchGeolocation, activateGeolocationSending])

  useEffect(() => {
    if (!active || !isVotingMode || !isVotingParticipant || votingCloseHandled)
      return

    const closeReason = getVotingCloseMessage(order, user?.u_id)
    if (!closeReason)
      return

    setVotingCloseHandled(true)
    setVotingParticipationIds(removeVotingParticipationId(orderId))
    setVotingArrivedIds(removeVotingArrivedId(orderId))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: closeReason,
    })
    closeModal()
  }, [active, order, isVotingParticipant, votingCloseHandled, user?.u_id])

  const handleSubmit = () => orderMutation(async() => {
    if (shouldUseOfferFlow) {
      if (currentDriverOffer && !currentOfferExpired && currentDriverOffer.status !== 'expired')
        return

      if (!offerFormOpen) {
        setOfferFormOpen(true)
        return
      }

      const values = getValues()
      const offerPayload: IDriverOfferPayload = {
        price: Number(values.offerPrice),
        eta: values.offerEta || t(TRANSLATION.DRIVER_OFFER_ETA_15),
        comment: values.offerComment,
      }
      await API.sendOrderOffer(orderId, offerPayload)
      const storedOffer = saveStoredDriverOffer(orderId, user?.u_id, offerPayload, 'sent')
      setLocalDriverOffer(storedOffer)
      clearDriverOfferClientResponse(orderId, user?.u_id)
      setLocalOfferClientResponse(null)
      setOfferFormOpen(false)
      setHandledOfferEvent(null)
      // Не открываем лишний success-попап с OK: карточка сразу меняет состояние
      // на "Предложение отправлено" и показывает кнопку отмены/скрытия.
      return
    }

    if (isVotingMode) {
      if (isVotingDriverParticipating(userAsDriver)) {
        const nextIds = saveVotingParticipationId(orderId)
        setVotingParticipationIds(nextIds)
        navigate('/driver-order?tab=map')
        closeModal()
        return
      }

      try {
        await API.participateVotingOrder(orderId, getValues().performers_price, getValues().offerEta || t(TRANSLATION.DRIVER_OFFER_ETA_15))
      } catch (error) {
        if (!isAlreadyVotingParticipantError(error))
          throw error
      }
      const nextIds = saveVotingParticipationId(orderId)
      setVotingParticipationIds(nextIds)
      setMessageModal({
        isOpen: true,
        status: EStatuses.Success,
        message: t(TRANSLATION.DRIVER_VOTING_READY_SENT),
      })
      navigate('/driver-order?tab=map')
      closeModal()
      return
    }

    await takeOrder(orderId, { ...getValues() })
    navigate('/driver-order?tab=map')
    closeModal()
  })

  const onArrivedClick = () => orderMutation(async() => {
    await setOrderState(orderId, EBookingDriverState.Arrived)
  })

  const requestHideOrder = () => {
    setHideConfirmOpen(true)
  }

  const cancelHideOrder = () => {
    setHideConfirmOpen(false)
  }

  const confirmHideOrder = () => {
    addHiddenOrder(orderId, user?.u_id)
    closeModal()
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const confirmCancelOfferAndHide = () => orderMutation(async() => {
    await API.cancelVotingParticipation(orderId)
    removeStoredDriverOffer(orderId, user?.u_id)
    clearDriverOfferClientResponse(orderId, user?.u_id)
    setLocalOfferClientResponse(null)
    setLocalDriverOffer(null)
    addHiddenOrder(orderId, user?.u_id)
    setMessageModal({
      isOpen: true,
      status: EStatuses.Success,
      message: t('driver_offer_cancelled_hidden'),
    })
    closeModal()
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  })

  const confirmClientSelectedOffer = () => orderMutation(async() => {
    const values = getValues()
    await API.takeOrder(orderId, {
      votingNumber: values.votingNumber,
      performers_price: currentDriverOffer?.price ?? values.performers_price,
    }, false)
    const nextResponse = updateDriverOfferClientResponseStatus(orderId, user?.u_id, 'driver_confirmed')
    watchOrder(orderId)
    setLocalOfferClientResponse(nextResponse)
    navigate('/driver-order?tab=map')
    closeModal()
  })

  const declineClientSelectedOffer = () => {
    const nextResponse = updateDriverOfferClientResponseStatus(orderId, user?.u_id, 'driver_declined')
    setLocalOfferClientResponse(nextResponse)
    removeStoredDriverOffer(orderId, user?.u_id)
    setLocalDriverOffer(null)
    addHiddenOrder(orderId, user?.u_id)
    closeModal()
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const hideOtherClientSelectedOffer = () => {
    addHiddenOrder(orderId, user?.u_id)
    closeModal()
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const onStartedClick = () => orderMutation(async() => {
    await setOrderState(orderId, EBookingDriverState.Started)
    navigate('/driver-order?tab=map')
    closeModal()
  })

  const onCompleteOrderClick = () => orderMutation(async() => {
    await setOrderState(orderId, EBookingDriverState.Finished)
    navigate(`/driver-order?tab=${EDriverTabs.Lite}`)
    setRatingModal({ isOpen: true, orderID: orderId })
    closeModal()
  })

  const cancelAndClose = () => orderMutation(async() => {
    await cancelOrder(orderId)
    closeModal()
  })

  const cancelVotingDeparture = () => orderMutation(async() => {
    await API.cancelVotingParticipation(orderId)
    const nextIds = removeVotingParticipationId(orderId)
    const nextArrivedIds = removeVotingArrivedId(orderId)
    setVotingParticipationIds(nextIds)
    setVotingArrivedIds(nextArrivedIds)
    setMessageModal({
      isOpen: true,
      status: EStatuses.Success,
      message: t(TRANSLATION.DRIVER_VOTING_CANCELLED),
    })
  })

  const arrivedVotingOrder = () => orderMutation(async() => {
    if (userAsDriver?.c_state !== EBookingDriverState.Arrived) {
      try {
        if (
          userAsDriver?.c_state === EBookingDriverState.Performer ||
          userAsDriver?.c_state === EBookingDriverState.Started
        )
          await setOrderState(orderId, EBookingDriverState.Arrived)
      } catch (error) {
        if (!isNotAppointedPerformerError(error))
          throw error
      }
    }
    try {
      await API.arrivedVotingOrder(orderId)
    } catch (error) {
      if (!isNotAppointedPerformerError(error))
        throw error
    }
    const nextIds = saveVotingArrivedId(orderId)
    setVotingArrivedIds(nextIds)
  })

  const openVotingNavigation = () => {
    setMapModal({
      isOpen: true,
      type: EMapModalTypes.VotingNavigation,
      defaultCenter: order?.b_start_latitude && order?.b_start_longitude ?
        [order.b_start_latitude, order.b_start_longitude] :
        null,
      from: geoposition ? {
        latitude: geoposition.coords.latitude,
        longitude: geoposition.coords.longitude,
      } : null,
      to: order?.b_start_latitude && order?.b_start_longitude ? {
        address: order.b_start_address,
        latitude: order.b_start_latitude,
        longitude: order.b_start_longitude,
      } : null,
    })
  }

  const confirmVotingCode = formHandleSubmit(({ votingNumber }) => orderMutation(async() => {
    const expectedCode = normalizeDriverDoorNumber(order?.b_driver_code)
    const enteredCode = normalizeDriverDoorNumber(votingNumber)

    if (!DRIVER_DOOR_NUMBER_PATTERN.test(enteredCode) ||
      (DRIVER_DOOR_NUMBER_PATTERN.test(expectedCode) && enteredCode !== expectedCode)) {
      setMessageModal({
        isOpen: true,
        message: t(TRANSLATION.WRONG_BOARDING_CODE),
        status: EStatuses.Fail,
      })
      return
    }

    await API.confirmVotingCode(orderId, enteredCode)
    await setOrderState(orderId, EBookingDriverState.Started, enteredCode)
    saveStartedVotingOrderId(orderId)
    setVotingParticipationIds(removeVotingParticipationId(orderId))
    setVotingArrivedIds(removeVotingArrivedId(orderId))
    navigate('/driver-order?tab=map')
    closeModal()
  }))

  async function orderMutation(mutation: () => Promise<void>) {
    try {
      await mutation()
    } catch (error) {
      console.error(error)
      setMessageModal({
        isOpen: true,
        message: getApiErrorMessage(error, { context: 'driver-order' }),
        status: EStatuses.Fail,
      })
    }
  }

  const onAlarmClick = () => {
    setAlarmModal({ isOpen: true })
  }

  const onRateOrderClick = () => {
    setRatingModal({ isOpen: true, orderID: orderId })
  }

  const openChatModal = () => {
    // Если клиент на сайте, используем стандартный чат
    if (!order?.b_options?.createdBy) {
      const from = `${user?.u_id}_${orderId}`
      const to = `${order?.u_id}_${orderId}`
      const chatID = `${from};${to}`
      setActiveChat(activeChat === chatID ? null : chatID)
      return
    }

    // Ищем профиль клиента
    if (!order.user) return

    // В зависимости от типа контакта формируем соответствующую ссылку
    switch (order.b_options.createdBy) {
      case 'sms':
        // Ссылка на приложение для звонков
        window.location.href = `tel:${order.user?.u_phone}`
        break
      case 'whatsapp':
        window.location.href = `https://wa.me/${order.user?.u_phone}`
        break
      default:
        // Для неизвестных типов используем стандартный чат
        const from = `${user?.u_id}_${orderId}`
        const to = `${order?.u_id}_${orderId}`
        const chatID = `${from};${to}`
        setActiveChat(activeChat === chatID ? null : chatID)
    }
  }


  const renderOfferEtaPicker = (extraClassName?: string) => {
    const quickOptions = getDriverOfferEtaQuickOptions()
    const moreOptions = getDriverOfferEtaMoreOptions()
    const isQuickValue = quickOptions.some(option => option.value === offerEtaValue)

    return (
      <div className={cn('order__driver-offer-choice', extraClassName)}>
        <input
          type="hidden"
          {...register('offerEta', { required: t(TRANSLATION.REQUIRED_FIELD) })}
          value={offerEtaValue}
          readOnly
        />
        <div className="order__driver-offer-choice-label">{t(TRANSLATION.DRIVER_OFFER_ETA_QUICK_TITLE)}</div>
        <div className="order__driver-offer-eta-control">
          <div className="order__driver-offer-eta-quick">
            {quickOptions.map(option => (
              <button
                key={String(option.value)}
                type="button"
                className={cn('order__driver-offer-eta-chip', { 'order__driver-offer-eta-chip--active': offerEtaValue === option.value })}
                onClick={() => {
                  setValue('offerEta', String(option.value), { shouldValidate: true })
                  setOfferEtaDropdownOpen(false)
                }}
              >
                {getDriverOfferEtaMinuteLabel(option.value)}
              </button>
            ))}
          </div>
          <div className="order__driver-offer-select-wrap order__driver-offer-select-wrap--compact">
            <div
              className={cn('order__driver-offer-select', { 'order__driver-offer-select--open': offerEtaDropdownOpen, 'order__driver-offer-select--active': !isQuickValue })}
              onClick={() => setOfferEtaDropdownOpen(prev => !prev)}
              role="button"
              tabIndex={0}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setOfferEtaDropdownOpen(prev => !prev)
                }
              }}
            >
              <span>{isQuickValue ? t(TRANSLATION.DRIVER_OFFER_MORE_ETA) : offerEtaValue}</span>
              <i aria-hidden="true">▾</i>
            </div>
            {offerEtaDropdownOpen && (
              <div className="order__driver-offer-select-list">
                {moreOptions.map(option => (
                  <div
                    key={String(option.value)}
                    className={cn('order__driver-offer-select-option', { 'order__driver-offer-select-option--active': offerEtaValue === option.value })}
                    onClick={() => {
                      setValue('offerEta', String(option.value), { shouldValidate: true })
                      setOfferEtaDropdownOpen(false)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setValue('offerEta', String(option.value), { shouldValidate: true })
                        setOfferEtaDropdownOpen(false)
                      }
                    }}
                  >
                    {option.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {errors?.offerEta?.message && <div className="order__driver-offer-error">{errors.offerEta.message}</div>}
      </div>
    )
  }

  const toggleOfferCommentTemplate = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    if (isOfferCommentTemplateSaved) {
      removeStoredDriverOfferCommentTemplate()
      setIsOfferCommentTemplateSaved(false)
      return
    }

    const comment = String(getValues('offerComment') || '').trim()
    if (!comment)
      return

    setStoredDriverOfferCommentTemplate(comment)
    setIsOfferCommentTemplateSaved(true)
  }

  const getButtons = () => {
    const buttonProps = {
      className: 'order_take-order-btn',
      wrapperProps: { className: 'order_action-button-wrapper' },
    }
    const actionButtonProps = {
      ...buttonProps,
      disabled: orderMutates,
    }
    const submitButtonProps = {
      ...actionButtonProps,
      type: 'submit' as const,
    }
    const renderHideOrderButton = () => hideConfirmOpen ? (
      <div className="status-card__hide-confirm">
        <div className="status-card__hide-confirm-title">{t(TRANSLATION.HIDE_ORDER)}?</div>
        <Button
          {...actionButtonProps}
          className="order_take-order-btn"
          text={t(TRANSLATION.YES)}
          onClick={confirmHideOrder}
        />
        <Button
          {...actionButtonProps}
          className="order_hide-order-btn"
          text={t(TRANSLATION.NO)}
          onClick={cancelHideOrder}
        />
      </div>
    ) : (
      <Button
        {...actionButtonProps}
        className="order_hide-order-btn"
        text={t(TRANSLATION.HIDE_ORDER)}
        onClick={requestHideOrder}
      />
    )

    const renderCancelOfferAndHideButton = () => hideConfirmOpen ? (
      <div className="status-card__hide-confirm">
        <div className="status-card__hide-confirm-title">{t('driver_offer_cancel_and_hide_confirm')}</div>
        <Button
          {...actionButtonProps}
          className="order_take-order-btn"
          text={t(TRANSLATION.YES)}
          onClick={confirmCancelOfferAndHide}
        />
        <Button
          {...actionButtonProps}
          className="order_hide-order-btn"
          text={t(TRANSLATION.NO)}
          onClick={cancelHideOrder}
        />
      </div>
    ) : (
      <Button
        {...actionButtonProps}
        className="order_hide-order-btn"
        text={t('driver_offer_cancel_and_hide')}
        onClick={requestHideOrder}
      />
    )

    if (!order)
      return (
        <Button
          {...buttonProps}
          text={t(TRANSLATION.EXIT_NOT_AVIABLE)}
          onClick={closeModal}
        />
      )

    if (order.b_state === EBookingStates.Canceled)
      return (
        <Button
          {...buttonProps}
          text={t(TRANSLATION.EXIT_USER_CANCELLED)}
          onClick={closeModal}
        />
      )

    if (shouldUseOfferFlow) {
      if (currentDriverOffer && !currentOfferExpired && currentDriverOffer.status !== 'expired') {
        const clientResponseStatus = offerClientResponse?.status
        return <>
          {shouldSimulateOfferClientResponse && clientResponseStatus === 'client_selected_this_driver' && <>
            <Button
              {...actionButtonProps}
              text={t('driver_offer_confirm_selection')}
              onClick={confirmClientSelectedOffer}
            />
            <Button
              {...actionButtonProps}
              className="order_hide-order-btn"
              text={t('driver_offer_decline_and_hide')}
              onClick={declineClientSelectedOffer}
            />
          </>}
          {shouldSimulateOfferClientResponse && clientResponseStatus === 'client_selected_other_driver' && (
            <Button
              {...actionButtonProps}
              className="order_hide-order-btn"
              text={t(TRANSLATION.HIDE_ORDER)}
              onClick={hideOtherClientSelectedOffer}
            />
          )}
          {shouldSimulateOfferClientResponse && (!clientResponseStatus || clientResponseStatus === 'waiting') && (
            <Button
              {...actionButtonProps}
              text={t('driver_offer_waiting_client_response')}
              disabled
            />
          )}
          {!shouldSimulateOfferClientResponse && renderCancelOfferAndHideButton()}
        </>
      }

      if (offerFormOpen)
        return <>
          <div className="driver-offer-form-title">{t(TRANSLATION.DRIVER_OFFER_FORM_TITLE)}</div>
          <Input
            inputProps={{
              ...register('offerPrice', {
                required: t(TRANSLATION.REQUIRED_FIELD),
                min: 0,
                valueAsNumber: true,
              }),
              type: 'number',
              min: 0,
              defaultValue: getOfferDesiredPrice(order, paymentAmount),
            }}
            error={errors?.offerPrice?.message}
            label={t(TRANSLATION.DRIVER_OFFER_PRICE)}
            fieldWrapperClassName="order__driver-offer-field"
            oneline
          />
          {renderOfferEtaPicker()}
          <div className="order__driver-offer-comment-wrap">
            <Input
              inputType={EInputTypes.Textarea}
              inputProps={{
                ...register('offerComment'),
                placeholder: t(TRANSLATION.DRIVER_OFFER_COMMENT_PLACEHOLDER),
              }}
              error={errors?.offerComment?.message}
              label={t(TRANSLATION.DRIVER_OFFER_COMMENT)}
              fieldWrapperClassName="order__driver-offer-field order__driver-offer-field--comment"
            />
            <button
              type="button"
              className={cn('order__driver-offer-comment-save', { 'order__driver-offer-comment-save--active': isOfferCommentTemplateSaved })}
              onClick={toggleOfferCommentTemplate}
              title={isOfferCommentTemplateSaved ? t(TRANSLATION.DRIVER_OFFER_COMMENT_SAVED) : t(TRANSLATION.DRIVER_OFFER_COMMENT_SAVE)}
              aria-label={isOfferCommentTemplateSaved ? t(TRANSLATION.DRIVER_OFFER_COMMENT_SAVED) : t(TRANSLATION.DRIVER_OFFER_COMMENT_SAVE)}
            >
              ★
            </button>
          </div>
          <Button
            {...submitButtonProps}
            text={t(TRANSLATION.DRIVER_OFFER_SEND)}
          />
          {renderHideOrderButton()}
        </>

      return <>
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.DRIVER_OFFER_SEND)}
          onClick={() => setOfferFormOpen(true)}
        />
        {renderHideOrderButton()}
      </>
    }

    if (isVotingMode && isVotingParticipant)
      return <>
        {isVotingArrived && (
          <Input
            inputProps={{
              ...register('votingNumber', {
                required: t(TRANSLATION.REQUIRED_FIELD),
                pattern: {
                  value: DRIVER_DOOR_NUMBER_PATTERN,
                  message: t(TRANSLATION.DRIVE_NUMBER_HINT),
                },
                onChange: event => {
                  event.target.value = normalizeDriverDoorNumber(event.target.value)
                },
              }),
              type: 'text',
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 4,
              autoComplete: 'off',
            }}
            error={errors?.votingNumber?.message}
            label={t(TRANSLATION.DRIVE_NUMBER)}
          />
        )}
        {!isVotingArrived && (
          <Button
            {...actionButtonProps}
            text={t(TRANSLATION.DRIVER_VOTING_ARRIVED)}
            onClick={arrivedVotingOrder}
            disabled={orderMutates || !canMarkVotingArrived(order, geoposition, user?.u_id)}
          />
        )}
        {isVotingArrived && (
          <Button
            {...actionButtonProps}
            text={t(TRANSLATION.DRIVER_VOTING_CONFIRM_CODE)}
            onClick={confirmVotingCode}
          />
        )}
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.DRIVER_VOTING_NAVIGATION)}
          onClick={openVotingNavigation}
          disabled={orderMutates || !canOpenVotingNavigation(order, geoposition)}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.DRIVER_VOTING_CANCEL_DEPARTURE)}
          onClick={cancelVotingDeparture}
        />
      </>

    if (userAsDriver?.c_state === EBookingDriverState.Performer)
      return <>
        <Button
          {...actionButtonProps}
          svg={<Icon src="whatsapp" width="20" height="20" fill="white" />}
          onClick={openChatModal}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.ARRIVED)}
          onClick={onArrivedClick}
        />
        <Button
          {...actionButtonProps}
          svg={<Icon src="chat" width="20" height="20" fill="white" />}
          onClick={() => setCancelDriverOrderModal(true)}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
      </>
    if (userAsDriver?.c_state === EBookingDriverState.Arrived)
      return <>
        <Button
          {...actionButtonProps}
          svg={<Icon src="whatsapp" width="20" height="20" fill="white" />}
          onClick={openChatModal}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.WENT)}
          onClick={onStartedClick}
        />
        <Button
          {...actionButtonProps}
          svg={<Icon src="chat" width="20" height="20" fill="white" />}
          onClick={() => setCancelDriverOrderModal(true)}
          wrapperProps={{ style: { maxWidth: '20%' } }}
        />
      </>
    if (userAsDriver?.c_state === EBookingDriverState.Started)
      return <>
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.CLOSE_DRIVE)}
          onClick={onCompleteOrderClick}
        />
        <Button
          {...actionButtonProps}
          className="order_alarm-btn"
          text={`${t(TRANSLATION.ALARM)}`}
          onClick={onAlarmClick}
          colorType={EColorTypes.Accent}
        />
      </>
    if (userAsDriver?.c_state === EBookingDriverState.Finished)
      return <>
        <Button
          {...actionButtonProps}
          text={t(TRANSLATION.DRIVER_MARK_TIPS)}
          onClick={onRateOrderClick}
        />
      </>

    if (userAsDriver?.c_state === EBookingDriverState.Considering)
      return (
        <Button
          {...actionButtonProps}
          text="Водитель оставить"
          onClick={cancelAndClose}
        />
      )

    if (!driver || isVotingMode)
      return <>
        {SITE_CONSTANTS.C_OPTIONS_VALID_KEYS.performers_price &&
          inCandidateMode &&
          <Input
            inputProps={{
              ...register('performers_price', {
                required: t(TRANSLATION.REQUIRED_FIELD),
                min: 0,
                valueAsNumber: true,
              }),
              type: 'number',
              min: 0,
            }}
            error={errors?.performers_price?.message}
            label={t(TRANSLATION.PRICE_PERFORMER)}
            oneline
          />
        }
        {isVotingMode && renderOfferEtaPicker('order__driver-offer-choice--voting')}
        <Button
          {...submitButtonProps}
          text={t(
            isVotingMode ?
              TRANSLATION.DRIVER_VOTING_GOING_ACTION :
              inCandidateMode ?
                TRANSLATION.MAKE_OFFER :
                TRANSLATION.TAKE_ORDER,
          )}
        />
        {renderHideOrderButton()}
      </>

    return (
      <Button
        {...buttonProps}
        text={t(TRANSLATION.EXIT)}
        onClick={closeModal}
      />
    )
  }

  const outsideClick = ( e: React.MouseEvent<HTMLDivElement, MouseEvent> ) => {
    if ( e.currentTarget === e.target ) {
      closeModal()
    }
  }

  const fromAddressToggleHandler = (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    setIsFromAddressShort(prev => !prev)
  }

  const toAddressToggleHandler = (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault()
    event?.stopPropagation()
    setIsToAddressShort(prev => !prev)
  }

  const getStatusText = () => {
    if (isVotingMode) return t(TRANSLATION.VOTER)
    return ''
  }

  const getStatusTextColor = () => {
    if (isVotingMode) return '#FF2400'
    // 'reccomended': return '#00A72F'\
    return 'rgba(0, 0, 0, 0.25)'
  }
  const price = calculateFinalPrice(order)
  const payment = getPayment(order)
  const paymentAmount = getSafePaymentAmount(price, payment.value)
  const offerCount = getOfferCount(order)
  const offerCommentText = getOfferCommentText(order)
  const offerDesiredPrice = getOfferDesiredPrice(order, paymentAmount)
  const offerCustomerDesiredPrice = getOfferCustomerDesiredPrice(order)
  const offerCalculatedPrice = getOfferCalculatedPrice(order, paymentAmount)
  const offerPriceDifferenceText = formatOfferPriceDifference(offerCustomerDesiredPrice, offerCalculatedPrice)
  const votingInfo = getVotingInfo(order, user?.u_id, now)
  const showVotingCompetitors = userAsDriver?.c_state === EBookingDriverState.Considering
  const orderMapFromPoint = address?.latitude && address.longitude ? address : (
    order?.b_start_latitude && order.b_start_longitude ? {
      address: order.b_start_address,
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
    } : null
  )
  const orderMapToPoint = destinationAddress?.latitude && destinationAddress.longitude ? destinationAddress : (
    order?.b_destination_latitude && order.b_destination_longitude ? {
      address: order.b_destination_address,
      latitude: order.b_destination_latitude,
      longitude: order.b_destination_longitude,
    } : null
  )
  const openOrderPointOnMap = (highlight: 'from' | 'to') => {
    const point = highlight === 'from' ? orderMapFromPoint : orderMapToPoint

    setMapModal({
      isOpen: true,
      type: EMapModalTypes.OrderDetails,
      defaultCenter: point?.latitude && point.longitude ?
        [point.latitude, point.longitude] :
        null,
      from: orderMapFromPoint,
      to: orderMapToPoint,
      highlight,
    })
  }

  const _type = order?.b_payment_way === EPaymentWays.Credit ?
    TRANSLATION.CARD :
    TRANSLATION.CASH
  const _value = order?.b_options?.customer_price ?
    (
      t(_type) + '. ' +
      t(TRANSLATION.CUSTOMER_PRICE) +
      ` ${order.b_options.customer_price} ${CURRENCY.SIGN}`
    ) :
    (
      t(_type) + '. ' +
      t(TRANSLATION.FIXED) + '. ' +
      formatPaymentAmount(paymentAmount)
    )

  const fromFullAddress = getSafeAddressValue(
    address?.address,
    order?.b_start_address,
    address?.shortAddress,
    getCoordinatesAddress(order?.b_start_latitude, order?.b_start_longitude),
    getCoordinatesAddress(address?.latitude, address?.longitude),
  )
  const fromShortAddress = getSafeAddressValue(
    getCompactAddress(address?.shortAddress),
    getCompactAddress(fromFullAddress),
    address?.shortAddress,
    fromFullAddress,
  )
  const fromAddressText = getSafeAddressText(
    currentLanguage,
    isFromAddressShort ? fromShortAddress : fromFullAddress,
    isFromAddressShort ? fromFullAddress : fromShortAddress,
    order?.b_start_address,
  )
  const canToggleFromAddress = Boolean(
    fromFullAddress &&
    fromShortAddress &&
    normalizeComparableAddress(fromFullAddress) !== normalizeComparableAddress(fromShortAddress),
  )

  const toFullAddress = getSafeAddressValue(
    destinationAddress?.address,
    order?.b_destination_address,
    destinationAddress?.shortAddress,
    getCoordinatesAddress(order?.b_destination_latitude, order?.b_destination_longitude),
    getCoordinatesAddress(destinationAddress?.latitude, destinationAddress?.longitude),
  )
  const toShortAddress = getSafeAddressValue(
    getCompactAddress(destinationAddress?.shortAddress),
    getCompactAddress(toFullAddress),
    destinationAddress?.shortAddress,
    toFullAddress,
  )
  const toAddressText = getSafeAddressText(
    currentLanguage,
    isToAddressShort ? toShortAddress : toFullAddress,
    isToAddressShort ? toFullAddress : toShortAddress,
    order?.b_destination_address,
  )
  const canToggleToAddress = Boolean(
    toFullAddress &&
    toShortAddress &&
    normalizeComparableAddress(toFullAddress) !== normalizeComparableAddress(toShortAddress),
  )

  return (
    <div
      className={cn(
        'status-card__modal',
        order?.profitRank !== undefined && `status-card__modal--profit--${{
          [EOrderProfitRank.Low]: 'low',
          [EOrderProfitRank.Medium]: 'medium',
          [EOrderProfitRank.High]: 'high',
        }[order.profitRank]}`,
      )}
      data-active={active}
      onClick={outsideClick}
    >
      <div>

        <div className='top' >
          <div
            className="avatar"
            style={{
              backgroundSize: avatarSize,
              backgroundImage: `url(${avatar})`,
            }}
          />
          <div className="name" >
            <p>
              {order?.user?.u_family?.trimStart()}
              {order?.user?.u_name?.trimStart()}
              {order?.user?.u_middle?.trimStart()}
              <span>
                ({order?.u_id}) ({bookingStates[order?.b_state as any]})
              </span>
            </p>
          </div>
          <div className='stars' >
            {[1,2,3,4].map(num =>
              <Icon
                key={num}
                src="filledStar"
                width="10"
                height="10"
                fill="#FF2400"
              />,
            )}
            {[1].map(num =>
              <Icon
                key={num}
                src="star"
                width="10"
                height="10"
                stroke="#FF2400"
              />,
            )}
            <span>24/20</span>
          </div>
          <b style={{ color: getStatusTextColor() }}>№{order?.b_id} {getStatusText()}</b>
        </div>

        <div className='address' >
          <b>{translateWithFallback(TRANSLATION.APPROXIMATE_TIME, currentLanguage, { ru: 'Ожидаемое время', en: 'Estimate time' })}: {routeDurationText}</b>
          <div className="address__content">
            <div className="address__title">
              {translateWithFallback(TRANSLATION.ADDRESSES, currentLanguage, { ru: 'Адрес отправления и прибытия', en: 'Departure and Arrival Address' })}
            </div>

            <div className="address__row address__row--from">
              <span className="address__label">{t(TRANSLATION.FROM)}:</span>
              {getSafeAddressValue(fromAddressText) ?
                <>
                  <span className="address__value">{fromAddressText}</span>
                  {canToggleFromAddress ?
                    <img
                      className="address__toggle"
                      src={isFromAddressShort ? images.plusIcon : images.minusIcon}
                      onClick={fromAddressToggleHandler}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') fromAddressToggleHandler(event as any)
                      }}
                      alt={isFromAddressShort ? 'show full from address' : 'show short from address'}
                    /> :
                    <span />
                  }
                </> :
                <>
                  <div className="address__value"><Loader /></div>
                  <span />
                </>
              }
              <span
                onClick={() => {
                  openOrderPointOnMap('from')
                }}
                className="svg"
              >
                <Icon
                  src="locationPoint"
                  width="18"
                  height="19"
                  fill="#FF9900"
                />
              </span>
            </div>

            <div className="address__row address__row--to">
              <span className="address__label">{t(TRANSLATION.TO)}:</span>
              <span className="address__value">{toAddressText}</span>
              {canToggleToAddress ?
                <img
                  className="address__toggle"
                  src={isToAddressShort ? images.plusIcon : images.minusIcon}
                  onClick={toAddressToggleHandler}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') toAddressToggleHandler(event as any)
                  }}
                  alt={isToAddressShort ? 'show full destination address' : 'show short destination address'}
                /> :
                <span />
              }
              <span
                onClick={() => {
                  openOrderPointOnMap('to')
                }}
                className="svg"
              >
                <Icon
                  src="locationPoint"
                  width="18"
                  height="19"
                  fill="#00B100"
                />
              </span>
            </div>
          </div>
        </div>

        <div className="time" >
          <Icon src="clock" width="18" height="19" stroke="#FF2400" />
          <p>{t(TRANSLATION.START_TIME)}: <span>{order?.b_start_datetime?.format(
            order.b_options?.time_is_not_important ? dateFormatDate : dateShowFormat,
          )}</span></p>
        </div>

        <div className="payment" >
          <Icon src="moneyCircle" width="18" height="19" stroke="#FF2400" />
          <div>
            <p>{t(TRANSLATION.PAYMENT_WAY)}: {_value}{order?.b_options?.pricingModel?.calculationType === 'incomplete' ? ' + ?' : ''}</p>
            <p>{translateWithFallback(TRANSLATION.CALCULATION, currentLanguage, { ru: 'Расчёт', en: 'Calculation' })}: {getSafeCalculationText(order, currentLanguage)}</p>
            {typeof order?.profit === 'number' && Number.isFinite(order.profit) &&
              <p className='status-card__profit'>
                {formatCurrency(order.profit, { signDisplay: 'always' })}
                {formatRelativeProfit(order.profitPerEmptyKm) && (
                  <small className='status-card__profit-relative'>{formatRelativeProfit(order.profitPerEmptyKm)}</small>
                )}
              </p>
            }
          </div>
        </div>

        {isOfferMode &&
          <div className="driver-offer-info">
            <div className="driver-offer-info__title">{t(TRANSLATION.CLIENT_OFFER_ORDER_MODE)}</div>
            {offerPriceDifferenceText ?
              <div className="driver-offer-info__row">
                <span>{t(TRANSLATION.DRIVER_OFFER_PRICE_DIFFERENCE)}</span>
                <b>{offerPriceDifferenceText}</b>
              </div> :
              offerCustomerDesiredPrice !== undefined &&
              <div className="driver-offer-info__row">
                <span>{t(TRANSLATION.DRIVER_OFFER_DESIRED_PRICE)}</span>
                <b>{formatOfferPrice(offerCustomerDesiredPrice)}</b>
              </div>
            }
            {offerCount !== undefined &&
              <div className="driver-offer-info__count">
                {t(TRANSLATION.DRIVER_OFFER_OFFERS_COUNT)}: {offerCount}
              </div>
            }
            {currentDriverOffer && !currentOfferExpired && currentDriverOffer.status !== 'expired' &&
              <>
                <div className="driver-offer-info__row">
                  <span>{t(TRANSLATION.DRIVER_OFFER_OWN_PRICE)}</span>
                  <b>{formatOfferPrice(currentDriverOffer.price)}</b>
                </div>
                {currentDriverOffer.eta &&
                  <div className="driver-offer-info__row">
                    <span>{t(TRANSLATION.DRIVER_OFFER_OWN_ETA)}</span>
                    <b>{currentDriverOffer.eta}</b>
                  </div>
                }
              </>
            }
          </div>
        }

        <div className="client" >
          {isVotingMode && isVotingParticipant &&
            <div className="voting-participation">
              <div className="voting-participation__status">
                {showVotingCompetitors && votingInfo.remaining ?
                  `${t(TRANSLATION.DRIVER_VOTING_WAITING)}: ${votingInfo.remaining}` :
                  t(TRANSLATION.DRIVER_VOTING_GOING_ACTION)
                }
              </div>
              {showVotingCompetitors && <div>
                {t(TRANSLATION.DRIVER_VOTING_COMPETITORS)}: {votingInfo.competitorsCount}
              </div>}
              {showVotingCompetitors && !!votingInfo.nearestCompetitors.length &&
                <div className="voting-participation__nearest">
                  <div>{t(TRANSLATION.DRIVER_VOTING_NEAREST_COMPETITORS)}:</div>
                  <ul>
                    {votingInfo.nearestCompetitors.map((item: { name: string, distance: string }) =>
                      <li key={`${item.name}-${item.distance}`}>
                        <span>{item.name}</span>
                        <b>{item.distance}</b>
                      </li>,
                    )}
                  </ul>
                </div>
              }
            </div>
          }

          <div className="comments" data-active={false} onClick={e => e.currentTarget.dataset.active=e.currentTarget.dataset.active==='false'?'true':'false'} >
            {order?.u_id &&
              formatCommentWithEmoji(order.b_comments)?.map(({
                id, src, hint,
              }) =>
                <p key={id}><img src={src} alt="" /><span>{hint}</span></p>,
              )
            }
          </div>

          {order &&
            <span className='status-card__seats'>
              <Icon src="people" width="16" height="16" stroke="#FF2400" />
              <label>{getOrderCount(order)}</label>
            </span>
          }

          <form onSubmit={formHandleSubmit(handleSubmit)} >
            <div className="btns" >
              {getButtons()}
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}

export default connector(CardModal)

function formatShortAddress(address: IAddressDetails) {
  const { road, suburb, city, county, state, country } = address
  const parts = [road, suburb, city, county, state, country].filter(Boolean)
  return parts.join(', ')
}

function getCoordinatesAddress(_latitude?: number, _longitude?: number) {
  return undefined
}

function isGeneratedAddressPlaceholder(address?: string | null) {
  const normalized = String(address || '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized) return false

  return [
    /^точка\s+(подачи|назначения|нажатия)(\s+|$)/i,
    /рядом\s+с\s+вами/i,
    /с\s+вами$/i,
    /^destination\s+point/i,
    /^pickup\s+point/i,
    /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/,
  ].some(pattern => pattern.test(normalized))
}

function isSafeAddress(address?: string | null) {
  if (!address) return false

  const normalized = String(address).trim().toLowerCase()

  return Boolean(normalized) &&
    normalized !== 'undefined' &&
    normalized !== 'undefined, undefined' &&
    normalized !== 'null' &&
    normalized !== 'null, null' &&
    !normalized.includes('undefined') &&
    !normalized.includes('null') &&
    !isGeneratedAddressPlaceholder(normalized)
}

function getSafeAddressValue(...addresses: Array<string | undefined | null>): string | undefined {
  return addresses.find((address): address is string => isSafeAddress(address))?.trim()
}

function getSafeAddressText(language: { iso?: string } | undefined, ...addresses: Array<string | undefined | null>) {
  return getSafeAddressValue(...addresses)?.trim() ?? translateWithFallback(
    TRANSLATION.ADDRESS_NOT_SPECIFIED,
    language,
    { ru: 'Адрес не указан', en: 'Address not specified' },
  )
}

function normalizeComparableAddress(address?: string | null) {
  return String(address || '')
    .replace(/\s+/g, ' ')
    .replace(/[,.;:]+/g, ',')
    .trim()
    .toLowerCase()
}

function isLowValueAddressPart(part: string) {
  const normalized = part.trim().toLowerCase()
  if (!normalized)
    return true

  return [
    /^россия$/i,
    /^russia$/i,
    /федеральн(ый|ого)\s+округ/i,
    /городск(ой|ого)\s+округ/i,
    /муниципальн/i,
    /область$/i,
    /край$/i,
    /^\d{5,6}$/,
  ].some(pattern => pattern.test(normalized))
}

function getCompactAddress(address?: string | null) {
  const safe = getSafeAddressValue(address)
  if (!safe)
    return undefined

  const parts = safe
    .split(',')
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(part => part && !isLowValueAddressPart(part))

  if (!parts.length)
    return safe

  const importantRoad = parts.find(part => /(^|\s)(ул\.?|улица|проспект|пр-т|переулок|пер\.?|набережная|шоссе|дорога|проезд|площадь|бульвар|линия)(\s|$)/i.test(part))
  const firstPart = importantRoad || parts[0]
  const secondPart = parts.find(part =>
    part !== firstPart &&
    !/область|федеральн|городск(ой|ого)\s+округ|россия/i.test(part),
  )
  const compact = [firstPart, secondPart].filter(Boolean).join(', ')

  return compact && compact.length + 8 < safe.length ? compact : safe
}

function translateWithFallback(
  key: string,
  language: { iso?: string } | undefined,
  fallback: { ru: string, en: string, [key: string]: string },
) {
  const translated = t(key)

  const normalized = String(translated || '').trim().toLowerCase()

  if (translated && translated !== key && normalized !== 'error' && normalized !== 'err')
    return translated

  const iso = language?.iso?.toLowerCase() || 'ru'
  return fallback[iso] || fallback.en || fallback.ru
}

function isValidCalculationValue(value: unknown): boolean {
  if (value === undefined || value === null) return false

  const normalized = String(value).trim().toLowerCase()

  return Boolean(normalized) &&
    normalized !== 'err' &&
    !normalized.startsWith('err') &&
    normalized !== 'error' &&
    normalized !== 'nan' &&
    normalized !== 'infinity' &&
    !normalized.includes('error: err') &&
    !normalized.includes('referenceerror') &&
    !normalized.startsWith('error_') &&
    normalized !== 'undefined' &&
    normalized !== 'null'
}

function getSafePaymentAmount(...values: unknown[]) {
  return values.find(isValidCalculationValue)
}

function formatPaymentAmount(value: unknown) {
  if (!isValidCalculationValue(value))
    return '-'

  return `${value} ${CURRENCY.SIGN}`.trim()
}

function formatRelativeProfit(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return ''

  return `${formatCurrency(value, { signDisplay: 'always', currencyDisplay: 'none' }).trim()} ${CURRENCY.SIGN}/км холостого`
}

function getSafeCalculationText(order: IOrder | null, language: { iso?: string } | undefined) {
  const formula = calculateFinalPriceFormula(order)
  if (isValidCalculationValue(formula))
    return formula

  const price = order?.b_options?.pricingModel?.price ??
    order?.b_options?.customer_price ??
    order?.b_price_estimate ??
    order?.b_options?.submitPrice

  if (isValidCalculationValue(price))
    return typeof price === 'number' ? formatCurrency(price) : String(price)

  const payment = getPayment(order)
  if (isValidCalculationValue(payment.text))
    return payment.text
  if (isValidCalculationValue(payment.value))
    return formatPaymentAmount(payment.value)

  if (typeof order?.profit === 'number')
    return `${translateWithFallback(
      TRANSLATION.DRIVER_PROFIT,
      language,
      { ru: 'Выгода водителя', en: 'Driver profit' },
    )}: ${formatCurrency(order.profit, { signDisplay: 'always' })}`

  return translateWithFallback(
    TRANSLATION.CALCULATION_NO_DATA,
    language,
    { ru: 'нет данных для расчёта', en: 'No calculation data' },
  )
}
