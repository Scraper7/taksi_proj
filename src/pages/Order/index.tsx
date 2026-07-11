import React, { useEffect, useRef, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useParams, useNavigate } from 'react-router-dom'
import PageSection from '../../components/PageSection'
import Button from '../../components/Button'
import Input, { EInputTypes } from '../../components/Input'
import { addHiddenOrder, distanceBetweenEarthCoordinates } from '../../tools/utils'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import ClientInfo from '../../components/order/ClientInfo'
import OrderInfo from '../../components/order/orderInfo/index'
import LoadFrame from '../../components/LoadFrame'
import { IRootState } from '../../state'
import { useInterval, useReliableNow } from '../../tools/hooks'
import { EBookingDriverState, EBookingStates, EColorTypes, EStatuses } from '../../types/types'
import images from '../../constants/images'
import { useForm } from 'react-hook-form'
import cn from 'classnames'
import { getStableRemainingLifetimeSeconds } from '../../tools/reliableTime'
import { DRIVER_DOOR_NUMBER_PATTERN, getDriverDoorNumber, normalizeDriverDoorNumber } from '../../tools/driverDoorNumber'
import './styles.scss'
import { CURRENCY } from '../../siteConstants'
import ChatToggler from '../../components/Chat/Toggler'
import { orderSelectors, orderActionCreators } from '../../state/order'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import {
  geolocationActionCreators,
  geolocationSelectors,
} from '../../state/geolocation'
import { EMapModalTypes } from '../../state/modals/constants'
import { withLayout } from '../../HOCs/withLayout'
import { isAnyBrowserEmulatorOrder } from '../../tools/emulatorMode'
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
  IStoredDriverOffer,
  removeStoredDriverOffer,
  saveStoredDriverOffer,
  subscribeDriverOfferClientResponse,
  updateDriverOfferClientResponseStatus,
  updateStoredDriverOfferStatus,
} from '../../tools/driverOffer'

const mapStateToProps = (state: IRootState) => ({
  order: orderSelectors.order(state),
  client: orderSelectors.client(state),
  start: orderSelectors.start(state),
  destination: orderSelectors.destination(state),
  status: orderSelectors.status(state),
  message: orderSelectors.message(state),
  user: userSelectors.user(state),
  geoposition: geolocationSelectors.geoposition(state),
})

