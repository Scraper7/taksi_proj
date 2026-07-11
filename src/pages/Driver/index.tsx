import React, { createContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DriverOrders from './Orders'
import DriverMap from './Map'
import { t, TRANSLATION } from '../../localization'
import { connect, ConnectedProps } from 'react-redux'
import { IRootState } from '../../state'
import { useQuery } from '../../tools/hooks'
import './styles.scss'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import { carsActionCreators } from '../../state/cars'
import SITE_CONSTANTS from '../../siteConstants'
import { EBookingDriverState, EBookingStates, EStatuses, EUserRoles, IAddressPoint, IOrder } from '../../types/types'
import cn from 'classnames'
import ErrorFrame from '../../components/ErrorFrame'
import images from '../../constants/images'
import { withLayout } from '../../HOCs/withLayout'
import { addHiddenOrder } from '../../tools/utils'
import * as API from '../../API'
import { getOfferEvent, getStoredDriverOffer, isOfferOrder, updateStoredDriverOfferStatus } from '../../tools/driverOffer'
import { BROWSER_EMULATOR_STATE_EVENT, getVisibleBrowserEmulatorOrderIds, isAnyBrowserEmulatorModeRunning } from '../../tools/emulatorMode'
import { isMarkerMockEnabled, MARKER_MOCK_STATE_EVENT } from '../../tools/markerMock'
import { writeFlowEvent } from '../../tools/flowLog'
import { writeRawLog } from '../../tools/rawLog'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  readyOrders: ordersSelectors.readyOrders(state),
  historyOrders: ordersSelectors.historyOrders(state),
  user: userSelectors.user(state),
})

