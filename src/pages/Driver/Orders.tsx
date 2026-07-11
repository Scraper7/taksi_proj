import React, { useEffect, useMemo, useRef, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import cn from 'classnames'
import {
  EBookingDriverState, EColorTypes, EStatuses,
  IUser, IOrder,
} from '../../types/types'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { modalsActionCreators } from '../../state/modals'
import { userActionCreators } from '../../state/user'
import { IUserState } from '../../state/user/constants'
import { IRootState } from '../../state'
import { configSelectors } from '../../state/config'
import { t, TRANSLATION } from '../../localization'
import PageSection from '../../components/PageSection'
import StatusCard from '../../components/Card/OrderCard'
import Separator from '../../components/separator/Separator'
import Button from '../../components/Button'
import images from '../../constants/images'
import MiniOrder from '../../components/MiniOrder'
import { statuses } from '../../constants/miniOrders'
import { TABS } from '../../components/passenger-order/tabs-switcher'
import { EDriverTabs } from '.'
import { addHiddenOrder } from '../../tools/utils'
import { isAnyBrowserEmulatorOrder, isBrowserEmulatorRunning } from '../../tools/emulatorMode'
import { writeFlowEvent } from '../../tools/flowLog'
import { writeRawLog } from '../../tools/rawLog'
import { summarizeOrder } from '../../tools/frontendLog'
import { isVotingOrder } from '../../tools/driverOffer'
import './styles.scss'

const mapDispatchToProps = {
  setTakePassengerModal: modalsActionCreators.setTakePassengerModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  closeAllModals: modalsActionCreators.closeAllModals,
  setUser: userActionCreators.setUser,
}

const mapStateToProps = (state: IRootState) => ({
  language: configSelectors.language(state),
})

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUserState['user'],
  activeOrders: IOrder[] | null,
  historyOrders: IOrder[] | null,
  readyOrders: IOrder[] | null,
  type: Omit<EDriverTabs, EDriverTabs.Map>,
}
const DriverOrders: React.FC<IProps> = ({
  user,
  activeOrders,
  readyOrders,
  historyOrders,
  type,
  setTakePassengerModal,
  setMessageModal,
  closeAllModals,
  setUser,
  language,
}) => {
  const languageIso = language?.iso
  const [showCandidateOrders, setShowCandidateOrders] = useState(true)
  const [showReadyOrders, setShowReadyOrders] = useState(true)
  const [showHistoryOrders, setShowHistoryOrders] = useState(false)
  const [statusID, setStatusID] = useState(statuses[0].id)
  const [hiddenOrderIds, setHiddenOrderIds] = useState<string[]>(() => getHiddenOrderIds(user?.u_id))
  const [selectedOrderId, setSelectedOrderId] = useState<IOrder['b_id'] | null>(null)
  const orderCardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const lastDriverOrdersRenderLogKeyRef = useRef('')
  const lastDriverOrderCardLogKeyRef = useRef('')
  const lastDriverVisibleOrderIdsRef = useRef<string[]>([])
  const loggedDriverOrderSnapshotIdsRef = useRef<Record<string, true>>({})

  useEffect(() => {
    if (!selectedOrderId) return

    const frame = window.requestAnimationFrame(() => {
      orderCardRefs.current[String(selectedOrderId)]?.scrollIntoView({
        block: 'nearest',
        inline: 'center',
        behavior: 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(frame)
  }, [selectedOrderId, languageIso])

  const setOrderCardRef = (id: IOrder['b_id']) => (element: HTMLDivElement | null) => {
    orderCardRefs.current[String(id)] = element
  }

  const navigate = useNavigate()

  const handleOrderClick = (id: string) => navigate(`/driver-order/${id}`)

  const handleDrovePassengerClick = () => {
    API.setOutDrive(true)
      .then(API.getAuthorizedUser)
      .then((user) => setUser(user))
  }

  useEffect(() => {
    const updateHiddenOrders = () => setHiddenOrderIds(getHiddenOrderIds(user?.u_id))
    updateHiddenOrders()
    window.addEventListener('hiddenOrdersChanged', updateHiddenOrders)
    window.addEventListener('storage', updateHiddenOrders)
    return () => {
      window.removeEventListener('hiddenOrdersChanged', updateHiddenOrders)
      window.removeEventListener('storage', updateHiddenOrders)
    }
  }, [user?.u_id])

  const emulatorOrdersVisible = isBrowserEmulatorRunning('clients') || isBrowserEmulatorRunning('drivers')

  const visibleActiveOrders = useMemo(() =>
    activeOrders?.filter(item =>
      !hiddenOrderIds.includes(item.b_id) &&
      (!isAnyBrowserEmulatorOrder(item) || emulatorOrdersVisible || isDriverActuallyAssigned(item, user?.u_id))
    ) ?? null
  , [activeOrders, hiddenOrderIds.join('|'), emulatorOrdersVisible, user?.u_id])
  const visibleReadyOrders = useMemo(() =>
    readyOrders?.filter(item =>
      !hiddenOrderIds.includes(item.b_id) &&
      (!isAnyBrowserEmulatorOrder(item) || emulatorOrdersVisible)
    ) ?? null
  , [readyOrders, hiddenOrderIds.join('|'), emulatorOrdersVisible])

  const candidateOrders = visibleActiveOrders?.filter(item => {
    return (
      item.drivers?.length &&
      item.drivers.find(i => i.u_id === user?.u_id && i.c_state === EBookingDriverState.Considering)
    )
  })

  const activeOrdersWithoutCandidates = visibleActiveOrders?.filter(item => !candidateOrders?.includes(item))
  const hasActiveOrders = Boolean(activeOrdersWithoutCandidates?.length)

  useEffect(() => {
    const visibleSections = [
      ...((activeOrdersWithoutCandidates ?? []).map(order => ({ section: 'active', order }))),
      ...(showCandidateOrders ? (candidateOrders ?? []).map(order => ({ section: 'candidate', order })) : []),
      ...(showReadyOrders ? (visibleReadyOrders ?? []).map(order => ({ section: 'ready', order })) : []),
      ...(showHistoryOrders ? (historyOrders ?? []).map(order => ({ section: 'history', order })) : []),
    ]
    const visibleOrderIds = visibleSections.map(item => String(item.order.b_id))
    const renderKey = JSON.stringify({
      tab: type,
      userId: user?.u_id ?? null,
      rawActive: (activeOrders ?? []).map(order => order.b_id),
      visibleActive: (visibleActiveOrders ?? []).map(order => order.b_id),
      activeCards: (activeOrdersWithoutCandidates ?? []).map(order => order.b_id),
      candidateCards: (candidateOrders ?? []).map(order => order.b_id),
      readyCards: (visibleReadyOrders ?? []).map(order => order.b_id),
      historyCards: showHistoryOrders ? (historyOrders ?? []).map(order => order.b_id) : [],
      hiddenOrderIds,
      showCandidateOrders,
      showReadyOrders,
      showHistoryOrders,
    })

    if (renderKey !== lastDriverOrdersRenderLogKeyRef.current) {
      lastDriverOrdersRenderLogKeyRef.current = renderKey
      const previousVisibleOrderIds = lastDriverVisibleOrderIdsRef.current
      const addedVisibleOrderIds = visibleOrderIds.filter(orderId => !previousVisibleOrderIds.includes(orderId))
      const removedVisibleOrderIds = previousVisibleOrderIds.filter(orderId => !visibleOrderIds.includes(orderId))
      lastDriverVisibleOrderIdsRef.current = visibleOrderIds

      const renderedSummary = {
        tab: type,
        userId: user?.u_id ?? null,
        rawActiveOrdersCount: activeOrders?.length ?? null,
        rawReadyOrdersCount: readyOrders?.length ?? null,
        rawHistoryOrdersCount: historyOrders?.length ?? null,
        visibleActiveOrdersCount: visibleActiveOrders?.length ?? null,
        activeCardsCount: activeOrdersWithoutCandidates?.length ?? 0,
        candidateCardsCount: candidateOrders?.length ?? 0,
        visibleReadyOrdersCount: visibleReadyOrders?.length ?? null,
        visibleHistoryOrdersCount: showHistoryOrders ? historyOrders?.length ?? null : 0,
        hiddenOrderIds,
        emulatorOrdersVisible,
        showCandidateOrders,
        showReadyOrders,
        showHistoryOrders,
      }
      writeFlowEvent('DRIVER_ORDER_LIST_UPDATED', {
        screen: 'DriverOrders',
        uiState: String(type),
        data: {
          ...renderedSummary,
          visibleOrdersCount: visibleOrderIds.length,
          orderIds: visibleOrderIds,
          addedOrderIds: addedVisibleOrderIds,
          removedOrderIds: removedVisibleOrderIds,
        },
      })
      writeRawLog('DRIVER_ORDER_LIST_UPDATED', {
        source: 'driver-orders-ui',
        screen: 'DriverOrders',
        uiState: String(type),
        visibleOrdersCount: visibleOrderIds.length,
        orderIds: visibleOrderIds,
        addedOrderIds: addedVisibleOrderIds,
        removedOrderIds: removedVisibleOrderIds,
        ...renderedSummary,
      })

      addedVisibleOrderIds.forEach(orderId => {
        const item = visibleSections.find(section => String(section.order.b_id) === String(orderId))
        if (!item)
          return

        writeFlowEvent('ORDER_BECAME_VISIBLE', {
          orderId: item.order.b_id,
          screen: 'DriverOrders',
          uiState: String(type),
          data: {
            section: item.section,
            order: summarizeOrder(item.order),
            userId: user?.u_id ?? null,
          },
        })
        writeRawLog('ORDER_BECAME_VISIBLE', {
          source: 'driver-orders-ui',
          screen: 'DriverOrders',
          uiState: String(type),
          orderId: item.order.b_id,
          section: item.section,
          order: summarizeOrder(item.order),
          userId: user?.u_id ?? null,
        })

        if (!loggedDriverOrderSnapshotIdsRef.current[String(item.order.b_id)]) {
          loggedDriverOrderSnapshotIdsRef.current[String(item.order.b_id)] = true
          writeFlowEvent('ORDER_SNAPSHOT', {
            orderId: item.order.b_id,
            screen: 'DriverOrders',
            uiState: String(type),
            data: {
              reason: 'first_visible_in_driver_order_list',
              section: item.section,
              order: item.order,
            },
          })
          writeRawLog('ORDER_SNAPSHOT', {
            source: 'driver-orders-ui',
            screen: 'DriverOrders',
            uiState: String(type),
            orderId: item.order.b_id,
            reason: 'first_visible_in_driver_order_list',
            section: item.section,
            order: item.order,
          })
        }
      })

      removedVisibleOrderIds.forEach(orderId => {
        writeFlowEvent('ORDER_REMOVED', {
          orderId,
          screen: 'DriverOrders',
          uiState: String(type),
          data: {
            reason: 'not_in_visible_driver_order_list',
            remainingOrderIds: visibleOrderIds,
          },
        })
        writeRawLog('ORDER_REMOVED', {
          source: 'driver-orders-ui',
          screen: 'DriverOrders',
          uiState: String(type),
          orderId,
          reason: 'not_in_visible_driver_order_list',
          remainingOrderIds: visibleOrderIds,
        })
      })

      writeFlowEvent('ORDERS_LIST_RENDERED', {
        screen: 'DriverOrders',
        uiState: String(type),
        data: renderedSummary,
      })
      writeFlowEvent('ACTIVE_ORDERS_RENDERED', {
        screen: 'DriverOrders',
        uiState: String(type),
        data: renderedSummary,
      })
      writeRawLog('ACTIVE_ORDERS_RENDERED', {
        source: 'driver-orders-ui',
        screen: 'DriverOrders',
        uiState: String(type),
        ...renderedSummary,
      })
      writeFlowEvent('ORDERS_VISIBLE_ON_SCREEN', {
        screen: 'DriverOrders',
        uiState: String(type),
        data: {
          tab: type,
          userId: user?.u_id ?? null,
          visibleOrderIds,
          visibleSections: visibleSections.map(item => ({
            section: item.section,
            orderId: item.order.b_id,
            orderState: item.order.b_state,
            driversCount: item.order.drivers?.length ?? 0,
          })),
        },
      })
    }

    const cardsKey = visibleSections
      .map(item => `${item.section}:${item.order.b_id}:${item.order.b_state}:${item.order.drivers?.length ?? 0}`)
      .join('|')
    if (cardsKey === lastDriverOrderCardLogKeyRef.current)
      return

    lastDriverOrderCardLogKeyRef.current = cardsKey
    visibleSections.forEach((item, index) => {
      writeFlowEvent('ORDER_CARD_RENDERED', {
        orderId: item.order.b_id,
        screen: 'DriverOrders',
        uiState: String(type),
        data: {
          section: item.section,
          index,
          order: summarizeOrder(item.order),
          userId: user?.u_id ?? null,
        },
      })
    })
  }, [
    type,
    user?.u_id,
    activeOrders?.map(order => `${order.b_id}:${order.b_state}:${order.drivers?.length ?? 0}`).join('|'),
    readyOrders?.map(order => `${order.b_id}:${order.b_state}:${order.drivers?.length ?? 0}`).join('|'),
    historyOrders?.map(order => `${order.b_id}:${order.b_state}:${order.drivers?.length ?? 0}`).join('|'),
    visibleActiveOrders?.map(order => order.b_id).join('|'),
    activeOrdersWithoutCandidates?.map(order => order.b_id).join('|'),
    candidateOrders?.map(order => order.b_id).join('|'),
    visibleReadyOrders?.map(order => order.b_id).join('|'),
    hiddenOrderIds.join('|'),
    emulatorOrdersVisible,
    showCandidateOrders,
    showReadyOrders,
    showHistoryOrders,
  ])

  const shownVotingNotifications = useRef<Record<string, string>>({})
  const previousVotingCandidateOrders = useRef<IOrder[]>([])
  useEffect(() => {
    if (!user?.u_id || !activeOrders)
      return

    const activeOrderIds = new Set(activeOrders.map(order => order.b_id))
    for (const previousOrder of previousVotingCandidateOrders.current) {
      const notificationKey = `${previousOrder.b_id}:closed`
      if (
        !activeOrderIds.has(previousOrder.b_id) &&
        shownVotingNotifications.current[previousOrder.b_id] !== notificationKey
      ) {
        shownVotingNotifications.current[previousOrder.b_id] = notificationKey
        const isTimeout = isVotingOrderExpired(previousOrder)
        if (isTimeout)
          addHiddenOrder(previousOrder.b_id, user.u_id)
        closeAllModals()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Warning,
          message: t(isTimeout ?
            TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT :
            TRANSLATION.DRIVER_VOTING_CLOSED_BY_OTHER),
        })
      }
    }

    const nextVotingCandidateOrders: IOrder[] = []
    for (const order of activeOrders) {
      if (!isVotingOrder(order))
        continue

      const currentDriver = order.drivers?.find(driver => driver.u_id === user.u_id)
      if (!currentDriver)
        continue

      if (currentDriver.c_state === EBookingDriverState.Considering)
        nextVotingCandidateOrders.push(order)

      if (
        currentDriver.c_state === EBookingDriverState.Considering &&
        isVotingOrderExpired(order)
      ) {
        const notificationKey = `${order.b_id}:timeout`
        if (shownVotingNotifications.current[order.b_id] !== notificationKey) {
          shownVotingNotifications.current[order.b_id] = notificationKey
          addHiddenOrder(order.b_id, user.u_id)
          closeAllModals()
          setMessageModal({
            isOpen: true,
            status: EStatuses.Warning,
            message: t(TRANSLATION.DRIVER_VOTING_CLOSED_TIMEOUT),
          })
        }
        continue
      }

      const assignedDriver = order.drivers?.find(driver =>
        driver.c_state === EBookingDriverState.Performer,
      )

      if (!assignedDriver)
        continue

      const notificationKey = `${order.b_id}:${assignedDriver.u_id}`
      if (shownVotingNotifications.current[order.b_id] === notificationKey)
        continue
      shownVotingNotifications.current[order.b_id] = notificationKey

      if (assignedDriver.u_id === user.u_id) {
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: 'Клиент выбрал вас. Подъезжайте к клиенту, после посадки клиент назовёт код посадки.',
        })
      } else if (currentDriver.c_state === EBookingDriverState.Considering) {
        closeAllModals()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Warning,
          message: t(TRANSLATION.DRIVER_VOTING_CLOSED_BY_OTHER),
        })
      }
    }
    previousVotingCandidateOrders.current = nextVotingCandidateOrders
  }, [activeOrders, user?.u_id, setMessageModal, closeAllModals])

  return (
    <PageSection className="driver" scrollable={false}>
      {
        (
          SITE_CONSTANTS.LIST_OF_MODES_USED[TABS.WAITING.id] ||
            SITE_CONSTANTS.LIST_OF_MODES_USED[TABS.VOTING.id]
        ) && (
          user?.out_drive ?
            <Button
              text={t(TRANSLATION.DROVE_PASSENGER)}
              onClick={handleDrovePassengerClick}
              imageProps={{
                src: images.people,
              }}
              colorType={EColorTypes.Accent}
            /> :
            <Button
              text={t(TRANSLATION.TOOK_PASSENGER)}
              onClick={() => setTakePassengerModal({ isOpen: true })}
              imageProps={{
                src: images.people,
              }}
              colorType={EColorTypes.Accent}
            />
        )
      }
      {hasActiveOrders ? (
        <div
          className="driver-orders driver-orders--active driver-orders--scroll"
        >
          {activeOrdersWithoutCandidates!.map(item => (
            type === EDriverTabs.Lite ?
              <MiniOrder
                user={user as IUser}
                order={item}
                onClick={() => handleOrderClick(item.b_id)}
                onSelect={setSelectedOrderId}
                isSelected={selectedOrderId === item.b_id}
                innerRef={setOrderCardRef(item.b_id)}
                key={item.b_id}
              /> :
              <StatusCard
                className="driver-order-wide-mode-status-card"
                style={{ boxShadow: '0px 1px 7px rgba(0, 0, 0, 0.23)', border: 'none' }}
                onClick={() => handleOrderClick(item.b_id)}
                onSelect={setSelectedOrderId}
                isSelected={selectedOrderId === item.b_id}
                key={item.b_id}
                order={item}
                user={user as IUser}
              />
          ))}
        </div>
      ) : (
        <div className='driver-orders-empty driver-orders-empty--standalone'>{t(TRANSLATION.NO_ACTUAL_DRIVE)}</div>
      )}
      {!!candidateOrders?.length && (
        <>
          <Separator
            onClick={() => setShowCandidateOrders(prev => !prev)}
            src={showCandidateOrders ? images.minusCircle : images.plusCircle}
            text={t(TRANSLATION.CANDIDATE)}
          />
          <div
            className={cn('driver-orders', {
              'driver-orders--active': showCandidateOrders,
              'driver-orders--scroll': showCandidateOrders,
            })}
          >
            {
              (candidateOrders?.length && candidateOrders?.map(item => (
                type === EDriverTabs.Lite ?
                  <MiniOrder
                    user={user as IUser}
                    order={item}
                    onClick={() => handleOrderClick(item.b_id)}
                    onSelect={setSelectedOrderId}
                    isSelected={selectedOrderId === item.b_id}
                    innerRef={setOrderCardRef(item.b_id)}
                    key={item.b_id}
                    isHistory={false}
                  /> :
                  <StatusCard
                    className="driver-order-wide-mode-status-card"
                    style={{ boxShadow: '0px 1px 7px rgba(0, 0, 0, 0.23)', border: 'none' }}
                    onClick={() => handleOrderClick(item.b_id)}
                    onSelect={setSelectedOrderId}
                    isSelected={selectedOrderId === item.b_id}
                    key={item.b_id}
                    order={item}
                    user={user as IUser}
                  />
              ))) || <div>{t(TRANSLATION.NO_ACTUAL_DRIVE)}</div>
            }
          </div>
        </>
      )}
      <Separator
        onClick={() => setShowReadyOrders(prev => !prev)}
        active={showReadyOrders}
        text={t(TRANSLATION.ACTUAL)}
      />
      <div
        className={cn('driver-orders driver-orders--ready', { 'driver-orders--active': showReadyOrders })}
      >
        <div className="driver-statuses">
          {
            statuses.map(status => {
              return (
                <span
                  key={status.id}
                  onClick={() => {
                    setStatusID(status.id)
                  }}
                >
                  <div className={status.className}/>
                  <label>
                    {status.id === statusID ? t(status.label) : t(status.label)[0]}
                  </label>
                </span>
              )
            })
          }
        </div>
        <div className="driver-orders__list driver-orders__list--ready">
          {
            visibleReadyOrders?.map(item => (
              type === EDriverTabs.Lite ?
              <MiniOrder
                user={user as IUser}
                order={item}
                onClick={() => handleOrderClick(item.b_id)}
                onSelect={setSelectedOrderId}
                isSelected={selectedOrderId === item.b_id}
                innerRef={setOrderCardRef(item.b_id)}
                key={item.b_id}
                isHistory={false}
              /> :
              <StatusCard
                style={{ boxShadow: '0px 1px 7px rgba(0, 0, 0, 0.23)', border: 'none' }}
                onClick={() => handleOrderClick(item.b_id)}
                onSelect={setSelectedOrderId}
                isSelected={selectedOrderId === item.b_id}
                key={item.b_id}
                order={item}
                user={user as IUser}
              />
            ))
          }
        </div>
      </div>
      <Separator
        text={t(TRANSLATION.ORDERS_HISTORY)}
        active={showHistoryOrders}
        onClick={() => setShowHistoryOrders(prev => !prev)}
      />
      <div
        className={cn('driver-orders driver-orders--history', { 'driver-orders--active': showHistoryOrders })}
      >
        <div className="driver-orders__list driver-orders__list--history">
          {
            historyOrders?.map(item => (
              type === EDriverTabs.Lite ?
              <MiniOrder
                user={user as IUser}
                order={item}
                onClick={() => handleOrderClick(item.b_id)}
                onSelect={setSelectedOrderId}
                isSelected={selectedOrderId === item.b_id}
                innerRef={setOrderCardRef(item.b_id)}
                key={item.b_id}
                isHistory={true}
              /> :
              <StatusCard
                className="driver-order-wide-mode-status-card"
                style={{ boxShadow: '0px 1px 7px rgba(0, 0, 0, 0.23)', border: 'none' }}
                onClick={() => handleOrderClick(item.b_id)}
                onSelect={setSelectedOrderId}
                isSelected={selectedOrderId === item.b_id}
                key={item.b_id}
                order={item}
                user={user as IUser}
              />
            ))
          }
        </div>
      </div>
    </PageSection>
  )
}


function isDriverActuallyAssigned(order: IOrder, userID?: string) {
  if (!userID)
    return false

  return !!order.drivers?.some(driver =>
    driver.u_id === userID &&
    [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(driver.c_state),
  )
}

export default connector(DriverOrders)

function getHiddenOrderIds(userID?: IUser['u_id']): string[] {
  if (!userID)
    return []

  try {
    const hiddenOrders = JSON.parse(localStorage.getItem('hiddenOrders') || '{}')
    return Array.isArray(hiddenOrders?.[userID]) ? hiddenOrders[userID] : []
  } catch {
    return []
  }
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
