import React, { useEffect } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import {
  EBookingDriverState,
  EOrderProfitRank,
  IOrder,
  IUser,
} from '../../types/types'
import images from '../../constants/images'
import { CURRENCY } from '../../siteConstants'
import {
  dateFormatDate,
  dateShowFormat,
  formatCommentWithEmoji,
  getOrderCount,
  getPayment,
  shortenAddress,
  formatCurrency,
} from '../../tools/utils'
import { useSelector } from '../../tools/hooks'
import {
  ordersDetailsSelectors,
  ordersDetailsActionCreators,
} from '../../state/ordersDetails'
import { modalsActionCreators } from '../../state/modals'
import { IRootState } from '../../state'
import { configSelectors } from '../../state/config'
import { t, TRANSLATION } from '../../localization'
import { isOfferOrder, isVotingOrder } from '../../tools/driverOffer'
import { Loader } from '../loader/Loader'
import './styles.scss'

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

function getOfferDesiredPrice(order: IOrder) {
  return getNumericValue((order.b_options as any)?.customer_price, order.b_price_estimate)
}

function getOfferCommentText(order: IOrder) {
  return [
    order.b_custom_comment,
    (order.b_options as any)?.customer_comment,
    order.b_options?.from_way,
    order.b_options?.to_way,
  ].filter(Boolean).join('; ')
}