const mapDispatchToProps = {
  watchActiveOrders: ordersActionCreators.watchActiveOrders,
  watchReadyOrders: ordersActionCreators.watchReadyOrders,
  watchHistoryOrders: ordersActionCreators.watchHistoryOrders,
  setLoginModal: modalsActionCreators.setLoginModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  closeAllModals: modalsActionCreators.closeAllModals,
  clearOrders: ordersActionCreators.clearOrders,
  getUserCars: carsActionCreators.getUserCars,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

export const OrderAddressContext = createContext<{ ordersAddressRef: React.RefObject<{
  [orderId: string]: IAddressPoint;
}> }|null>(null)

export enum EDriverTabs {
  Map = 'map',
  Lite = 'lite',
  Detailed = 'detailed'
}

interface IProps extends ConnectedProps<typeof connector> {}

const DRIVER_MAP_VOTING_PARTICIPATION_STORAGE_KEY = 'driverVotingParticipations'


const Driver: React.FC<IProps> = ({
  activeOrders,
  readyOrders,
  historyOrders,
  user,
  watchActiveOrders,
  watchHistoryOrders,
  watchReadyOrders,
  setLoginModal,
  setMessageModal,
  setRatingModal,
  closeAllModals,
  clearOrders,
  getUserCars,
}) => {

  const { tab = EDriverTabs.Lite } = useQuery()

  const navigate = useNavigate()

  const ordersAddressRef = useRef<{ [orderId:string]: IAddressPoint }>({})
  const previousVotingParticipations = useRef<IOrder[]>([])
  const shownVotingTimeoutNotifications = useRef<Record<string, true>>({})
  const previousDriverTripOrders = useRef<IOrder[]>([])
  const previousDriverRelatedOrders = useRef<IOrder[]>([])
  const shownDriverFinishedRatings = useRef<Record<string, true>>({})
  const shownDriverOfferNotifications = useRef<Record<string, string>>({})
  const shownDriverClosedNotifications = useRef<Record<string, true>>({})
  const [emulatorOrdersEnabled, setEmulatorOrdersEnabled] = useState(() => isAnyBrowserEmulatorModeRunning())
  const [markerMockEnabled, setMarkerMockEnabled] = useState(() => isMarkerMockEnabled())

  // Мок-режим маркера: пока он включён, реальный polling заказов к бэку (ibronevik)
  // не запускаем — карта рисует мок-данные, иначе будет мешанина мок + пустые ответы.
  useEffect(() => {
    const sync = () => setMarkerMockEnabled(isMarkerMockEnabled())
    sync()
    window.addEventListener(MARKER_MOCK_STATE_EVENT, sync)
    return () => window.removeEventListener(MARKER_MOCK_STATE_EVENT, sync)
  }, [])

  useEffect(() => {
    if (markerMockEnabled)
      clearOrders()
  }, [markerMockEnabled, clearOrders])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver)
      return undefined

    const syncEmulatorMode = (event?: Event) => {
      const enabled = isAnyBrowserEmulatorModeRunning()
      setEmulatorOrdersEnabled(enabled)
      clearOrders()
      closeAllModals()
      const payload = {
        source: 'driver-page',
        screen: 'Driver',
        uiState: enabled ? 'EmulatorOrdersEnabled' : 'EmulatorOrdersDisabled',
        enabled,
        visibleEmulatorOrderIds: getVisibleBrowserEmulatorOrderIds(),
        eventDetail: (event as CustomEvent | undefined)?.detail ?? null,
      }
      writeFlowEvent(enabled ? 'EMULATOR_MODE_CHANGED' : 'EMULATOR_STOP_CLEARED_UI_STATE', { data: payload })
      writeRawLog(enabled ? 'EMULATOR_MODE_CHANGED' : 'EMULATOR_STOP_CLEARED_UI_STATE', payload)
    }

    syncEmulatorMode()
    window.addEventListener(BROWSER_EMULATOR_STATE_EVENT, syncEmulatorMode)
    return () => window.removeEventListener(BROWSER_EMULATOR_STATE_EVENT, syncEmulatorMode)
  }, [user?.u_role, clearOrders, closeAllModals])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !emulatorOrdersEnabled || markerMockEnabled)
      return
    getUserCars()
    return watchActiveOrders()
  }, [user?.u_role, emulatorOrdersEnabled, markerMockEnabled, watchActiveOrders, getUserCars])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !emulatorOrdersEnabled || markerMockEnabled)
      return
    return watchReadyOrders()
  }, [user?.u_role, emulatorOrdersEnabled, markerMockEnabled, watchReadyOrders])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !emulatorOrdersEnabled || markerMockEnabled)
      return
    return watchHistoryOrders()
  }, [user?.u_role, emulatorOrdersEnabled, markerMockEnabled, watchHistoryOrders])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !user.u_id || !activeOrders)
      return

    const notifyTimeout = (order: IOrder) => {
      if (shownVotingTimeoutNotifications.current[order.b_id])
        return

      shownVotingTimeoutNotifications.current[order.b_id] = true
      addHiddenOrder(order.b_id, user.u_id)
      closeAllModals()
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: t(TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT),
      })
    }

    const activeOrderIds = new Set(activeOrders.map(order => order.b_id))
    for (const previousOrder of previousVotingParticipations.current) {
      if (
        !activeOrderIds.has(previousOrder.b_id) &&
        isDriverVotingCandidate(previousOrder, user.u_id) &&
        isVotingOrderExpired(previousOrder)
      )
        notifyTimeout(previousOrder)
    }

    for (const order of activeOrders) {
      if (
        isDriverVotingCandidate(order, user.u_id) &&
        isVotingOrderExpired(order)
      )
        notifyTimeout(order)
    }

    previousVotingParticipations.current = activeOrders
      .filter(order => isDriverVotingCandidate(order, user.u_id))
  }, [activeOrders, user?.u_id, user?.u_role, setMessageModal, closeAllModals])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !user.u_id || !activeOrders)
      return

    const showFinishedRating = (orderID: IOrder['b_id']) => {
      if (shownDriverFinishedRatings.current[orderID])
        return
      shownDriverFinishedRatings.current[orderID] = true
      closeAllModals()
      setRatingModal({ isOpen: true, orderID })
    }

    const activeOrderIds = new Set(activeOrders.map(order => order.b_id))
    for (const previousOrder of previousDriverTripOrders.current) {
      if (activeOrderIds.has(previousOrder.b_id))
        continue

      API.getOrder(previousOrder.b_id)
        .then(order => {
          if (
            order?.b_completed ||
            order?.drivers?.some(driver =>
              driver.u_id === user.u_id &&
              driver.c_state === EBookingDriverState.Finished,
            )
          )
            showFinishedRating(previousOrder.b_id)
        })
        .catch(error => console.error(error))
    }

    for (const order of activeOrders) {
      if (order.drivers?.some(driver =>
        driver.u_id === user.u_id &&
        driver.c_state === EBookingDriverState.Finished,
      ))
        showFinishedRating(order.b_id)
    }

    previousDriverTripOrders.current = activeOrders.filter(order =>
      order.drivers?.some(driver =>
        driver.u_id === user.u_id &&
        [
          EBookingDriverState.Performer,
          EBookingDriverState.Arrived,
          EBookingDriverState.Started,
        ].includes(driver.c_state),
      ),
    )
  }, [activeOrders, user?.u_id, user?.u_role, setRatingModal, closeAllModals])

  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !user.u_id || !activeOrders)
      return

    const notifyClientCancelled = (orderID: IOrder['b_id']) => {
      if (shownDriverClosedNotifications.current[orderID])
        return

      shownDriverClosedNotifications.current[orderID] = true
      addHiddenOrder(orderID, user.u_id)
      closeAllModals()
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: t(TRANSLATION.DRIVER_ORDER_CANCELLED_BY_CLIENT),
      })
    }

    const activeOrderIds = new Set(activeOrders.map(order => order.b_id))
    for (const previousOrder of previousDriverRelatedOrders.current) {
      if (activeOrderIds.has(previousOrder.b_id))
        continue
      if (isVotingOrderExpired(previousOrder))
        continue

      API.getOrder(previousOrder.b_id)
        .then(order => {
          if (!order || order.b_state === EBookingStates.Canceled)
            notifyClientCancelled(previousOrder.b_id)
        })
        .catch(error => console.error(error))
    }

    for (const order of activeOrders)
      if (
        isDriverRelatedToOrder(order, user.u_id) &&
        order.b_state === EBookingStates.Canceled
      )
        notifyClientCancelled(order.b_id)

    previousDriverRelatedOrders.current = activeOrders.filter(order =>
      isDriverRelatedToOrder(order, user.u_id),
    )
  }, [activeOrders, user?.u_id, user?.u_role, setMessageModal, closeAllModals])

  // driver-offer-realtime-watch
  useEffect(() => {
    if (user?.u_role !== EUserRoles.Driver || !user.u_id || !activeOrders)
      return

    for (const order of activeOrders) {
      if (!isOfferOrder(order))
        continue

      const myDriver = order.drivers?.find(driver => driver.u_id === user.u_id)
      if (!myDriver)
        continue

      const event = getOfferEvent(order, user.u_id) || (
        myDriver.c_state === EBookingDriverState.Performer ? 'accepted' :
          myDriver.c_state === EBookingDriverState.Canceled ? 'rejected' :
            undefined
      )
      if (!event)
        continue

      const key = `${order.b_id}:${event}`
      if (shownDriverOfferNotifications.current[order.b_id] === key)
        continue
      shownDriverOfferNotifications.current[order.b_id] = key

      if (event === 'accepted') {
        updateStoredDriverOfferStatus(order.b_id, user.u_id, 'accepted')
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.DRIVER_OFFER_ACCEPTED),
        })
        continue
      }

      if (event === 'rejected') {
        updateStoredDriverOfferStatus(order.b_id, user.u_id, 'rejected')
        addHiddenOrder(order.b_id, user.u_id)
        closeAllModals()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Warning,
          message: t(TRANSLATION.DRIVER_OFFER_REJECTED),
        })
        continue
      }

      if (event === 'expired') {
        updateStoredDriverOfferStatus(order.b_id, user.u_id, 'expired')
        setMessageModal({
          isOpen: true,
          status: EStatuses.Warning,
          message: t(TRANSLATION.DRIVER_OFFER_EXPIRED),
        })
      }
    }
  }, [activeOrders, user?.u_id, user?.u_role, setMessageModal, closeAllModals])

  if (user?.u_role !== EUserRoles.Driver) {
    return (
      <ErrorFrame
        renderImage={() => (
          <div className="errorIcon" onClick={() => setLoginModal(true)}>
            <img src={images.avatar} alt={t(TRANSLATION.ERROR)} style={{ marginTop: '50px' }}/>
          </div>
        )}
        title={t(TRANSLATION.UNAUTHORIZED_ACCESS)}
      />
    )
  }

  const onFirstTabClick = () => {
    navigate(`/driver-order?tab=${EDriverTabs.Lite}`)
  }

  const onSecondTabClick = () => {
    navigate(`/driver-order?tab=${EDriverTabs.Detailed}`)
  }

  const hideDriverTabsOnActiveMap = tab === EDriverTabs.Map && Boolean(
    activeOrders?.some(order => isDriverMapEngagedOrder(order, user.u_id)),
  )

  return (
    <>
      {!hideDriverTabsOnActiveMap && <div className="driver-tabs">
        <button
          onClick={onFirstTabClick}
          className={cn('driver-tabs__tab', { 'driver-tabs__tab--active': tab === EDriverTabs.Lite })}
        >
          {t(TRANSLATION.LIGHT)}
        </button>
        <button
          onClick={onSecondTabClick}
          className={cn('driver-tabs__tab', { 'driver-tabs__tab--active': tab === EDriverTabs.Detailed })}
        >
          {t(TRANSLATION.ALL)}
        </button>
        <button
          onClick={() => navigate(`/driver-order?tab=${EDriverTabs.Map}`)}
          className={cn('driver-tabs__tab', { 'driver-tabs__tab--active': tab === EDriverTabs.Map })}
        >
          {t(TRANSLATION.MAP)}
        </button>
      </div>}
      {(tab === EDriverTabs.Lite || tab === EDriverTabs.Detailed) &&
        <OrderAddressContext.Provider value={{ ordersAddressRef }}>
          <DriverOrders
            user={user}
            type={tab}
            activeOrders={activeOrders}
            readyOrders={readyOrders}
            historyOrders={historyOrders}
          />
        </OrderAddressContext.Provider>
      }
      {tab === EDriverTabs.Map &&
        <OrderAddressContext.Provider value={{ ordersAddressRef }}>
          <DriverMap
            user={user}
            activeOrders={activeOrders}
            readyOrders={readyOrders}
          />
        </OrderAddressContext.Provider>
      }
    </>
  )
}

