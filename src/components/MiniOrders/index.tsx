import React from 'react'
import { ConnectedProps, connect } from 'react-redux'
import cn from 'classnames'
import { EBookingDriverState, EStatuses, IOrder, IDriver } from '../../types/types'
import {
  getOrderIcon,
  distanceBetweenEarthCoordinates,
} from '../../tools/utils'
import { candidateMode } from '../../tools/order'
import { getPassengerChoiceSearchRestartedAt, getPassengerConfirmedChoice, getPassengerConfirmedChoiceStartedAt, isChoiceOrder, isOfferOrder, isStoredSimpleOrderMode, isVotingOrder, isVisibleChoiceDriverState } from '../../tools/driverOffer'
import { IRootState } from '../../state'
import { ordersActionCreators, ordersSelectors } from '../../state/orders'
import { clientOrderActionCreators, clientOrderSelectors } from '../../state/clientOrder'
import { modalsActionCreators } from '../../state/modals'
import { t, TRANSLATION } from '../../localization'
import { useReliableNow } from '../../tools/hooks'
import { getStableRemainingLifetimeSeconds, getTimestamp } from '../../tools/reliableTime'
import { getDriverTripStartedAt } from '../../tools/tripTimer'
import { configSelectors } from '../../state/config'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import ChatToggler from '../Chat/Toggler'
import CarClassBadge, { getRequiredCarClassKind } from '../CarClassBadge'
import votingModeIconPng from './icon_group_check.png'
import offerModeIconPng from './icon_tag_star.png'
import { PassengerUiConfig } from '../../types/passengerUi'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  setRatingModal: modalsActionCreators.setRatingModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setAlarmModal: modalsActionCreators.setAlarmModal,
  refreshActiveOrders: ordersActionCreators.refreshActiveOrders,
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

function formatApproximateRouteDuration(minutes?: number | null) {
  const normalizedMinutes = normalizeRouteDurationMinutes(minutes)
  if (!normalizedMinutes)
    return '—'

  const hours = Math.floor(normalizedMinutes / 60)
  const mins = normalizedMinutes % 60

  if (hours <= 0)
    return `≈ ${normalizedMinutes} ${t(TRANSLATION.MINUTES)}`
  if (mins <= 0)
    return `≈ ${hours} ${t(TRANSLATION.HOURS)}`
  return `≈ ${hours} ${t(TRANSLATION.HOURS)} ${mins} ${t(TRANSLATION.MINUTES)}`
}