function getAddressString(value?: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function isGeneratedAddressPlaceholder(value?: unknown) {
  const address = getAddressString(value).toLowerCase()
  if (!address) return false

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

function getOrderDestinationText(order: IOrder, destinationAddress?: any) {
  const options = (order.b_options as any) || {}
  const pricingOptions = options?.pricingModel?.options || {}
  return getSafeOrderAddress(
    destinationAddress?.shortAddress,
    destinationAddress?.address,
    options.toAddress,
    options.destinationAddress,
    options.destination,
    options.to,
    pricingOptions.toAddress,
    pricingOptions.destinationAddress,
    options.toShortAddress,
    options.destinationShortAddress,
    pricingOptions.toShortAddress,
    order.b_destination_address,
  )
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

function getOrderStatusKey(order: IOrder, user?: IUser) {
  if (order.b_completed) return 'done'
  if (order.b_canceled || order.b_state === 3) return getCancelStatusKey(order)
  const participation = getDriverParticipationKey(order, user)
  if (participation === 'started') return 'trip'
  if (participation === 'arrived') return 'arrived'
  if (participation === 'assigned') return 'driver-going'
  if (participation === 'candidate') return isOfferOrder(order) ? 'offer-candidate' : 'voting-candidate'
  if (isOfferOrder(order)) return 'offer'
  return isVotingOrder(order) ? 'voting' : 'order'
}

function formatRelativeProfit(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return ''

  return `${formatCurrency(value, { signDisplay: 'always', currencyDisplay: 'none' }).trim()} ${CURRENCY.SIGN}/км хол.`
}

const mapDispatchToProps = {
  getOrderStart: ordersDetailsActionCreators.getOrderStart,
  getOrderDestination: ordersDetailsActionCreators.getOrderDestination,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
}

const mapStateToProps = (state: IRootState) => ({
  language: configSelectors.language(state),
})

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUser,
  order: IOrder,
  className?: string,
  style?: React.CSSProperties,
  onClick?: React.PointerEventHandler<HTMLDivElement>,
  showChat?: boolean,
  onSelect?: (id: IOrder['b_id']) => void,
  isSelected?: boolean
}

function OrderCard({
  getOrderStart,
  getOrderDestination,
  setOrderCardModal,
  order,
  user,
  className,
  showChat,
  style,
  onClick,
  onSelect,
  isSelected,
}: IProps) {

  useEffect(() => {
    getOrderStart(order)
    getOrderDestination(order)
  }, [order])
  let address = useSelector(ordersDetailsSelectors.start, order.b_id)
  if (address && 'details' in address)
    address = {
      ...address,
      shortAddress: shortenAddress(
        address.address,
        address.details.city ||
        address.details.town ||
        address.details.village,
      ),
    }

  let destinationAddress = useSelector(ordersDetailsSelectors.destination, order.b_id)
  if (destinationAddress && 'details' in destinationAddress)
    destinationAddress = {
      ...destinationAddress,
      shortAddress: shortenAddress(
        destinationAddress.address,
        destinationAddress.details.city ||
        destinationAddress.details.town ||
        destinationAddress.details.village,
      ),
    }

  const destinationText = getOrderDestinationText(order, destinationAddress) || t(TRANSLATION.ADDRESS_NOT_SPECIFIED)

  const offerOrder = isOfferOrder(order)
  const votingOrder = isVotingOrder(order)
  const offerDesiredPrice = offerOrder ? getOfferDesiredPrice(order) : undefined
  const offerCommentText = offerOrder ? getOfferCommentText(order) : ''

  const getStatusText = () => {
    if (offerOrder) return t(TRANSLATION.CLIENT_OFFER_ORDER_MODE)
    if (votingOrder) return t(TRANSLATION.VOTER)
    return ''
  }

  const getStatusTextColor = () => {
    if (offerOrder) return '#9A3412'
    if (votingOrder) return '#6D28D9'
    // 'reccomended': return '#00A72F'\
    return 'rgba(0, 0, 0, 0.25)'
  }

  const driver = order.drivers?.find((item: any) => item.c_state > EBookingDriverState.Canceled)
  const profitValue = typeof order.profit === 'number' && Number.isFinite(order.profit) ? order.profit : undefined
  const isNegativeProfit = profitValue !== undefined && profitValue < 0
  const relativeProfitText = formatRelativeProfit(order.profitPerEmptyKm)
  const statusKey = getOrderStatusKey(order, user)
  const participationKey = getDriverParticipationKey(order, user)
  const archiveKey = getOrderArchiveKey(order)

  return (<>
    <div
      className={cn(
        'status-card colored',
        `status-card--status-${statusKey}`,
        `status-card--participation-${participationKey}`,
        `status-card--archive-${archiveKey}`,
        { 'status-card--history': order.b_canceled || order.b_completed },
        { 'status-card--selected': isSelected },
        { 'status-card--profit-negative': isNegativeProfit },
        order.profitRank !== undefined && `status-card--profit--${{
          [EOrderProfitRank.Low]: 'low',
          [EOrderProfitRank.Medium]: 'medium',
          [EOrderProfitRank.High]: 'high',
        }[order.profitRank]}`,
        className,
      )}
      style={style}
      // onClick={onClick}
      onClick={() => {
        onSelect?.(order.b_id)
        setOrderCardModal({ isOpen: true, orderId: order.b_id })
      }}
    >
      {/* {showChat && user ?
        (
          <div id={chatHostDivID} className="order-chat"> */}
      {/* TODO remove ignore */}
      {/* @ts-ignore */}
      {/* <Chat
              parentID={chatHostDivID}
              chatTag={order.b_id}
              userID={user.u_id}
              myName={'me'}
              hisName={'customer'}
              mode={ChatUpdaterMode.DRIVER}
            />
          </div>
        ) :
        null} */}
      <div className="status-card__top" >
        <span className="status-card__time">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" ><path d="M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z" stroke="#FF2400" strokeLinecap="round" strokeLinejoin="round"/><path d="M7.82996 5.33334V8.66668H11.1633" stroke="#FF2400" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <label>
            {
              votingOrder &&
              driver?.c_state !== EBookingDriverState.Finished ?
                t(TRANSLATION.NOW) :
                order.b_start_datetime?.format(
                  order.b_options?.time_is_not_important ? dateFormatDate : dateShowFormat,
                )
            }
          </label>
        </span>
        <span className="status-card__number" style={{ color: getStatusTextColor() }}>№{order.b_id} {getStatusText()}</span>
      </div>
      <div>
        <span className="status-card__points">
          <div className="status-card__from">
            <span className="status-card__from-address">
              {t(TRANSLATION.FROM)}:
              {address ?
                <span>{address?.shortAddress ? address?.shortAddress : address?.address}</span> :
                order.b_start_address ? <span>{order.b_start_address}</span> : <Loader />
              }
              {/* {start?.shortAddress && (
                <img
                  src={isFromAddressShort ? images.minusIcon : images.plusIcon}
                  onClick={(e) => setIsFromAddressShort(prev => !prev)}
                  alt='change address mode'
                />
              )} */}

              {t(TRANSLATION.TO)}:
              <span>{destinationText}</span>
            </span>
          </div>

          {/* <div className="status-card__to">
            <img src={images.turnBr} alt={t(TRANSLATION.TO)}/>
            <span>
              {order.b_destination_address || `${order.b_destination_latitude}, ${order.b_destination_longitude}`}
            </span>
          </div> */}
        </span>
      </div>
      <div className="status-card__separator separate status-card__money">

        {/* <span style={{ color: SITE_CONSTANTS.PALETTE.primary.light }}> */}
        <span className="status-card__cost">
          <img src={images.dollarMinimalistic} alt={t(TRANSLATION.CASH)}/> {getPayment(order).value} {CURRENCY.NAME}
          {offerOrder && (
            <small>{t(TRANSLATION.CLIENT_OFFER_DESIRED_PRICE_LABEL)}</small>
          )}
        </span>

        {(typeof order.profit === 'number' && Number.isFinite(order.profit)) || relativeProfitText ?
          <span className="status-card__profit">
            {typeof order.profit === 'number' && Number.isFinite(order.profit) ?
              formatCurrency(order.profit, { signDisplay: 'always' }) :
              null
            }
            {relativeProfitText && (
              <small className="status-card__profit-relative">{relativeProfitText}</small>
            )}
          </span> :
          null
        }
      </div>

      {offerOrder && (
        <div className="status-card__offer-summary">
          <div className="status-card__offer-badge">{t(TRANSLATION.CLIENT_OFFER_ORDER_MODE)}</div>
          {offerDesiredPrice !== undefined &&
            <span>{t(TRANSLATION.DRIVER_OFFER_DESIRED_PRICE)}: <b>{offerDesiredPrice} {CURRENCY.SIGN}</b></span>
          }
          <span>{t(TRANSLATION.DRIVER_OFFER_PASSENGERS)}: <b>{order.b_passengers_count || 0}</b></span>
          <span>{t(TRANSLATION.DRIVER_OFFER_LUGGAGE)}: <b>{order.b_luggage_count || 0}</b></span>
          {offerCommentText &&
            <span>{t(TRANSLATION.DRIVER_OFFER_CLIENT_COMMENT)}: <b>{offerCommentText}</b></span>
          }
        </div>
      )}

      <div className="status-card__comments">
        <p>{formatCommentWithEmoji(order.b_comments)?.map(({ src }) => <img src={src} />)}</p>
        {
          !(order.b_comments?.includes('97') || order.b_comments?.includes('98')) &&
            <span className='status-card__seats'>
              {/* <img
                src={getOrderIcon(order)}
                alt={t(TRANSLATION.SEATS)}
              /> */}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" ><circle cx="6.00004" cy="4.00001" r="2.66667" stroke="#FF2400"/><path d="M10 6C11.1046 6 12 5.10457 12 4C12 2.89543 11.1046 2 10 2" stroke="#FF2400" strokeLinecap="round"/><ellipse cx="6.00004" cy="11.3333" rx="4.66667" ry="2.66667" stroke="#FF2400"/><path d="M12 9.33334C13.1695 9.58981 14 10.2393 14 11C14 11.6862 13.3242 12.282 12.3333 12.5803" stroke="#FF2400" strokeLinecap="round"/></svg>
              <label>{getOrderCount(order)}</label>
            </span>
        }
      </div>
      {
        // driver?.c_state !== EBookingDriverState.Finished && <div className="status-card__other-info">
        //   <span>
        //     {/* TODO real time */}
        //     {t(TRANSLATION.APPROXIMATE_TIME)}: 1 {t(TRANSLATION.HOUR)}
        //     <img src={images.clockGrey} alt={t(TRANSLATION.CLOCK)}/>
        //   </span>
        //   <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
        // </div>
      }
    </div>
  </>)
}

export default connector(OrderCard)