const mapDispatchToProps = {
  getOrder: orderActionCreators.getOrder,
  setOrder: orderActionCreators.setOrder,
  setCancelDriverOrderModal: modalsActionCreators.setDriverCancelModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setAlarmModal: modalsActionCreators.setAlarmModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  setMapModal: modalsActionCreators.setMapModal,
  setMessageModal: modalsActionCreators.setMessageModal,
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

const DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY = 'driverStartedVotingOrderIds'

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

function getOfferCustomerDesiredPrice(order: any) {
  return getNumericRouteValue(
    order?.b_options?.customer_price,
    order?.customer_price,
    order?.b_customer_price,
  )
}

function getOfferCalculatedPrice(order: any) {
  return getNumericRouteValue(
    order?.b_options?.pricingModel?.price,
    order?.b_options?.submitPrice,
    order?.b_price_estimate,
  )
}

function getOfferDesiredPrice(order: any, paymentAmount?: unknown) {
  return getNumericRouteValue(
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

function getOfferCommentText(order: any) {
  return [
    order?.b_custom_comment,
    order?.b_options?.customer_comment,
    order?.b_options?.from_way,
    order?.b_options?.to_way,
  ].filter(Boolean).join('; ')
}

function formatOfferDistance(order: any) {
  const distance = getNumericRouteValue(
    order?.b_distance_estimate,
    order?.b_options?.pricingModel?.options?.distance,
    order?.b_options?.pricingModel?.options?.routeDistance,
  )
  if (!distance)
    return ''

  const kilometers = distance > 100 ? distance / 1000 : distance
  return `~${Math.max(1, Math.round(kilometers))} км`
}

function formatOfferPrice(value: number | string | undefined) {
  if (value === undefined || value === null || value === '')
    return ''
  return `${value} ${CURRENCY.SIGN}`
}

function getAddressString(value?: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isGeneratedAddressPlaceholder(value?: unknown) {
  const address = getAddressString(value).toLowerCase()
  if (!address)
    return false

  return [
    /^точка\s+(подачи|назначения|нажатия)(\s+|$)/i,
    /рядом\s+с\s+(вами|нами)/i,
    /с\s+(вами|нами)$/i,
    /^destination\s+point/i,
    /^pickup\s+point/i,
    /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/,
  ].some(pattern => pattern.test(address))
}

function getSafeOrderAddress(...values: unknown[]) {
  for (const value of values) {
    const address = getAddressString(value)
    const normalized = address.toLowerCase()
    if (
      address &&
      normalized !== 'undefined' &&
      normalized !== 'undefined, undefined' &&
      normalized !== 'null' &&
      normalized !== 'null, null' &&
      !normalized.includes('undefined') &&
      !normalized.includes('null') &&
      !isGeneratedAddressPlaceholder(address)
    )
      return address
  }
  return ''
}

function getOrderStartAddressText(order: any, start: any) {
  return getSafeOrderAddress(
    start?.shortAddress,
    start?.address,
    order?.b_options?.fromShortAddress,
    order?.b_options?.fromAddress,
    order?.b_options?.from,
    order?.b_start_address,
  ) || t(TRANSLATION.ADDRESS_NOT_SPECIFIED)
}

function getOrderDestinationAddressText(order: any, destination: any) {
  return getSafeOrderAddress(
    destination?.shortAddress,
    destination?.address,
    order?.b_options?.toShortAddress,
    order?.b_options?.destinationShortAddress,
    order?.b_options?.toAddress,
    order?.b_options?.destinationAddress,
    order?.b_options?.destination,
    order?.b_options?.to,
    order?.b_destination_address,
  ) || t(TRANSLATION.ADDRESS_NOT_SPECIFIED)
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

function saveStartedVotingOrderId(orderId: string) {
  try {
    const value = localStorage.getItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY)
    const ids: string[] = value ? JSON.parse(value) : []
    const nextIds = ids.includes(orderId) ? ids : [...ids, orderId]
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify(nextIds))
  } catch {
    localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify([orderId]))
  }
}

const Order: React.FC<IProps> = ({
  order,
  client,
  start,
  destination,
  status,
  message,
  user,
  geoposition,
  getOrder,
  setOrder,
  setMapModal,
  setRatingModal,
  setCancelDriverOrderModal,
  setMessageModal,
  setAlarmModal,
  watchGeolocation,
  activateGeolocationSending,
}) => {
  const [isFromAddressShort, setIsFromAddressShort] = useState(true)
  const [isToAddressShort, setIsToAddressShort] = useState(true)
  const [votingParticipationIds, setVotingParticipationIds] = useState(() =>
    getStoredVotingParticipationIds(),
  )
  const [votingArrivedIds, setVotingArrivedIds] = useState(() =>
    getStoredVotingArrivedIds(),
  )
  const now = useReliableNow(Boolean(order), 1000)
  const [votingCloseHandled, setVotingCloseHandled] = useState(false)
  const [offerFormOpen, setOfferFormOpen] = useState(false)
  const [offerEtaDropdownOpen, setOfferEtaDropdownOpen] = useState(false)
  const [localDriverOffer, setLocalDriverOffer] = useState<IStoredDriverOffer | null>(null)
  const [localOfferClientResponse, setLocalOfferClientResponse] = useState<any>(() => null)
  const [isOfferCommentTemplateSaved, setIsOfferCommentTemplateSaved] = useState(() => Boolean(getStoredDriverOfferCommentTemplate()))
  const [handledOfferEvent, setHandledOfferEvent] = useState<string | null>(null)
  const [hideConfirmOpen, setHideConfirmOpen] = useState(false)
  const votingSelectedPopupShown = useRef(false)
  const driverClosedOrderPopupShown = useRef(false)
  const lastDriverRelatedOrder = useRef<typeof order>(null)

  const id = useParams().id as string
  const navigate = useNavigate()

  const driver = order?.drivers?.find(item => order.b_voting ?
    isVotingDriverParticipating(item) :
    item.c_state > EBookingDriverState.Canceled)
  const userAsDriver = order?.drivers?.find(item => item.u_id === user?.u_id)
  const isVotingParticipant = Boolean(
    order?.b_voting &&
    (
      votingParticipationIds.includes(id) ||
      isVotingDriverParticipating(userAsDriver)
    ),
  )
  const isVotingArrived = Boolean(
    order?.b_voting &&
    (userAsDriver?.c_state === EBookingDriverState.Arrived || votingArrivedIds.includes(id)),
  )
  const votingInfo = getVotingInfo(order, user?.u_id, now)
  const storedRouteDurationMinutes = getStoredRouteDurationMinutes(order)
  const [calculatedRouteDurationMinutes, setCalculatedRouteDurationMinutes] = useState<number | undefined>(undefined)
  const [isRouteDurationLoading, setIsRouteDurationLoading] = useState(false)
  const routeDurationText = formatApproximateRouteDuration(
    calculatedRouteDurationMinutes || storedRouteDurationMinutes || getFallbackRouteDurationMinutes(order),
    isRouteDurationLoading,
  )
  const showVotingCompetitors = userAsDriver?.c_state === EBookingDriverState.Considering
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
  const offerCount = getOfferCount(order)
  const offerCommentText = getOfferCommentText(order)
  const offerDesiredPrice = getOfferDesiredPrice(order)
  const offerCustomerDesiredPrice = getOfferCustomerDesiredPrice(order)
  const offerCalculatedPrice = getOfferCalculatedPrice(order)
  const offerPriceDifferenceText = formatOfferPriceDifference(offerCustomerDesiredPrice, offerCalculatedPrice)
  const startAddressText = getOrderStartAddressText(order, start)
  const destinationAddressText = getOrderDestinationAddressText(order, destination)

  const { register, formState: { errors }, handleSubmit: formHandleSubmit, getValues, setValue, watch } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onSubmit',
  })
  const offerEtaValue = watch('offerEta') || t(TRANSLATION.DRIVER_OFFER_ETA_15)

  useEffect(() => {
    if (!user?.u_id)
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
  }, [id, user?.u_id, userAsDriver?.c_id, getValues, setValue])

  useEffect(() => {
    setHideConfirmOpen(false)
  }, [id])

  useEffect(() => {
    if (!order?.b_voting && (!shouldUseOfferFlow || !offerFormOpen))
      return

    if (!getValues('offerEta'))
      setValue('offerEta', t(TRANSLATION.DRIVER_OFFER_ETA_15), { shouldValidate: false })
  }, [order?.b_voting, shouldUseOfferFlow, offerFormOpen, getValues, setValue])

  useEffect(() => {
    if (!offerFormOpen)
      return

    const storedComment = getStoredDriverOfferCommentTemplate()
    setIsOfferCommentTemplateSaved(Boolean(storedComment))
    if (storedComment && !getValues('offerComment'))
      setValue('offerComment', storedComment, { shouldValidate: false })
  }, [offerFormOpen, getValues, setValue])

  const orderMapFromPoint = start?.latitude && start.longitude ? start : (
    order?.b_start_latitude && order.b_start_longitude ? {
      address: order.b_start_address,
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
    } : null
  )
  const orderMapToPoint = destination?.latitude && destination.longitude ? destination : (
    order?.b_destination_latitude && order.b_destination_longitude ? {
      address: order.b_destination_address,
      latitude: order.b_destination_latitude,
      longitude: order.b_destination_longitude,
    } : null
  )
  useEffect(() => {
    const routePoints = getOrderRoutePoints(order)
    if (!routePoints) {
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
    order?.b_id,
    order?.b_start_latitude,
    order?.b_start_longitude,
    order?.b_destination_latitude,
    order?.b_destination_longitude,
  ])

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

  useEffect(() => {
    getOrder(id)
    return () => {
      setOrder(null)
    }
  }, [])

  useInterval(() => {
    getOrder(id)
  }, 3000)

  useEffect(() => {
    if (!isVotingParticipant)
      return

    const unwatch = watchGeolocation({ interval: 3000 })
    const deactivateSending = activateGeolocationSending()

    return () => {
      deactivateSending()
      unwatch()
    }
  }, [isVotingParticipant, watchGeolocation, activateGeolocationSending])

  useEffect(() => {
    if (order && userAsDriver)
      lastDriverRelatedOrder.current = order
  }, [order, userAsDriver])

  useEffect(() => {
    if (order || !votingParticipationIds.includes(id))
      return

    const previousOrder = lastDriverRelatedOrder.current
    const message = previousOrder && isVotingOrderExpired(previousOrder) ?
      t(TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT) :
      t(TRANSLATION.DRIVER_ORDER_CANCELLED_BY_CLIENT)

    setVotingParticipationIds(removeVotingParticipationId(id))
    setVotingArrivedIds(removeVotingArrivedId(id))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message,
    })
    navigate('/driver-order')
  }, [order, id, votingParticipationIds])

  useEffect(() => {
    if (driverClosedOrderPopupShown.current)
      return

    const previousOrder = lastDriverRelatedOrder.current
    const currentDriverRelated = Boolean(order && userAsDriver)
    const currentClientCancelled = Boolean(
      currentDriverRelated &&
      !order?.b_voting &&
      order?.b_state === EBookingStates.Canceled,
    )
    const missingClientCancelled = Boolean(
      !order &&
      previousOrder?.b_id === id &&
      !previousOrder.b_voting,
    )

    if (!currentClientCancelled && !missingClientCancelled)
      return

    driverClosedOrderPopupShown.current = true
    removeStoredDriverOffer(id, user?.u_id)
    setLocalDriverOffer(null)
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: t(TRANSLATION.DRIVER_ORDER_CANCELLED_BY_CLIENT),
    })
    navigate('/driver-order')
  }, [order, userAsDriver, id, user?.u_id, navigate])

  useEffect(() => {
    if (!order?.b_voting || !isVotingParticipant || votingCloseHandled)
      return

    const closeReason = getVotingCloseMessage(order, user?.u_id)
    if (!closeReason)
      return

    setVotingCloseHandled(true)
    setVotingParticipationIds(removeVotingParticipationId(id))
    setVotingArrivedIds(removeVotingArrivedId(id))
    setMessageModal({
      isOpen: true,
      status: EStatuses.Warning,
      message: closeReason,
    })
    navigate('/driver-order')
  }, [order, isVotingParticipant, votingCloseHandled, user?.u_id])

  useEffect(() => {
    if (
      !order?.b_voting ||
      !userAsDriver ||
      votingSelectedPopupShown.current ||
      userAsDriver.c_state !== EBookingDriverState.Performer
    )
      return

    votingSelectedPopupShown.current = true
    setMessageModal({
      isOpen: true,
      status: EStatuses.Success,
      message: 'Клиент выбрал вас. Подъезжайте к клиенту, после посадки клиент назовёт код посадки.',
    })
  }, [order?.b_voting, userAsDriver?.c_state])


  useEffect(() => {
    setLocalDriverOffer(getBackendDriverOffer(order, user?.u_id) ?? getStoredDriverOffer(id, user?.u_id))
    setLocalOfferClientResponse(getDriverOfferClientResponse(id, user?.u_id))
    setHandledOfferEvent(null)
  }, [id, order?.b_id, user?.u_id])

  useEffect(() => {
    if (!shouldSimulateOfferClientResponse || !currentDriverOffer || currentOfferExpired) {
      setLocalOfferClientResponse(null)
      return
    }

    const syncOfferClientResponse = () => {
      const nextResponse = ensureDriverOfferClientResponse(
        id,
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
    shouldSimulateOfferClientResponse,
    currentDriverOffer?.createdAt,
    currentDriverOffer?.status,
    currentOfferExpired,
    id,
    user?.u_id,
    now,
  ])

  useEffect(() => {
    if (!shouldUseOfferFlow || !currentDriverOffer)
      return

    if (currentOfferExpired && currentDriverOffer.status === 'sent') {
      const nextOffer = updateStoredDriverOfferStatus(id, user?.u_id, 'expired') ?? {
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
  }, [shouldUseOfferFlow, currentDriverOffer, currentOfferExpired, handledOfferEvent, id, user?.u_id])

  useEffect(() => {
    if (!shouldUseOfferFlow)
      return

    const offerEvent = getOfferEvent(order, user?.u_id) || currentOfferStatus
    if (!offerEvent || handledOfferEvent === offerEvent)
      return

    if (offerEvent === 'rejected') {
      setHandledOfferEvent(offerEvent)
      removeStoredDriverOffer(id, user?.u_id)
      setLocalDriverOffer(null)
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: t(TRANSLATION.DRIVER_OFFER_REJECTED),
      })
      navigate('/driver-order')
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
      navigate('/driver-order?tab=map')
      return
    }

    if (offerEvent === 'expired') {
      setHandledOfferEvent(offerEvent)
      const nextOffer = updateStoredDriverOfferStatus(id, user?.u_id, 'expired') ?? (
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
  }, [shouldUseOfferFlow, order, user?.u_id, currentOfferStatus, currentDriverOffer, handledOfferEvent, id, navigate])

  const handleSubmit = () => {
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

      API.sendOrderOffer(id, offerPayload)
        .then(() => {
          const storedOffer = saveStoredDriverOffer(id, user?.u_id, offerPayload, 'sent')
          setLocalDriverOffer(storedOffer)
          clearDriverOfferClientResponse(id, user?.u_id)
          setLocalOfferClientResponse(null)
          setOfferFormOpen(false)
          setHandledOfferEvent(null)
          getOrder(id)
          // Не открываем лишний success-попап с OK: экран сразу меняет состояние
          // на "Предложение отправлено" и показывает кнопку отмены/скрытия.
        })
        .catch(error => {
          console.error(error)
          setMessageModal({
            isOpen: true,
            message: error.toString() || t(TRANSLATION.ERROR),
            status: EStatuses.Fail,
          })
        })
      return
    }

    const isCandidate = ['96', '95'].some(item => order?.b_comments?.includes(item))

    if (order?.b_voting) {
      if (isVotingDriverParticipating(userAsDriver)) {
        const nextIds = saveVotingParticipationId(id)
        setVotingParticipationIds(nextIds)
        navigate('/driver-order?tab=map')
        return
      }

      API.participateVotingOrder(id, getValues().performers_price, getValues().offerEta || t(TRANSLATION.DRIVER_OFFER_ETA_15))
        .then(() => {
          const nextIds = saveVotingParticipationId(id)
          setVotingParticipationIds(nextIds)
          getOrder(id)
          setMessageModal({
            isOpen: true,
            status: EStatuses.Success,
            message: t(TRANSLATION.DRIVER_VOTING_READY_SENT),
          })
          navigate('/driver-order?tab=map')
        })
        .catch(error => {
          if (isAlreadyVotingParticipantError(error)) {
            const nextIds = saveVotingParticipationId(id)
            setVotingParticipationIds(nextIds)
            getOrder(id)
            setMessageModal({
              isOpen: true,
              status: EStatuses.Success,
              message: t(TRANSLATION.DRIVER_VOTING_READY_SENT),
            })
            navigate('/driver-order?tab=map')
            return
          }
          console.error(error)
          setMessageModal({
            isOpen: true,
            message: error.toString() || t(TRANSLATION.ERROR),
            status: EStatuses.Fail,
          })
        })
      return
    }

    API.takeOrder(id, { ...getValues() }, isCandidate)
      .then(() => {
        getOrder(id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: isCandidate ? t(TRANSLATION.YOUR_OFFER_SENT) : t(TRANSLATION.YOUR_ORDER_DESCRIPTION),
        })
        navigate('/driver-order?tab=map')
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: error.toString() || t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
  }

  const requestHideOrder = () => {
    setHideConfirmOpen(true)
  }

  const cancelHideOrder = () => {
    setHideConfirmOpen(false)
  }

  const confirmHideOrder = () => {
    addHiddenOrder(id, user?.u_id)
    navigate('/driver-order')
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const confirmCancelOfferAndHide = () => {
    API.cancelVotingParticipation(id)
      .then(() => {
        removeStoredDriverOffer(id, user?.u_id)
        clearDriverOfferClientResponse(id, user?.u_id)
        setLocalOfferClientResponse(null)
        setLocalDriverOffer(null)
        addHiddenOrder(id, user?.u_id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t('driver_offer_cancelled_hidden'),
        })
        navigate('/driver-order')
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: error?.toString?.() || t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
  }

  const confirmClientSelectedOffer = () => {
    const values = getValues()
    API.takeOrder(id, {
      votingNumber: values.votingNumber,
      performers_price: currentDriverOffer?.price ?? values.performers_price,
    }, false)
      .then(() => {
        const nextResponse = updateDriverOfferClientResponseStatus(id, user?.u_id, 'driver_confirmed')
        setLocalOfferClientResponse(nextResponse)
        getOrder(id)
        navigate('/driver-order?tab=map')
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: error?.toString?.() || t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
  }

  const declineClientSelectedOffer = () => {
    const nextResponse = updateDriverOfferClientResponseStatus(id, user?.u_id, 'driver_declined')
    setLocalOfferClientResponse(nextResponse)
    removeStoredDriverOffer(id, user?.u_id)
    setLocalDriverOffer(null)
    addHiddenOrder(id, user?.u_id)
    navigate('/driver-order')
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const hideOtherClientSelectedOffer = () => {
    addHiddenOrder(id, user?.u_id)
    navigate('/driver-order')
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  const onArrivedClick = () =>
    API.setOrderState(id, EBookingDriverState.Arrived)
      .then(() => getOrder(id))
      .catch(error => {
        console.error(error)
        setMessageModal({ isOpen: true, message: t(TRANSLATION.ERROR), status: EStatuses.Fail })
      })

  const onStartedClick = () =>
    API.setOrderState(id, EBookingDriverState.Started)
      .then(() => {
        getOrder(id)
        navigate('/driver-order?tab=map')
      })

  const onCompleteOrderClick = () => {
    if (!driver?.c_started) {
      setMessageModal({ 
        isOpen: true, 
        status: EStatuses.Fail, 
        message: t(TRANSLATION.ERROR)
      })
      return
    }

    
    API.setOrderState(id, EBookingDriverState.Finished)
      .then(() => {
        getOrder(id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.TRIP, { })
        })
        setRatingModal({ isOpen: true })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({ 
          isOpen: true, 
          status: EStatuses.Fail, 
          message: t(TRANSLATION.ERROR) 
        })
      })
  }

  const onAlarmClick = () =>
    setAlarmModal({ isOpen: true })

  const onRateOrderClick = () =>
    setRatingModal({ isOpen: true })

  const onExit = () =>
    navigate('/driver-order')

  const onVotingCancelDeparture = () => {
    API.cancelVotingParticipation(id)
      .then(() => {
        const nextIds = removeVotingParticipationId(id)
        const nextArrivedIds = removeVotingArrivedId(id)
        setVotingParticipationIds(nextIds)
        setVotingArrivedIds(nextArrivedIds)
        getOrder(id)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.DRIVER_VOTING_CANCELLED),
        })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
  }

  const onVotingArrived = () => {
    Promise.resolve()
      .then(() => {
        if (
          userAsDriver?.c_state === EBookingDriverState.Performer ||
          userAsDriver?.c_state === EBookingDriverState.Started
        )
          return API.setOrderState(id, EBookingDriverState.Arrived)
      })
      .catch(error => {
        if (!isNotAppointedPerformerError(error))
          throw error
      })
      .then(() => API.arrivedVotingOrder(id))
      .catch(error => {
        if (!isNotAppointedPerformerError(error))
          throw error
      })
      .then(() => {
        const nextIds = saveVotingArrivedId(id)
        setVotingArrivedIds(nextIds)
        getOrder(id)
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
  }

  const onVotingNavigation = () => {
    setMapModal({
      isOpen: true,
      type: EMapModalTypes.VotingNavigation,
      defaultCenter: order?.b_start_latitude &&
        order?.b_start_longitude ?
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

  const onVotingConfirmCode = formHandleSubmit(({ votingNumber }) => {
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

    Promise.resolve()
      .then(() => API.confirmVotingCode(id, enteredCode))
      .then(() => {
        if (userAsDriver?.c_state === EBookingDriverState.Started)
          return null

        return API.setOrderState(id, EBookingDriverState.Started, enteredCode)
      })
      .then(() => {
        saveStartedVotingOrderId(id)
        setVotingParticipationIds(removeVotingParticipationId(id))
        setVotingArrivedIds(removeVotingArrivedId(id))
        getOrder(id)
        navigate('/driver-order?tab=map')
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: error?.message || error.toString() || t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
  })


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
    const renderHideOrderButton = () => hideConfirmOpen ? (
      <div className="order__hide-confirm">
        <div className="order__hide-confirm-title">{t(TRANSLATION.HIDE_ORDER)}?</div>
        <Button
          text={t(TRANSLATION.YES)}
          className="order_take-order-btn"
          onClick={confirmHideOrder}
          label={message}
          status={status}
        />
        <Button
          text={t(TRANSLATION.NO)}
          className="order_hide-order-btn"
          onClick={cancelHideOrder}
          label={message}
          status={status}
        />
      </div>
    ) : (
      <Button
        text={t(TRANSLATION.HIDE_ORDER)}
        className="order_hide-order-btn"
        onClick={requestHideOrder}
        label={message}
        status={status}
      />
    )

    const renderCancelOfferAndHideButton = () => hideConfirmOpen ? (
      <div className="order__hide-confirm">
        <div className="order__hide-confirm-title">{t('driver_offer_cancel_and_hide_confirm')}</div>
        <Button
          text={t(TRANSLATION.YES)}
          className="order_take-order-btn"
          onClick={confirmCancelOfferAndHide}
          label={message}
          status={status}
        />
        <Button
          text={t(TRANSLATION.NO)}
          className="order_hide-order-btn"
          onClick={cancelHideOrder}
          label={message}
          status={status}
        />
      </div>
    ) : (
      <Button
        text={t('driver_offer_cancel_and_hide')}
        className="order_hide-order-btn"
        onClick={requestHideOrder}
        label={message}
        status={status}
      />
    )

    if (!order) return (
      <Button
        text={t(TRANSLATION.EXIT_NOT_AVIABLE)}
        className="order_take-order-btn"
        onClick={onExit}
        label={message}
        status={status}
      />
    )

    if (driver?.c_state === EBookingDriverState.Finished && driver?.c_rating) return (
      <Button
        text={t(TRANSLATION.EXIT)}
        className="order_take-order-btn"
        onClick={onExit}
        label={message}
        status={status}
      />)
    if (order.b_state === EBookingStates.Canceled) return (
      <Button
        text={t(TRANSLATION.EXIT_USER_CANCELLED)}
        className="order_take-order-btn"
        onClick={onExit}
        label={message}
        status={status}
      />
    )

    if (shouldUseOfferFlow) {
      if (currentDriverOffer && !currentOfferExpired && currentDriverOffer.status !== 'expired') {
        const clientResponseStatus = offerClientResponse?.status
        return <>
          {shouldSimulateOfferClientResponse && clientResponseStatus === 'client_selected_this_driver' && <>
            <Button
              text={t('driver_offer_confirm_selection')}
              className="order_take-order-btn"
              onClick={confirmClientSelectedOffer}
              label={message}
              status={status}
            />
            <Button
              text={t('driver_offer_decline_and_hide')}
              className="order_hide-order-btn"
              onClick={declineClientSelectedOffer}
              label={message}
              status={status}
            />
          </>}
          {shouldSimulateOfferClientResponse && clientResponseStatus === 'client_selected_other_driver' && (
            <Button
              text={t(TRANSLATION.HIDE_ORDER)}
              className="order_hide-order-btn"
              onClick={hideOtherClientSelectedOffer}
              label={message}
              status={status}
            />
          )}
          {shouldSimulateOfferClientResponse && (!clientResponseStatus || clientResponseStatus === 'waiting') && (
            <Button
              text={t('driver_offer_waiting_client_response')}
              className="order_take-order-btn"
              onClick={() => null}
              label={message}
              status={status}
              disabled
            />
          )}
          {!shouldSimulateOfferClientResponse && renderCancelOfferAndHideButton()}
        </>
      }

      if (offerFormOpen) return <>
        <div className="driver-offer-form-title order__driver-offer-form-title">{t(TRANSLATION.DRIVER_OFFER_FORM_TITLE)}</div>
        <Input
          inputProps={{
            ...register('offerPrice', { required: t(TRANSLATION.REQUIRED_FIELD), min: 0, valueAsNumber: true }),
            type: 'number',
            min: 0,
            defaultValue: offerDesiredPrice,
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
          text={t(TRANSLATION.DRIVER_OFFER_SEND)}
          type="submit"
          className="order_take-order-btn"
          label={message}
          status={status}
        />
        {renderHideOrderButton()}
      </>

      return <>
        <Button
          text={t(TRANSLATION.DRIVER_OFFER_SEND)}
          className="order_take-order-btn"
          onClick={() => setOfferFormOpen(true)}
          label={message}
          status={status}
        />
        {renderHideOrderButton()}
      </>
    }
    if (order?.b_voting && isVotingParticipant) return <>
      <div className="voting-participation order__voting-participation">
        <div className="voting-participation__status">
          {showVotingCompetitors && votingInfo.remaining ?
            `${t(TRANSLATION.DRIVER_VOTING_WAITING)}: ${votingInfo.remaining}` :
            t(TRANSLATION.DRIVER_VOTING_GOING_ACTION)
          }
        </div>
        {showVotingCompetitors && <div>{t(TRANSLATION.DRIVER_VOTING_COMPETITORS)}: {votingInfo.competitorsCount}</div>}
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
      <Button
        text={t(TRANSLATION.DRIVER_VOTING_NAVIGATION)}
        className="order_take-order-btn"
        onClick={onVotingNavigation}
        disabled={!canOpenVotingNavigation(order, geoposition)}
        label={message}
        status={status}
      />
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
      {isVotingArrived && (
        <Button
          text={t(TRANSLATION.DRIVER_VOTING_CONFIRM_CODE)}
          className="order_take-order-btn"
          onClick={onVotingConfirmCode}
          label={message}
          status={status}
        />
      )}
      {!isVotingArrived && (
        <Button
          text={t(TRANSLATION.DRIVER_VOTING_ARRIVED)}
          className="order_take-order-btn"
          onClick={onVotingArrived}
          disabled={!canMarkVotingArrived(order, geoposition, user?.u_id)}
          label={message}
          status={status}
        />
      )}
      <Button
        text={t(TRANSLATION.DRIVER_VOTING_CANCEL_DEPARTURE)}
        className="order_hide-order-btn"
        onClick={onVotingCancelDeparture}
        label={message}
        status={status}
      />
    </>

    if (userAsDriver?.c_state === EBookingDriverState.Considering) return renderHideOrderButton()

    if (!driver || order?.b_voting) return <>
      {['96', '95'].some(item => order?.b_comments?.includes(item)) && (
        <Input
          inputProps={{
            ...register('performers_price', { required: t(TRANSLATION.REQUIRED_FIELD), min: 0, valueAsNumber: true }),
            type: 'number',
            min: 0,
          }}
          error={errors?.performers_price?.message}
          label={t(TRANSLATION.PRICE_PERFORMER)}
          oneline
        />
      )}
      {order.drivers?.find(i => i.u_id === user?.u_id)?.c_state !== EBookingDriverState.Considering && (<>
        {order?.b_voting && renderOfferEtaPicker('order__driver-offer-choice--voting')}
        <Button
          text={t(
            order?.b_voting ?
              TRANSLATION.DRIVER_VOTING_GOING_ACTION :
              ['96', '95'].some(item => order?.b_comments?.includes(item)) ?
                TRANSLATION.MAKE_OFFER :
                TRANSLATION.TAKE_ORDER,
          )}
          type="submit"
          className="order_take-order-btn"
          label={message}
          status={status}
        />
        {renderHideOrderButton()}
      </>)}
    </>
    if (driver?.c_state === EBookingDriverState.Performer) return (
      <Button
        text={t(TRANSLATION.ARRIVED)}
        className="order_take-order-btn"
        onClick={onArrivedClick}
        label={message}
        status={status}
      />
    )
    if (driver?.c_state === EBookingDriverState.Arrived) return <>
      <Button
        text={t(TRANSLATION.WENT)}
        className="order_take-order-btn"
        onClick={onStartedClick}
        label={message}
        status={status}
      />
      <Button
        text={t(TRANSLATION.CANCEL_ORDER)}
        className="order_hide-order-btn"
        onClick={() => setCancelDriverOrderModal(true)}
        label={message}
        status={status}
      />
    </>
    if (driver?.c_state === EBookingDriverState.Started) return <>
      <Button
        text={t(TRANSLATION.CLOSE_DRIVE)}
        className="order_take-order-btn"
        onClick={onCompleteOrderClick}
        label={message}
        status={status}
      />
      <Button
        text={`${t(TRANSLATION.ALARM)}`}
        className="order_alarm-btn"
        onClick={onAlarmClick}
        colorType={EColorTypes.Accent}
        label={message}
        status={status}
      />
    </>
    if (driver?.c_state === EBookingDriverState.Finished) return <>
      <Button
        text={t(TRANSLATION.DRIVER_MARK_TIPS)}
        className="order_take-order-btn"
        onClick={onRateOrderClick}
        label={message}
        status={status}
      />
    </>
  }

  return status === EStatuses.Loading && !order ?
    <LoadFrame/> :
    <PageSection className="order" scrollable>
      {!!order ?
        (
          <form className={cn({ 'order__form--offer': isOfferMode })} onSubmit={formHandleSubmit(handleSubmit)}>
            <ClientInfo order={order} client={client} user={user}/>
            <div className="order__from-to colored">
              <div className='estimate-time'>
                {t(TRANSLATION.ESTIMATE_TIME)}:&nbsp;
                {routeDurationText}
              </div>
              <h3>{order.b_options?.object ? `${t(TRANSLATION.PICK_UP_PACKAGE)}:` : t(TRANSLATION.ADDRESSES)}</h3>
              <div className='from'>
                <label>
                  {isFromAddressShort && start?.shortAddress && !isGeneratedAddressPlaceholder(start.shortAddress) ? start.shortAddress : startAddressText}
                </label>
                <div className="from__buttons">
                  {start?.shortAddress && (
                    <img
                      src={isFromAddressShort ? images.minusIcon : images.plusIcon}
                      onClick={(e) => setIsFromAddressShort(prev => !prev)}
                      alt='change address mode'
                    />
                  )}
                  <img
                    src={images.markerYellow}
                    alt="marker"
                    className='address-marker'
                    onClick={() => {
                      openOrderPointOnMap('from')
                    }}
                  />
                </div>
              </div>
              <div className="order-fields">
                <label>
                  {
                    !!order.b_options?.from_tel &&(
                      <a
                        className="phone-link"
                        href={`tel:${order.b_options.from_tel}`}
                      >{order.b_options.from_tel}</a>
                    )
                  }
                </label>
              </div>
              <div className='from-delivery'>
                {
                  order.b_options?.from_porch &&
                      (
                        <div className='group'>
                          <span>{t(TRANSLATION.PORCH)} <b>{order.b_options.from_porch}</b></span>
                          <span>{t(TRANSLATION.FLOOR)} <b>{order.b_options.from_floor}</b></span>
                          <span>{t(TRANSLATION.ROOM)} <b>{order.b_options.from_room}</b></span>
                        </div>
                      )
                }
                {
                  order.b_options?.from_way && (
                    <span className='way'>
                      <b>{t(order.b_comments?.includes('96') ? TRANSLATION.COMMENT : TRANSLATION.WAY)}:</b>&nbsp;
                      {order.b_options.from_way || t(TRANSLATION.NOT_SPECIFIED, { toLower: true })}
                    </span>
                  )
                }
                {
                  !order.b_comments?.includes('96') && order.b_options?.from_day && (
                    <span
                      className='time'
                    >
                      <b>{t(TRANSLATION.TAKE)}:</b>&nbsp;
                      {order.b_options.from_day}, {t(TRANSLATION.TIME_FROM, { toLower: true })}&nbsp;
                      {order.b_options.from_time_from} {t(TRANSLATION.TIME_TILL, { toLower: true })}&nbsp;
                      {order.b_options.from_time_to || t(TRANSLATION.NO_MATTER, { toLower: true })}
                    </span>
                  )
                }
                {
                  order.b_options?.from_tel && (
                    <span className='way'><b>{t(TRANSLATION.PHONE_TO_CALL)}:</b> {order.b_options.from_tel}
                      <img
                        src={images.phone}
                        alt={t(TRANSLATION.PHONE)}
                      />
                    </span>
                  )
                }
                {/* <div className="order__separator"/> */}
              </div>
              {order.b_options?.object &&
                <h3>{`${t(TRANSLATION.DELIVER_PACKAGE)}:`}</h3>}
              {(destinationAddressText || destination?.latitude || destination?.longitude || order?.b_destination_latitude || order?.b_destination_longitude) && (
                <div className='to'>
                  <label>
                    {isToAddressShort && destination?.shortAddress && !isGeneratedAddressPlaceholder(destination.shortAddress) ? destination.shortAddress : destinationAddressText}
                  </label>
                  <div className="to__buttons">
                    {destination?.shortAddress && (
                      <img
                        src={isToAddressShort ? images.minusIcon : images.plusIcon}
                        onClick={() => setIsToAddressShort(prev => !prev)}
                        alt='change address mode'
                      />
                    )}
                    <img
                      src={images.markerGreen}
                      alt="marker"
                      className='address-marker'
                      onClick={
                        () => {
                          openOrderPointOnMap('to')
                        }
                      }
                    />
                  </div>
                </div>
              )}
              <div className='to-delivery'>
                {
                  order.b_options?.to_porch &&
                    (
                      <div className='group'>
                        <span>{t(TRANSLATION.PORCH)} <b>{order.b_options.to_porch}</b></span>
                        <span>{t(TRANSLATION.FLOOR)} <b>{order.b_options.to_floor}</b></span>
                        <span>{t(TRANSLATION.ROOM)} <b>{order.b_options.to_room}</b></span>
                      </div>
                    )
                }
                {
                  order.b_options?.to_way && (
                    <span className='way'>
                      <b>{t(order.b_comments?.includes('96') ? TRANSLATION.COMMENT : TRANSLATION.WAY)}:</b>&nbsp;
                      {order.b_options.to_way || t(TRANSLATION.NOT_SPECIFIED, { toLower: true })}
                    </span>
                  )
                }
                {
                  !order.b_comments?.includes('96') && order.b_options?.to_day && (
                    <span
                      className='time'
                    >
                      <b>{t(TRANSLATION.TAKE)}:</b>&nbsp;
                      {order.b_options.to_day}, {t(TRANSLATION.TIME_FROM, { toLower: true })}&nbsp;
                      {order.b_options.to_time_from} {t(TRANSLATION.TIME_TILL, { toLower: true })}&nbsp;
                      {order.b_options.to_time_to || t(TRANSLATION.NO_MATTER, { toLower: true })}
                    </span>
                  )
                }
                {
                  order.b_options?.to_tel && (
                    <span className='way'><b>{t(TRANSLATION.PHONE_TO_CALL)}:</b> {order.b_options.to_tel}
                      <img
                        src={images.phone}
                        alt={t(TRANSLATION.PHONE)}
                      />
                    </span>
                  )
                }
              </div>
            </div>
            <div className="order__separator"/>

            <OrderInfo order={order}/>
            {isOfferMode && (
              <div className="driver-offer-info order__driver-offer-info">
                <div className="driver-offer-info__title">{t(TRANSLATION.CLIENT_OFFER_ORDER_MODE)}</div>
                {offerPriceDifferenceText ? (
                  <div className="driver-offer-info__row">
                    <span>{t(TRANSLATION.DRIVER_OFFER_PRICE_DIFFERENCE)}</span>
                    <b>{offerPriceDifferenceText}</b>
                  </div>
                ) : offerCustomerDesiredPrice !== undefined && (
                  <div className="driver-offer-info__row">
                    <span>{t(TRANSLATION.DRIVER_OFFER_DESIRED_PRICE)}</span>
                    <b>{formatOfferPrice(offerCustomerDesiredPrice)}</b>
                  </div>
                )}
                {offerCount !== undefined && (
                  <div className="driver-offer-info__count">
                    {t(TRANSLATION.DRIVER_OFFER_OFFERS_COUNT)}: {offerCount}
                  </div>
                )}
                {currentDriverOffer && !currentOfferExpired && currentDriverOffer.status !== 'expired' && (
                  <>
                    <div className="driver-offer-info__row">
                      <span>{t(TRANSLATION.DRIVER_OFFER_OWN_PRICE)}</span>
                      <b>{formatOfferPrice(currentDriverOffer.price)}</b>
                    </div>
                    {currentDriverOffer.eta && (
                      <div className="driver-offer-info__row">
                        <span>{t(TRANSLATION.DRIVER_OFFER_OWN_ETA)}</span>
                        <b>{currentDriverOffer.eta}</b>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {getButtons()}
            {
              driver && driver.u_id === user?.u_id && (
                <ChatToggler
                  anotherUserID={order.u_id}
                  orderID={order.b_id}
                />
              )
            }
          </form>
        ) :
        t(TRANSLATION.NOT_AVIABLE_ORDER)
      }
    </PageSection>
}

export default withLayout(connector(Order))

const VOTING_PARTICIPATION_STORAGE_KEY = 'driverVotingParticipations'
const VOTING_ARRIVED_STORAGE_KEY = 'driverVotingArrived'
const VOTING_STORAGE_TTL = 12 * 60 * 60 * 1000

type TVotingStorageRecord = {
  id: string
  savedAt: number
}

function getStoredVotingRecords(storageKey: string): TVotingStorageRecord[] {
  try {
    const value = localStorage.getItem(storageKey)
    const items = value ? JSON.parse(value) : []
    const now = Date.now()
    const records: TVotingStorageRecord[] = Array.isArray(items) ? items
      .map((item: string | TVotingStorageRecord) => {
        if (typeof item === 'string')
          return null

        return item?.id && item?.savedAt ? item : null
      })
      .filter((item): item is TVotingStorageRecord =>
        Boolean(item && now - item.savedAt < VOTING_STORAGE_TTL),
      ) : []

    localStorage.setItem(storageKey, JSON.stringify(records))
    return records
  } catch {
    localStorage.setItem(storageKey, JSON.stringify([]))
    return []
  }
}

function getStoredVotingIds(storageKey: string): string[] {
  return getStoredVotingRecords(storageKey).map(item => item.id)
}

function saveStoredVotingId(storageKey: string, orderId: string) {
  const records = getStoredVotingRecords(storageKey)
  const nextRecords = [
    ...records.filter(item => item.id !== orderId),
    { id: orderId, savedAt: Date.now() },
  ]

  localStorage.setItem(storageKey, JSON.stringify(nextRecords))
  return nextRecords.map(item => item.id)
}

function removeStoredVotingId(storageKey: string, orderId: string) {
  const nextRecords = getStoredVotingRecords(storageKey).filter(item => item.id !== orderId)
  localStorage.setItem(storageKey, JSON.stringify(nextRecords))
  return nextRecords.map(item => item.id)
}

function getStoredVotingParticipationIds(): string[] {
  return getStoredVotingIds(VOTING_PARTICIPATION_STORAGE_KEY)
}

function saveVotingParticipationId(orderId: string) {
  return saveStoredVotingId(VOTING_PARTICIPATION_STORAGE_KEY, orderId)
}

function removeVotingParticipationId(orderId: string) {
  return removeStoredVotingId(VOTING_PARTICIPATION_STORAGE_KEY, orderId)
}

function getStoredVotingArrivedIds(): string[] {
  return getStoredVotingIds(VOTING_ARRIVED_STORAGE_KEY)
}

function saveVotingArrivedId(orderId: string) {
  return saveStoredVotingId(VOTING_ARRIVED_STORAGE_KEY, orderId)
}

function removeVotingArrivedId(orderId: string) {
  return removeStoredVotingId(VOTING_ARRIVED_STORAGE_KEY, orderId)
}

function hasAnotherVotingDriverReached(order?: any, userId?: string) {
  return order?.drivers?.some((driver: any) =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  ) ?? false
}

function canMarkVotingArrived(order?: any, geoposition?: GeolocationPosition, userId?: string) {
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

function canOpenVotingNavigation(order?: any, geoposition?: GeolocationPosition) {
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
  order: any,
  userId: string | undefined,
  now: number,
) {
  const competitors = order?.drivers?.filter((driver: any) =>
    driver.u_id !== userId &&
    isVotingDriverParticipating(driver),
  ) ?? []
  const distances = competitors
    .map((driver: any) => {
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
    .filter((item: unknown): item is { name: string, distance: number } => !!item)
    .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)

  return {
    competitorsCount: competitors.length,
    nearestCompetitor: distances[0] ? formatVotingDistance(distances[0].distance) : '',
    nearestCompetitors: distances.slice(0, 3).map((item: { name: string, distance: number }) => ({
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

  return name || t(TRANSLATION.DRIVER)
}

function formatVotingDistance(distanceMeters: number) {
  if (distanceMeters < 1000)
    return `${Math.round(distanceMeters / 10) * 10} м`

  return `${(distanceMeters / 1000).toFixed(1)} км`
}

function formatVotingRemaining(order: any, now: number) {
  const stableRemaining = getStableRemainingLifetimeSeconds(order, now)
  if (stableRemaining !== null)
    return formatSeconds(Math.max(Math.round(stableRemaining), 0))

  if (!order?.b_max_waiting || !order.b_created)
    return ''

  const createdAt = order.b_created.valueOf()
  const remainingSeconds = Math.max(
    Math.round(order.b_max_waiting - (now - createdAt) / 1000),
    0,
  )
  return formatSeconds(remainingSeconds)
}

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function getVotingCloseMessage(order: any, userId?: string) {
  const currentDriver = order.drivers?.find((driver: any) => driver.u_id === userId)
  const anotherDriverStarted = order.drivers?.some((driver: any) =>
    driver.u_id !== userId &&
    [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
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

function isVotingOrderExpired(order: any) {
  if (!order?.b_voting)
    return false

  if (typeof order.remaining_lifetime_seconds === 'number')
    return order.remaining_lifetime_seconds <= 0

  if (!order.b_max_waiting || !order.b_created)
    return false

  const createdAt = Number(order.b_created)
  if (!createdAt)
    return false

  return createdAt + order.b_max_waiting * 1000 <= Date.now()
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