export default withLayout(connector(Driver))


function getStoredDriverVotingParticipationIds(): string[] {
  try {
    const value = localStorage.getItem(DRIVER_MAP_VOTING_PARTICIPATION_STORAGE_KEY)
    const parsed = value ? JSON.parse(value) : []
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function isDriverMapEngagedOrder(order: IOrder, userID?: string) {
  if (!userID)
    return false

  const driver = order.drivers?.find(item => item.u_id === userID)
  if (!driver)
    return false

  if ([
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ].includes(driver.c_state))
    return true

  if (driver.c_state !== EBookingDriverState.Considering)
    return false

  if (order.b_voting && getStoredDriverVotingParticipationIds().includes(String(order.b_id)))
    return true

  if (isOfferOrder(order) && getStoredDriverOffer(order.b_id, userID))
    return true

  return false
}

function isDriverVotingCandidate(order: IOrder, userID?: string) {
  if (!order.b_voting || !userID)
    return false

  return !!order.drivers?.some(driver =>
    driver.u_id === userID &&
    driver.c_state === EBookingDriverState.Considering,
  )
}

function isDriverRelatedToOrder(order: IOrder, userID?: string) {
  return !!userID && !!order.drivers?.some(driver => driver.u_id === userID)
}

function isVotingOrderExpired(order: IOrder) {
  if (hasVotingSelectedDriver(order))
    return false

  if (
    typeof order.remaining_lifetime_seconds === 'number' &&
    order.remaining_lifetime_seconds <= 0
  )
    return true

  const createdAt = Number(order.b_created || 0)
  const startAt = Number(order.b_start_datetime || 0)
  const startedAt = Math.max(createdAt, startAt)
  if (!startedAt)
    return false

  const waitingMs = (order.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL) * 1000
  return startedAt + waitingMs <= Date.now()
}

function hasVotingSelectedDriver(order: IOrder) {
  return !!order.drivers?.some(driver => [
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(driver.c_state))
}