function formatMiniOrderSeconds(seconds: number) {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60

  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function getMomentTimestamp(value: any) {
  return getTimestamp(value)
}

function getDriverOnWayStartedAt(order: IOrder, driver?: IDriver | null) {
  const selectedStartedAt = getPassengerConfirmedChoiceStartedAt(order.b_id, driver?.u_id)
  if (selectedStartedAt)
    return selectedStartedAt

  return getMomentTimestamp(
    driver?.c_becomed_candidate ||
    (driver as any)?.c_created ||
    (driver as any)?.created_at ||
    (driver as any)?.createdAt ||
    (driver as any)?.c_started ||
    (order as any).b_select_datetime ||
    (order as any).b_confirmation_datetime ||
    order.b_start_datetime ||
    order.b_created,
  )
}

function formatDriverOnWayDuration(order: IOrder, driver?: IDriver | null, now: number = Date.now()) {
  if (!driver || driver.c_state !== EBookingDriverState.Performer)
    return ''

  const startedAt = getDriverOnWayStartedAt(order, driver)
  if (!startedAt)
    return ''

  return formatMiniOrderSeconds(Math.max(0, (now - startedAt) / 1000))
}

function getMiniOrderCreatedAt(order: IOrder) {
  return getMomentTimestamp(order.b_created || order.b_start_datetime)
}

const MAX_CHOICE_WAITING_SECONDS = 1800
const MAX_TRUSTED_BACKEND_CHOICE_WAITING_SECONDS = 900

function getSafeStoredVotingWaitingSeconds(order: IOrder) {
  const value = Number(order.b_max_waiting || 0)
  return Number.isFinite(value) && value > 0 && value <= MAX_TRUSTED_BACKEND_CHOICE_WAITING_SECONDS ? Math.round(value) : 0
}

function formatVotingOrderRemaining(order: IOrder, now: number = Date.now()) {
  const restartedAt = getPassengerChoiceSearchRestartedAt(order.b_id)
  const maxWaiting = getSafeStoredVotingWaitingSeconds(order) || SITE_CONSTANTS.WAITING_INTERVAL
  if (restartedAt) {
    return formatMiniOrderSeconds(maxWaiting - Math.max(0, (now - restartedAt) / 1000))
  }

  const createdAt = getMiniOrderCreatedAt(order)

  if (createdAt && maxWaiting)
    return formatMiniOrderSeconds(Math.max(0, maxWaiting - Math.max(0, (now - createdAt) / 1000)))

  const stableRemaining = getStableRemainingLifetimeSeconds(order, now)
  if (stableRemaining !== null)
    return formatMiniOrderSeconds(Math.min(MAX_CHOICE_WAITING_SECONDS, stableRemaining))

  return ''
}

function shouldShowSearchCountdown(order: IOrder) {
  const maxWaiting = getSafeStoredVotingWaitingSeconds(order)

  return isVotingOrder(order) ||
    typeof order.remaining_lifetime_seconds === 'number' ||
    (Number.isFinite(maxWaiting) && maxWaiting > 0 && maxWaiting <= 1800)
}

function formatTripStartedDuration(order: IOrder, driver?: IDriver | null, now: number = Date.now()) {
  const startedAt = getDriverTripStartedAt(order, driver, now)

  if (!startedAt)
    return ''

  return formatMiniOrderSeconds(Math.max(0, (now - startedAt) / 1000))
}

function getActiveDriver(order: IOrder) {
  const drivers = order?.drivers ?? []
  const confirmedChoiceId = getPassengerConfirmedChoice(order.b_id)
  const confirmedDriver = confirmedChoiceId ? drivers.find(item =>
    String(item.u_id) === String(confirmedChoiceId) &&
    item.c_state !== EBookingDriverState.Canceled,
  ) : null

  if (confirmedDriver)
    return confirmedDriver

  const startedDriver = drivers.find(item => item.c_state === EBookingDriverState.Started)
  if (startedDriver)
    return startedDriver

  // Пока идёт подбор/кандидаты, верхняя плашка обязана оставаться в статусе
  // «Поиск водителя». Backend и эмулятор могут отдавать Performer уже на этапе
  // отклика, но это ещё не означает, что водитель выбран пассажиром.
  if (isChoiceOrder(order) || (candidateMode(order) && !isStoredSimpleOrderMode(order))) {
    return null
  }

  return drivers.find(item => [
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(item.c_state)) ?? null
}

function getCandidateDrivers(order: IOrder) {
  if (!isChoiceOrder(order))
    return []

  return (order.drivers ?? [])
    .filter(item => isVisibleChoiceDriverState(item.c_state))
}


function getDriverRating(driver?: IDriver | null) {
  const rating = Number(driver?.c_rating)
  if (Number.isFinite(rating) && rating > 0)
    return rating.toFixed(1)

  return driver ? '4.8' : '—'
}

function getOrderTypeText(order: IOrder) {
  if (isChoiceOrder(order))
    return ''

  if (order.b_car_class) {
    const value = t(TRANSLATION.CAR_CLASSES[order.b_car_class])
    if (value && value !== order.b_car_class)
      return value
  }

  if (order.b_comments?.includes('98')) return t(TRANSLATION.DELIVERY)
  if (order.b_comments?.includes('97')) return t(TRANSLATION.MOTORCYCLE)
  if (order.b_comments?.includes('96')) return t(TRANSLATION.TYPE_RELOCATION)
  if (order.b_comments?.includes('95')) return t(TRANSLATION.TRUCK)

  return t(TRANSLATION.AUTO)
}

function getOrderStatusText(order: IOrder, driver?: IDriver | null) {
  if (driver?.c_state === EBookingDriverState.Started)
    return t(TRANSLATION.CLIENT_TRIP_STARTED_TITLE)
  if (driver?.c_state === EBookingDriverState.Arrived)
    return t(TRANSLATION.CLIENT_DRIVER_ARRIVED_TITLE)
  if (driver?.c_state === EBookingDriverState.Performer)
    return t(TRANSLATION.CLIENT_DRIVER_ON_WAY_TITLE)
  if (driver && isChoiceOrder(order))
    return t(TRANSLATION.CLIENT_DRIVER_ON_WAY_TITLE)
  if (driver)
    return t(TRANSLATION.BOOKING_DRIVER_STATES[driver.c_state || EBookingDriverState.Performer])

  return t(TRANSLATION.CLIENT_SEARCHING_DRIVER)
}


function getMiniOrderTitleText(_order: IOrder, statusText: string, driver?: IDriver | null) {
  // Пока пассажир реально не выбрал водителя, верхняя плашка должна оставаться
  // в состоянии поиска. Тип заказа показываем иконкой/метриками, но не пишем
  // "Водитель едет" и не подменяем статус на offer/voting.
  if (!driver)
    return t(TRANSLATION.CLIENT_SEARCHING_DRIVER)

  return statusText
}

function getOrderResponsesCount(order: IOrder, candidatesCount: number) {
  const activeDriversCount = (order.drivers ?? [])
    .filter(item => item.c_state !== EBookingDriverState.Canceled)
    .length

  return candidatesCount || activeDriversCount
}

function formatLabelWithColon(label: string) {
  return `${String(label || '').trim().replace(/[:：]+$/g, '')}:`
}

function getMiniOrderRatingLabel() {
  const headerLabel = t(TRANSLATION.RATING_HEADER)
  if (headerLabel && headerLabel !== TRANSLATION.RATING_HEADER)
    return headerLabel

  const fallbackLabel = t(TRANSLATION.RATING)
  return fallbackLabel && fallbackLabel !== TRANSLATION.RATING ? fallbackLabel : 'Рейтинг'
}

function isSimpleSearchingOrder(order: IOrder) {
  return !isVotingOrder(order) &&
    !isChoiceOrder(order) &&
    !(candidateMode(order) && !isStoredSimpleOrderMode(order))
}

function formatSimpleOrderWaitingDuration(order: IOrder, now: number = Date.now()) {
  const createdAt = getMiniOrderCreatedAt(order)
  if (!createdAt)
    return ''

  return formatMiniOrderSeconds(Math.max(0, (now - createdAt) / 1000))
}

function getPrimaryMetricText(order: IOrder, driver: IDriver | null | undefined, candidatesCount: number, ratingText: string, now: number = Date.now()) {
  if (driver)
    return `${formatLabelWithColon(getMiniOrderRatingLabel())} ${ratingText}`

  if (isSimpleSearchingOrder(order)) {
    const waitingDuration = formatSimpleOrderWaitingDuration(order, now)
    return waitingDuration ? `${formatLabelWithColon(t(TRANSLATION.WAITING))} ${waitingDuration}` : formatLabelWithColon(t(TRANSLATION.WAITING))
  }

  if (isVotingOrder(order))
    return `${t(TRANSLATION.CLIENT_DRIVERS_COUNT_LABEL)}: ${getOrderResponsesCount(order, candidatesCount)}`

  return `${t(TRANSLATION.CLIENT_RESPONSES_COUNT)}: ${getOrderResponsesCount(order, candidatesCount)}`
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5v5l3.3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SosIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2.9 19 5.5v5.2c0 4.8-2.9 8.9-7 10.4-4.1-1.5-7-5.6-7-10.4V5.5l7-2.6Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.7v5.6M12 16.7h.01" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

type MiniOrderMode = 'order' | 'voting' | 'offer'

function getMiniOrderMode(order: IOrder): MiniOrderMode {
  if (isVotingOrder(order)) return 'voting'
  if (isOfferOrder(order)) return 'offer'
  return 'order'
}

function MiniOrderModeIcon({ mode }: { mode: MiniOrderMode }) {
  if (mode === 'offer') {
    return <img src={offerModeIconPng} alt="" aria-hidden="true" className="mini-orders__mode-icon-image" />
  }

  if (mode === 'voting') {
    return <img src={votingModeIconPng} alt="" aria-hidden="true" className="mini-orders__mode-icon-image" />
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="mini-orders__plain-car-icon">
      <path d="M6.1 11.8 7.2 8.6c.4-1.1 1.5-1.8 2.7-1.8h4.3c1.2 0 2.3.7 2.7 1.8l1.1 3.2h.4c.8 0 1.4.6 1.4 1.4v2.7c0 .8-.6 1.4-1.4 1.4h-.8c-.3.8-1 1.4-1.9 1.4-.9 0-1.6-.6-1.9-1.4h-3.7c-.3.8-1 1.4-1.9 1.4-.9 0-1.6-.6-1.9-1.4h-.8c-.8 0-1.4-.6-1.4-1.4v-2.7c0-.8.6-1.4 1.4-1.4h.5Z" fill="currentColor" />
      <path d="M8.8 9.1h6.4c.4 0 .7.2.8.6l.5 1.5H7.5L8 9.7c.1-.4.4-.6.8-.6Z" fill="#FFFFFF" opacity=".96" />
      <circle cx="8.8" cy="15.4" r="1.1" fill="#FFFFFF" opacity=".98" />
      <circle cx="15.2" cy="15.4" r="1.1" fill="#FFFFFF" opacity=".98" />
    </svg>
  )
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  handleOrderClick: (order: IOrder) => any
  uiConfig?: PassengerUiConfig
}

function MiniOrders({
  activeOrders,
  selectedOrder,
  setSelectedOrder,
  setRatingModal,
  setMessageModal,
  setAlarmModal,
  refreshActiveOrders,
  className,
  handleOrderClick,
  language,
  uiConfig,
}: IProps) {
  const languageIso = language?.iso
  const [routeDurations, setRouteDurations] = React.useState<Record<string, number | undefined>>({})
  const now = useReliableNow(Boolean(activeOrders?.length), 1000)
  const [finishingOrders, setFinishingOrders] = React.useState<Record<string, boolean>>({})

  const handleFinishClick = (event: React.MouseEvent, order: IOrder) => {
    event.preventDefault()
    event.stopPropagation()

    if (finishingOrders[order.b_id])
      return

    setSelectedOrder(order.b_id)
    setFinishingOrders(prev => ({ ...prev, [order.b_id]: true }))

    API.setOrderState(order.b_id, EBookingDriverState.Finished)
      .then(() => {
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
      .finally(() => {
        setFinishingOrders(prev => ({ ...prev, [order.b_id]: false }))
      })
  }

  const handleSosClick = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setAlarmModal({ isOpen: true })
  }

  React.useEffect(() => {
    if (!activeOrders?.length) {
      setRouteDurations({})
      return
    }

    let cancelled = false
    activeOrders.forEach(order => {
      const routePoints = getOrderRoutePoints(order)
      if (!routePoints)
        return

      withRouteTimeout(API.makeRoutePoints(routePoints.from, routePoints.to))
        .then(routeInfo => {
          if (cancelled)
            return
          const minutes = getRouteDurationMinutes(routeInfo) || getFallbackRouteDurationMinutes(order)
          setRouteDurations(prev => ({
            ...prev,
            [order.b_id]: minutes,
          }))
        })
        .catch(error => {
          if (cancelled)
            return
          setRouteDurations(prev => ({
            ...prev,
            [order.b_id]: getFallbackRouteDurationMinutes(order),
          }))
        })
    })

    return () => {
      cancelled = true
    }
  }, [
    activeOrders?.map(order =>
      `${order.b_id}:${order.b_start_latitude}:${order.b_start_longitude}:${order.b_destination_latitude}:${order.b_destination_longitude}`,
    ).join('|'),
  ])

  const cardRefs = React.useRef<Record<string, HTMLDivElement | null>>({})

  React.useEffect(() => {
    if (!selectedOrder) return

    const frame = window.requestAnimationFrame(() => {
      const selectedCard = cardRefs.current[String(selectedOrder)]
      const isMobileViewport = window.matchMedia?.('(max-width: 560px)').matches
      selectedCard?.scrollIntoView({
        block: 'nearest',
        inline: isMobileViewport ? 'start' : 'center',
        behavior: 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [
    selectedOrder,
    activeOrders?.map(order => order.b_id).join('|'),
    languageIso,
  ])

  if (!activeOrders?.length) return null

  return (
    <div className={cn('mini-orders', className)} data-ui-state={uiConfig?.state}>
      {
        activeOrders.map(order => {
          const isCardSelected = selectedOrder === order.b_id
          const orderDriver = getActiveDriver(order)
          const candidatesCount = getCandidateDrivers(order).length
          const isTripStarted = orderDriver?.c_state === EBookingDriverState.Started
          const statusText = getOrderStatusText(order, orderDriver)
          const ratingText = getDriverRating(orderDriver)
          const typeText = getOrderTypeText(order)
          const uiConfigApplies = Boolean(uiConfig && isCardSelected && !uiConfig.legacy)
          const shouldShowCardTimer = uiConfigApplies ? uiConfig!.timerKind !== 'none' : isCardSelected
          const timeText = !shouldShowCardTimer ? '' : uiConfigApplies ? (
            uiConfig!.timerKind === 'search' && !orderDriver ?
              formatSimpleOrderWaitingDuration(order, now) :
              uiConfig!.timerKind === 'trip' && orderDriver ?
                formatTripStartedDuration(order, orderDriver, now) :
                uiConfig!.timerKind === 'onWay' && orderDriver ?
                  formatDriverOnWayDuration(order, orderDriver, now) :
                  ''
          ) : !orderDriver ?
            (isSimpleSearchingOrder(order) ? '' : shouldShowSearchCountdown(order) ? formatVotingOrderRemaining(order, now) : '') :
            orderDriver?.c_state === EBookingDriverState.Started ?
              formatTripStartedDuration(order, orderDriver, now) :
              formatDriverOnWayDuration(order, orderDriver, now)
          const isFinishing = Boolean(finishingOrders[order.b_id])
          const orderMode = getMiniOrderMode(order)
          const carClassKind = getRequiredCarClassKind(order)
          const isInactiveLiveCard = !isCardSelected && Boolean(orderDriver)

          return (
            <div
              key={order.b_id}
              ref={(element) => { cardRefs.current[String(order.b_id)] = element }}
              className={cn('mini-orders__card', `mini-orders__card--${orderMode}`, {
                'mini-orders__card--started': isTripStarted,
                'mini-orders__card--selected': isCardSelected,
                'mini-orders__card--inactive-live': isInactiveLiveCard,
                disabled: !order.drivers?.length &&
                  !isVotingOrder(order) &&
                  !(candidateMode(order) && !isStoredSimpleOrderMode(order)),
              })}
              onClick={() => handleOrderClick(order)}
            >
              <span className={cn('mini-orders__mode-icon', `mini-orders__mode-icon--${orderMode}`)} aria-hidden="true">
                <MiniOrderModeIcon mode={orderMode} />
              </span>

              <div className="mini-orders__main">
                <div className="mini-orders__header">
                  <span className="mini-orders__id">№ {order.b_id}</span>
                  <span className="mini-orders__status">{getMiniOrderTitleText(order, statusText, orderDriver)}</span>
                </div>

                <div className="mini-orders__body">
                  <span className={cn('mini-orders__metric', 'mini-orders__metric--primary', `mini-orders__metric--primary-${orderMode}`)}>
                    {getPrimaryMetricText(order, orderDriver, candidatesCount, ratingText, now)}
                  </span>
                  {timeText && (
                    <span className={cn('mini-orders__metric', 'mini-orders__metric--time', `mini-orders__metric--time-${orderMode}`)} title={t(TRANSLATION.CLIENT_ROUTE_DURATION)}>
                      <ClockIcon />
                      {timeText}
                    </span>
                  )}
                  {typeText && (
                    <span className="mini-orders__metric mini-orders__metric--type">
                      <img src={getOrderIcon(order)} alt="" aria-hidden="true" />
                      {typeText}
                    </span>
                  )}
                </div>
              </div>

              <CarClassBadge kind={carClassKind} compact className="mini-orders__car-class" />

              {isTripStarted && isCardSelected && (!uiConfigApplies || uiConfig!.showFinishTrip) && (
                <div className="mini-orders__started-actions">
                  <button
                    type="button"
                    className="mini-orders__finish"
                    disabled={isFinishing}
                    onClick={event => handleFinishClick(event, order)}
                  >
                    {isFinishing ? t(TRANSLATION.LOADING) : t(TRANSLATION.CLIENT_FINISH_TRIP)}
                  </button>
                  <button
                    type="button"
                    className="mini-orders__sos"
                    onClick={handleSosClick}
                    aria-label="SOS"
                  >
                    <SosIcon />
                    SOS
                  </button>
                </div>
              )}

              {
                orderDriver && !isTripStarted && isCardSelected && (!uiConfigApplies || uiConfig!.showChat) && (
                  <ChatToggler
                    anotherUserID={orderDriver.u_id}
                    orderID={order.b_id}
                  />
                )
              }
            </div>
          )
        })
      }
    </div>
  )
}

export default connector(MiniOrders)
