import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import {
  EBookingDriverState,
  EOrderProfitRank,
  IOrder,
  IUser,
} from '../../types/types'
import images from '../../constants/images'
import statusNewIcon from './status-icons/new.png'
import statusSearchIcon from './status-icons/search.png'
import statusVotingIcon from './status-icons/voting.png'
import statusOfferIcon from './status-icons/offer.png'
import statusDriverIcon from './status-icons/driver.png'
import statusDriverGoingIcon from './status-icons/driver-going.png'
import statusArrivedIcon from './status-icons/arrived.png'
import statusTripIcon from './status-icons/trip.png'
import statusDoneIcon from './status-icons/done.png'
import statusCancelClientIcon from './status-icons/cancel-client.png'
import statusCancelDriverIcon from './status-icons/cancel-driver.png'
import statusCancelSystemIcon from './status-icons/cancel-system.png'
import statusExpiredIcon from './status-icons/expired.png'
import statusMissedIcon from './status-icons/missed.png'
import statusNoDriversIcon from './status-icons/no-drivers.png'
import { CURRENCY } from '../../siteConstants'
import {
  EPaymentType,
  getPayment,
  distanceBetweenEarthCoordinates,
  formatCurrency,
} from '../../tools/utils'
import { IRootState } from '../../state'
import { configSelectors } from '../../state/config'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import { isOfferOrder, isVotingOrder } from '../../tools/driverOffer'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  activeChat: modalsSelectors.activeChat(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  setActiveChat: modalsActionCreators.setActiveChat,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
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

function getStoredRouteDurationMinutes(order: IOrder) {
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

function getOrderRoutePoints(order: IOrder) {
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

function getRouteDurationMinutes(routeInfo: any) {
  return normalizeRouteDurationMinutes(
    (Number(routeInfo?.time?.hours) || 0) * 60 +
    (Number(routeInfo?.time?.minutes) || 0),
  )
}

function getFallbackRouteDurationMinutes(order: IOrder) {
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

  const routePoints = getOrderRoutePoints(order)
  if (!routePoints)
    return getStoredRouteDurationMinutes(order)

  const distanceKm = distanceBetweenEarthCoordinates(
    routePoints.from.latitude,
    routePoints.from.longitude,
    routePoints.to.latitude,
    routePoints.to.longitude,
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

function formatApproximateRouteDuration(minutes?: number | null) {
  const normalizedMinutes = normalizeRouteDurationMinutes(minutes)
  if (!normalizedMinutes)
    return '—'

  const hours = Math.floor(normalizedMinutes / 60)
  const mins = normalizedMinutes % 60

  if (hours <= 0)
    return `≈ ${normalizedMinutes} мин`
  if (mins <= 0)
    return `≈ ${hours} ч`
  return `≈ ${hours} ч ${mins} мин`
}


type TMiniOrderStatusView = {
  key: string
  label: string
}

const MINI_ORDER_STATUS_ICONS: Record<string, string> = {
  new: statusNewIcon,
  search: statusSearchIcon,
  voting: statusVotingIcon,
  offer: statusOfferIcon,
  driver: statusDriverIcon,
  'driver-going': statusDriverGoingIcon,
  arrived: statusArrivedIcon,
  trip: statusTripIcon,
  done: statusDoneIcon,
  cancel: statusCancelClientIcon,
  'cancel-client': statusCancelClientIcon,
  'cancel-driver': statusCancelDriverIcon,
  'cancel-system': statusCancelSystemIcon,
  expired: statusExpiredIcon,
  missed: statusMissedIcon,
  'no-drivers': statusNoDriversIcon,
  candidate: statusVotingIcon,
}

function getMiniOrderStatusIcon(statusKey: string) {
  return MINI_ORDER_STATUS_ICONS[statusKey] || statusNewIcon
}

function getCancelStatusKey(order: IOrder) {
  const cancelStates = Object.values((order as any).b_cancel_states || {}).reduce<number[]>((acc, value) => {
    if (Array.isArray(value))
      return acc.concat(value.map(Number))

    acc.push(Number(value))
    return acc
  }, [])

  if (cancelStates.includes(2)) return 'cancel-driver'
  if (cancelStates.includes(1)) return 'cancel-system'
  return 'cancel-client'
}

function getDriverParticipationKey(order: IOrder, user?: IUser) {
  const myDriver = order.drivers?.find(driver => driver.u_id === user?.u_id)
  if (!myDriver) return 'none'
  switch (myDriver.c_state) {
    case EBookingDriverState.Considering:
      return 'candidate'
    case EBookingDriverState.Canceled:
      return 'rejected'
    case EBookingDriverState.Performer:
      return 'assigned'
    case EBookingDriverState.Arrived:
      return 'arrived'
    case EBookingDriverState.Started:
      return 'started'
    case EBookingDriverState.Finished:
      return 'finished'
    default:
      return 'none'
  }
}

function getOrderArchiveKey(order: IOrder) {
  if (order.b_completed) return 'completed'
  if (order.b_canceled || order.b_state === 3) return 'canceled'
  return 'active'
}

function formatRelativeProfit(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return ''

  return `${formatCurrency(value, { signDisplay: 'always', currencyDisplay: 'none' }).trim()} ${CURRENCY.SIGN}/км хол.`
}

function getMiniOrderStatusView(order: IOrder, user?: IUser): TMiniOrderStatusView {
  const myDriver = order.drivers?.find(driver => driver.u_id === user?.u_id)

  if (order.b_completed)
    return { key: 'done', label: 'done' }

  if (order.b_canceled || order.b_state === 3)
    return { key: getCancelStatusKey(order), label: 'cancel' }

  if (myDriver?.c_state === EBookingDriverState.Started)
    return { key: 'trip', label: 'trip' }

  if (myDriver?.c_state === EBookingDriverState.Arrived)
    return { key: 'arrived', label: 'driver_arrived' }

  if (myDriver?.c_state === EBookingDriverState.Performer)
    return { key: 'driver-going', label: 'driver_on_way' }

  if (myDriver?.c_state === EBookingDriverState.Considering)
    return { key: isOfferOrder(order) ? 'offer' : 'voting', label: 'candidate' }

  if (isVotingOrder(order))
    return { key: 'voting', label: 'voting' }

  if (isOfferOrder(order))
    return { key: 'offer', label: 'offer' }

  if (order.drivers?.length)
    return { key: 'search', label: 'search' }

  return { key: 'new', label: 'new' }
}


const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUser,
  order: IOrder,
  onClick: (event: React.MouseEvent, id: IOrder['b_id']) => any,
  onSelect?: (id: IOrder['b_id']) => void,
  isHistory?: boolean,
  isSelected?: boolean,
  innerRef?: React.Ref<HTMLDivElement>
}

function MiniOrder({
  user,
  order,
  onClick,
  activeChat,
  language,
  setActiveChat,
  setOrderCardModal,
  isHistory,
  isSelected,
  onSelect,
  innerRef,
}: IProps) {
  void language

  const payment = getPayment(order)
  const offerOrder = !isVotingOrder(order) && isOfferOrder(order)
  const driver = order?.drivers?.find(item => item.c_state !== EBookingDriverState.Canceled)
  const myDriver = order?.drivers?.find(item => item.u_id === user?.u_id)
  const isSelectedForDriver = Boolean(myDriver && [
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ].includes(myDriver.c_state))
  const profitValue = typeof order.profit === 'number' && Number.isFinite(order.profit) ? order.profit : undefined
  const profitText = profitValue !== undefined ?
    formatCurrency(profitValue, { signDisplay: 'always' }) :
    ''
  const isNegativeProfit = profitValue !== undefined && profitValue < 0
  const [calculatedRouteDurationMinutes, setCalculatedRouteDurationMinutes] = React.useState<number | undefined>(undefined)
  const routePoints = getOrderRoutePoints(order)
  const routeDurationText = formatApproximateRouteDuration(
    calculatedRouteDurationMinutes ||
    getStoredRouteDurationMinutes(order) ||
    getFallbackRouteDurationMinutes(order),
  )
  const statusView = getMiniOrderStatusView(order, user)
  const relativeProfitText = formatRelativeProfit(order.profitPerEmptyKm)
  const participationKey = getDriverParticipationKey(order, user)
  const archiveKey = getOrderArchiveKey(order)

  React.useEffect(() => {
    if (!routePoints) {
      setCalculatedRouteDurationMinutes(undefined)
      return
    }

    let cancelled = false

    withRouteTimeout(API.makeRoutePoints(routePoints.from, routePoints.to))
      .then(routeInfo => {
        if (cancelled)
          return

        setCalculatedRouteDurationMinutes(
          getRouteDurationMinutes(routeInfo) ||
          getFallbackRouteDurationMinutes(order),
        )
      })
      .catch(error => {
        console.error(error)
        if (!cancelled)
          setCalculatedRouteDurationMinutes(getFallbackRouteDurationMinutes(order))
      })

    return () => {
      cancelled = true
    }
  }, [
    order.b_id,
    order.b_start_latitude,
    order.b_start_longitude,
    order.b_destination_latitude,
    order.b_destination_longitude,
  ])


  const openChatModal = (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!order?.b_options?.createdBy) {
      const from = `${user?.u_id}_${order.b_id}`
      const to = `${order?.u_id}_${order.b_id}`
      const chatID = `${from};${to}`
      setActiveChat(activeChat === chatID ? null : chatID)
      return
    }

    switch (order.b_options.createdBy.toLowerCase()) {
      case 'sms':
        window.location.href = `tel:${order.user?.u_phone}`
        break
      case 'whatsapp':
        window.location.href = `https://wa.me/${order.user?.u_phone}`
        break
      default:
        const from = `${user?.u_id}_${order.b_id}`
        const to = `${order?.u_id}_${order.b_id}`
        const chatID = `${from};${to}`
        setActiveChat(activeChat === chatID ? null : chatID)
    }
  }


  return (<>
    <div
      ref={innerRef}
      className={cn(
        'mini-order',
        `mini-order--status-${statusView.key}`,
        `mini-order--participation-${participationKey}`,
        `mini-order--archive-${archiveKey}`,
        { 'mini-order--history': order.b_canceled || order.b_completed },
        { 'mini-order--selected': isSelectedForDriver || isSelected },
        { 'mini-order--profit-negative': isNegativeProfit },
        order.profitRank !== undefined && `mini-order--profit--${{
          [EOrderProfitRank.Low]: 'low',
          [EOrderProfitRank.Medium]: 'medium',
          [EOrderProfitRank.High]: 'high',
        }[order.profitRank]}`,
      )}
      onClick={() => {
        onSelect?.(order.b_id)
        setOrderCardModal({ isOpen: true, orderId: order.b_id })
      }}
    >
      <span className="colored">№{order.b_id}</span>

      {offerOrder && (
        <span className="mini-order__offer-badge">
          {t(TRANSLATION.CLIENT_OFFER_ORDER_MODE)}
        </span>
      )}

      {!isHistory && driver && driver.u_id === user.u_id && driver.c_state !== EBookingDriverState.Started && (
        <span
          className="mini-order__chat-btn"
          onClick={openChatModal}
        >
          {order?.b_options?.createdBy?.toLowerCase() === 'whatsapp' ?
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M13.9355 11.7168C13.7227 11.6074 12.6621 11.0879 12.4648 11.0176C12.2676 10.9434 12.123 10.9082 11.9805 11.127C11.8359 11.3438 11.4258 11.8262 11.2969 11.9727C11.1719 12.1172 11.0449 12.1348 10.832 12.0273C9.56641 11.3945 8.73633 10.8984 7.90234 9.4668C7.68164 9.08594 8.12305 9.11328 8.53516 8.29102C8.60547 8.14648 8.57031 8.02344 8.51562 7.91406C8.46094 7.80469 8.03125 6.74609 7.85156 6.31445C7.67773 5.89453 7.49805 5.95312 7.36719 5.94531C7.24219 5.9375 7.09961 5.9375 6.95508 5.9375C6.81055 5.9375 6.57813 5.99219 6.38086 6.20508C6.18359 6.42188 5.62695 6.94336 5.62695 8.00195C5.62695 9.06055 6.39844 10.0859 6.50391 10.2305C6.61328 10.375 8.02148 12.5469 10.1836 13.4824C11.5508 14.0723 12.0859 14.123 12.7695 14.0215C13.1855 13.959 14.043 13.502 14.2207 12.9961C14.3984 12.4922 14.3984 12.0605 14.3457 11.9707C14.293 11.875 14.1484 11.8203 13.9355 11.7168Z" fill="white"></path><path d="M18.0703 6.60938C17.6289 5.56055 16.9961 4.61914 16.1894 3.81055C15.3828 3.00391 14.4414 2.36914 13.3906 1.92969C12.3164 1.47852 11.1758 1.25 9.99999 1.25H9.96093C8.77733 1.25586 7.63085 1.49023 6.55272 1.95117C5.51171 2.39648 4.57811 3.0293 3.77929 3.83594C2.98046 4.64258 2.3535 5.58008 1.91991 6.625C1.47069 7.70703 1.24413 8.85742 1.24999 10.041C1.25585 11.3965 1.58007 12.7422 2.18749 13.9453V16.9141C2.18749 17.4102 2.58983 17.8125 3.08593 17.8125H6.05663C7.25975 18.4199 8.60546 18.7441 9.96093 18.75H10.0019C11.1719 18.75 12.3066 18.5234 13.375 18.0801C14.4199 17.6445 15.3594 17.0195 16.1641 16.2207C16.9707 15.4219 17.6055 14.4883 18.0488 13.4473C18.5098 12.3691 18.7441 11.2227 18.75 10.0391C18.7558 8.84961 18.5254 7.69531 18.0703 6.60938ZM15.1191 15.1641C13.75 16.5195 11.9336 17.2656 9.99999 17.2656H9.96679C8.78905 17.2598 7.61913 16.9668 6.58593 16.416L6.42186 16.3281H3.67186V13.5781L3.58397 13.4141C3.03319 12.3809 2.74022 11.2109 2.73436 10.0332C2.72655 8.08594 3.47069 6.25781 4.83593 4.88086C6.19921 3.50391 8.02147 2.74219 9.96874 2.73438H10.0019C10.9785 2.73438 11.9258 2.92383 12.8183 3.29883C13.6894 3.66406 14.4707 4.18945 15.1426 4.86133C15.8125 5.53125 16.3398 6.31445 16.7051 7.18555C17.084 8.08789 17.2734 9.04492 17.2695 10.0332C17.2578 11.9785 16.4941 13.8008 15.1191 15.1641Z" fill="white"></path></svg> :
            order?.b_options?.createdBy?.toLowerCase() === 'sms' ?
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M17.5 2.5H2.5C1.675 2.5 1 3.175 1 4V16C1 16.825 1.675 17.5 2.5 17.5H17.5C18.325 17.5 19 16.825 19 16V4C19 3.175 18.325 2.5 17.5 2.5ZM17.5 5L10 10L2.5 5V4L10 9L17.5 4V5Z" fill="white"/>
              </svg> :
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M6.5 14.5L14.5 6.5M14.5 6.5L11.5 6M14.5 6.5L14.5 9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
          }
        </span>
      )}

      <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
      <span className="mini-order__time colored">{routeDurationText}</span>

      <span className="mini-order__meta-row">
        <span
          className={cn('mini-order__status-icon', `mini-order__status-icon--${statusView.key}`)}
          title={statusView.label}
          aria-label={statusView.label}
        >
          <img src={getMiniOrderStatusIcon(statusView.key)} alt="" aria-hidden="true" />
        </span>
      </span>

      <div className={cn('mini-order__amount', { '_blue': payment.type === EPaymentType.Customer })}>
        <div className="amount__value">{CURRENCY.SIGN}</div>
        <div className="amount__value">
          {payment.value + (order?.b_options?.pricingModel?.calculationType === 'incomplete' ? '+?' : '')}
        </div>
        {offerOrder && (
          <div className="amount__hint">
            {t(TRANSLATION.CLIENT_OFFER_DESIRED_PRICE_LABEL)}
          </div>
        )}
      </div>
      {(profitText || relativeProfitText) && (
        <div className="mini-order__profit">
          {profitText}
          {relativeProfitText && (
            <span className="mini-order__profit-relative">{relativeProfitText}</span>
          )}
        </div>
      )}
    </div>
  </>)
}

export default connector(MiniOrder)