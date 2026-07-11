import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import cn from 'classnames'
import { connect, ConnectedProps } from 'react-redux'
import { EBookingDriverState, EStatuses, IOrder } from '../../types/types'
import { getPassengerConfirmedChoice, isChoiceOrder, isStoredSimpleOrderMode } from '../../tools/driverOffer'
import { candidateMode } from '../../tools/order'
import { useSwipe } from '../../tools/swipe'
import * as API from '../../API'
import { IRootState } from '../../state'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import { ordersSelectors, ordersActionCreators } from '../../state/orders'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import MiniOrders from '../../components/MiniOrders'
import Map from '../../components/Map'
import Layout from '../../components/Layout'
import PageSection from '../../components/PageSection'
import BoundaryButtons from '../../components/BoundaryButtons'
import PassengerLiveOrder from '../../components/PassengerLiveOrder'
import VotingForm, { IRequestOrderDraft } from './VotingForm'
import './styles.scss'
import { t, TRANSLATION } from '../../localization'
import { configSelectors } from '../../state/config'
import { writeFlowEvent } from '../../tools/flowLog'
import { resolvePassengerUiConfig } from './uiFsm'
import { isPassengerUiFsmEnabled } from './fsmFeature'

const mapStateToProps = (state: IRootState) => ({
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  user: userSelectors.user(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  setVoteModal: modalsActionCreators.setVoteModal,
  setDriverModal: modalsActionCreators.setDriverModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setCancelModal: modalsActionCreators.setCancelModal,
  setOnTheWayModal: modalsActionCreators.setOnTheWayModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setCandidatesModal: modalsActionCreators.setCandidatesModal,
  watchActiveOrders: ordersActionCreators.watchActiveOrders,
  refreshActiveOrders: ordersActionCreators.refreshActiveOrders,
  setFrom: clientOrderActionCreators.setFrom,
  setTo: clientOrderActionCreators.setTo,
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  resetClientOrder: clientOrderActionCreators.reset,
  setPickupPrice: clientOrderActionCreators.setPickupPrice,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

function getReverseGeocodeText(response: any) {
  const address = String(response?.display_name || '').trim()
  const details = response?.address || {}
  const road = [details.road, details.house_number].filter(Boolean).join(', ')
  const locality = details.city || details.town || details.village || details.suburb || details.neighbourhood || details.county
  const shortAddress = String([road, locality].filter(Boolean).join(', ') || address).trim()

  return {
    address,
    shortAddress: shortAddress || address,
  }
}

interface IProps extends ConnectedProps<typeof connector> { }

function Passenger({
  activeOrders,
  selectedOrder: selectedOrderID,
  user,
  language,
  setVoteModal,
  setDriverModal,
  setMessageModal,
  setCancelModal,
  setOnTheWayModal,
  setRatingModal,
  setCandidatesModal,
  watchActiveOrders,
  refreshActiveOrders,
  setFrom,
  setTo,
  setSelectedOrder,
  resetClientOrder,
  setPickupPrice,
}: IProps) {

  const languageIso = language?.iso

  const mapCenter = useRef<[lat: number, lng: number]>(null)
  const mapPointRequestId = useRef({ from: 0, to: 0 })
  const setMapCenter = useCallback((value: [number, number]) => {
    mapCenter.current = value
  }, [])

  const formContainerRef = useRef<HTMLDivElement>(null)
  const draggableRef = useRef<HTMLDivElement>(null)
  const minimizedPartRef = useRef<HTMLElement>(null)
  const formSlidersRef = useRef<HTMLElement[]>([])
  const { isExpanded, setIsExpanded } = useSwipe(
    formContainerRef, draggableRef,
    minimizedPartRef, formSlidersRef,
  )

  const setPointAsMapCenter = useCallback((type: 'from' | 'to') => {
    if (!mapCenter.current)
      return

    const [latitude, longitude] = mapCenter.current
    const setPoint = type === 'from' ? setFrom : setTo
    const requestId = mapPointRequestId.current[type] + 1
    mapPointRequestId.current[type] = requestId

    // Сразу ставим координаты, чтобы клик по карте работал даже если геокодер
    // временно не ответил. Адрес подтянется ниже и заменит координаты.
    setPoint({
      latitude,
      longitude,
      address: t(TRANSLATION.MAP_ADDRESS_LOADING),
      shortAddress: t(TRANSLATION.MAP_ADDRESS_LOADING),
      isAddressResolving: true,
    })

    API.reverseGeocode(String(latitude), String(longitude))
      .then(response => {
        if (mapPointRequestId.current[type] !== requestId)
          return

        const { address, shortAddress } = getReverseGeocodeText(response)
        if (!address)
          return

        setPoint({
          latitude,
          longitude,
          address,
          shortAddress: shortAddress || address,
          isAddressResolving: false,
        })
      })
      .catch(error => {
        // OSM/HERE может не ответить в аэропортах/в дороге. Координаты уже стоят,
        // заказ не должен ломаться из-за отсутствия текстового адреса.
        console.error(error)
        if (mapPointRequestId.current[type] !== requestId)
          return

        setPoint({
          latitude,
          longitude,
          address: t(TRANSLATION.ADDRESS_NOT_SPECIFIED),
          shortAddress: t(TRANSLATION.ADDRESS_NOT_SPECIFIED),
          isAddressResolving: false,
        })
      })

    if (isExpanded)
      setIsExpanded(false)
  }, [isExpanded, setFrom, setTo, setIsExpanded])

  const setFromAsMapCenter = useCallback(() => {
    setPointAsMapCenter('from')
  }, [setPointAsMapCenter])

  const setToAsMapCenter = useCallback(() => {
    setPointAsMapCenter('to')
  }, [setPointAsMapCenter])

  const [submittedOrderId, setSubmittedOrderId] = useState<IOrder['b_id'] | null>(null)
  const [submittedOrderDraft, setSubmittedOrderDraft] = useState<IRequestOrderDraft | null>(null)
  const [isCreatingAnotherOrder, setIsCreatingAnotherOrder] = useState(false)
  const [cancelRequestedOrderId, setCancelRequestedOrderId] = useState<IOrder['b_id'] | null>(null)

  const selectedOrder = useMemo(() =>
    !isCreatingAnotherOrder && selectedOrderID ?
      activeOrders?.find((item) => item.b_id === selectedOrderID) ?? null :
      null
  , [activeOrders, selectedOrderID, isCreatingAnotherOrder])

  const submittedOrder = useMemo(() =>
    submittedOrderId ?
      activeOrders?.find((item) => item.b_id === submittedOrderId) ?? null :
      null
  , [activeOrders, submittedOrderId])

  useEffect(() => {
    if (submittedOrder) {
      writeFlowEvent('ORDER_CREATED', {
        orderId: submittedOrder.b_id,
        screen: 'PassengerOrderScreen',
        uiState: 'OrderVisibleInActiveOrders',
        data: getPassengerFlowOrderData(submittedOrder, 'OrderVisibleInActiveOrders'),
      })
      setIsCreatingAnotherOrder(false)
      setSelectedOrder(submittedOrder.b_id)
      setSubmittedOrderId(null)
      setSubmittedOrderDraft(null)
      setIsExpanded(false)
    }
  }, [submittedOrder?.b_id, setSelectedOrder, setIsExpanded])

  useEffect(() => {
    if (submittedOrderId !== null)
      return

    if (!selectedOrder) {
      // Не сворачиваем нижнюю панель на каждом polling activeOrders, когда пользователь
      // просто заполняет новую заявку. Раньше refresh через несколько секунд делал
      // setIsExpanded(false) при selectedOrder=null, из-за чего форма сама схлопывалась.
      // Сворачиваем только если реально был выбран заказ, но он исчез из activeOrders.
      if (activeOrders && selectedOrderID) {
        setIsExpanded(false)
        setSelectedOrder(null)
      }
    }
  }, [activeOrders, selectedOrder?.b_id, selectedOrderID, submittedOrderId, setSelectedOrder, setIsExpanded])

  useEffect(() => {
    if (!cancelRequestedOrderId || selectedOrderID !== null)
      return

    if (submittedOrderId === cancelRequestedOrderId) {
      setSubmittedOrderId(null)
      setSubmittedOrderDraft(null)
      setIsCreatingAnotherOrder(false)
      setIsExpanded(false)
      refreshActiveOrders()
    }

    setCancelRequestedOrderId(null)
  }, [
    cancelRequestedOrderId,
    selectedOrderID,
    submittedOrderId,
    setIsExpanded,
    refreshActiveOrders,
  ])

  const selectedOrderDriver = useMemo(() => {
    if (!selectedOrder?.drivers)
      return undefined

    const confirmedChoiceId = getPassengerConfirmedChoice(selectedOrder.b_id)
    const confirmedDriver = confirmedChoiceId ? selectedOrder.drivers.find(item =>
      String(item.u_id) === String(confirmedChoiceId) &&
      item.c_state !== EBookingDriverState.Canceled,
    ) : undefined

    if (confirmedDriver)
      return confirmedDriver

    if (isRequestChoiceOrder(selectedOrder) || (candidateMode(selectedOrder) && !isStoredSimpleOrderMode(selectedOrder))) {
      // Пока идёт подбор водителей/кандидатов, не считаем Performer выбранным
      // водителем. Иначе статус сверху прыгает в «Водитель едет» до выбора.
      return undefined
    }

    return selectedOrder.drivers.find(item => [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(item.c_state))
  }, [selectedOrder])

  const passengerUiConfig = useMemo(() => resolvePassengerUiConfig({
    selectedOrder,
    submittedOrderId,
    isCreatingAnotherOrder,
    selectedDriver: selectedOrderDriver ?? null,
  }), [
    selectedOrder?.b_id,
    selectedOrder?.b_state,
    selectedOrder?.drivers?.map(driver => `${driver.u_id}:${driver.c_state}`).join('|'),
    submittedOrderId,
    isCreatingAnotherOrder,
    selectedOrderDriver?.u_id,
    selectedOrderDriver?.c_state,
  ])

  const passengerUiFsmEnabled = useMemo(() => isPassengerUiFsmEnabled(), [])
  const effectivePassengerUiConfig = passengerUiFsmEnabled ? passengerUiConfig : undefined

  useEffect(() => {
    writeFlowEvent('PASSENGER_UI_FSM_RESOLVED', {
      orderId: selectedOrder?.b_id ?? submittedOrderId ?? null,
      screen: 'PassengerOrderScreen',
      uiState: passengerUiConfig.state,
      data: {
        enabled: passengerUiFsmEnabled,
        state: passengerUiConfig.state,
        bottomSheet: passengerUiConfig.bottomSheet,
        mapMode: passengerUiConfig.mapMode,
        pinBottomSheet: passengerUiConfig.pinBottomSheet,
        legacy: passengerUiConfig.legacy,
        selectedDriverState: selectedOrderDriver?.c_state ?? null,
      },
    })
  }, [
    passengerUiFsmEnabled,
    passengerUiConfig.state,
    passengerUiConfig.bottomSheet,
    passengerUiConfig.mapMode,
    passengerUiConfig.pinBottomSheet,
    passengerUiConfig.legacy,
    selectedOrder?.b_id,
    submittedOrderId,
    selectedOrderDriver?.c_state,
  ])

  useEffect(() => {
    if (
      selectedOrder &&
      isRequestChoiceOrder(selectedOrder) &&
      !selectedOrderDriver &&
      selectedOrder.drivers?.some(driver => driver.c_state === EBookingDriverState.Considering)
    ) {
      // Когда пришли предложения водителей, открываем нижнюю панель со списком.
      // Это не выбор водителя: назначение остаётся только по кнопке "Выбрать".
      setIsExpanded(true)
    }
  }, [
    selectedOrder?.b_id,
    selectedOrderDriver?.u_id,
    selectedOrder?.drivers?.map(driver => `${driver.u_id}:${driver.c_state}`).join('|'),
    setIsExpanded,
  ])

  useEffect(watchActiveOrders, [])

  const openCurrentModal = () => {
    setVoteModal(false)
    setDriverModal(false)
    setOnTheWayModal(false)
    setCandidatesModal(false)

    if (selectedOrder)
      setIsExpanded(true)
  }

  useEffect(() => {
    onDriverStateChange()
  }, [selectedOrderDriver?.c_state])

  const onDriverStateChange = () => {
    setVoteModal(false)
    setDriverModal(false)
    setOnTheWayModal(false)
    setCandidatesModal(false)
  }

  const [orderReselected, setOrderReselected] = useState(false)
  useEffect(() => {
    if (orderReselected) {
      openCurrentModal()
      setOrderReselected(false)
    }
  }, [orderReselected])

  const prevActiveOrders = useRef<IOrder[]>([])
  const previousDriverStates = useRef<Record<string, EBookingDriverState>>({})
  const previousFlowSnapshot = useRef<Record<string, IOrderFlowSnapshot>>({})
  const finishedRatingShownRef = useRef<Record<string, true>>({})
  const tripCodeGeneratedLoggedRef = useRef<Record<string, true>>({})
  useEffect(() => {
    const nextSnapshots: Record<string, IOrderFlowSnapshot> = {}

    for (const order of activeOrders ?? []) {
      const orderId = String(order.b_id)
      const drivers = order.drivers ?? []
      const driverIds = drivers
        .map(driver => String(driver.u_id ?? ''))
        .filter(Boolean)
      const previous = previousFlowSnapshot.current[orderId]
      const confirmedChoiceId = getPassengerConfirmedChoice(order.b_id)
      const uiState = getPassengerFlowUiState(order, confirmedChoiceId)
      const orderData = getPassengerFlowOrderData(order, uiState)
      const driverStates: Record<string, EBookingDriverState> = {}
      const driverCodes = String((order as any).b_driver_code || '')

      drivers.forEach(driver => {
        const driverId = String(driver.u_id ?? '')
        if (driverId)
          driverStates[driverId] = driver.c_state
      })

      if (!previous) {
        writeFlowEvent('ORDER_STATUS_CHANGED', {
          orderId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: orderData,
        })

        if (driverIds.length > 0) {
          writeFlowEvent('FIRST_DRIVER_DETECTED', {
            orderId,
            driverId: driverIds[0],
            screen: 'PassengerOrderScreen',
            uiState,
            data: { ...orderData, driversCount: driverIds.length },
          })
          writeFlowEvent('CANDIDATE_LIST_UPDATED', {
            orderId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: { ...orderData, driverIds, driversCount: driverIds.length },
          })
          driverIds.forEach(driverId => writeFlowEvent('CANDIDATE_ADDED', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: orderData,
          }))
        }
      } else {
        if (previous.orderState !== order.b_state) {
          writeFlowEvent('ORDER_STATUS_CHANGED', {
            orderId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: {
              ...orderData,
              previousState: previous.orderState,
              nextState: order.b_state,
            },
          })
        }

        const previousIds = new Set(previous.driverIds)
        const nextIds = new Set(driverIds)
        const addedIds = driverIds.filter(driverId => !previousIds.has(driverId))
        const removedIds = previous.driverIds.filter(driverId => !nextIds.has(driverId))

        if (addedIds.length || removedIds.length || previous.driverIds.length !== driverIds.length) {
          writeFlowEvent('CANDIDATE_LIST_UPDATED', {
            orderId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: { ...orderData, driverIds, addedIds, removedIds, driversCount: driverIds.length },
          })
        }

        addedIds.forEach(driverId => writeFlowEvent('CANDIDATE_ADDED', {
          orderId,
          driverId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: orderData,
        }))

        removedIds.forEach(driverId => writeFlowEvent('CANDIDATE_REMOVED', {
          orderId,
          driverId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: orderData,
        }))
      }

      if (confirmedChoiceId && previous?.confirmedChoiceId !== String(confirmedChoiceId)) {
        const selectedDriverRank = driverIds.indexOf(String(confirmedChoiceId)) + 1
        writeFlowEvent('SELECT_DRIVER', {
          orderId,
          driverId: confirmedChoiceId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: {
            ...orderData,
            rank: selectedDriverRank > 0 ? selectedDriverRank : null,
          },
        })
        writeFlowEvent('CLIENT_SELECTED_DRIVER', {
          orderId,
          driverId: confirmedChoiceId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: {
            ...orderData,
            rank: selectedDriverRank > 0 ? selectedDriverRank : null,
            reason: 'client_confirmed_choice',
          },
        })
        writeFlowEvent('DRIVER_ASSIGNED', {
          orderId,
          driverId: confirmedChoiceId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: {
            ...orderData,
            rank: selectedDriverRank > 0 ? selectedDriverRank : null,
            reason: 'confirmed_choice_saved',
          },
        })
        writeFlowEvent('DRIVER_CONFIRMED', {
          orderId,
          driverId: confirmedChoiceId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: {
            ...orderData,
            rank: selectedDriverRank > 0 ? selectedDriverRank : null,
            reason: 'confirmed_choice_saved',
          },
        })
      }

      if (driverCodes && !tripCodeGeneratedLoggedRef.current[orderId]) {
        tripCodeGeneratedLoggedRef.current[orderId] = true
        writeFlowEvent('TRIP_CODE_GENERATED', {
          orderId,
          driverId: confirmedChoiceId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: { ...orderData, hasCode: true, code: driverCodes },
        })
      }

      drivers.forEach(driver => {
        const driverId = String(driver.u_id ?? '')
        if (!driverId)
          return

        const previousState = previous?.driverStates?.[driverId]
        if (previousState === driver.c_state)
          return

        writeFlowEvent('DRIVER_STATUS_CHANGED', {
          orderId,
          driverId,
          screen: 'PassengerOrderScreen',
          uiState,
          data: {
            ...orderData,
            previousState,
            nextState: driver.c_state,
            driverStateText: getDriverFlowStateName(driver.c_state),
          },
        })

        if (driver.c_state === EBookingDriverState.Performer) {
          writeFlowEvent('DRIVER_STARTED_MOVING_TO_CLIENT', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: orderData,
          })
          writeFlowEvent('DRIVER_MOVING_TO_CLIENT', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: {
              ...orderData,
              reason: 'driver_state_performer',
            },
          })
        }

        if (driver.c_state === EBookingDriverState.Arrived) {
          writeFlowEvent('DRIVER_ARRIVED', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: orderData,
          })
        }

        if (driver.c_state === EBookingDriverState.Started) {
          writeFlowEvent('TRIP_STARTED', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: orderData,
          })
        }

        if (driver.c_state === EBookingDriverState.Finished) {
          writeFlowEvent('TRIP_FINISHED', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: orderData,
          })
        }

        if (driver.c_state === EBookingDriverState.Canceled) {
          writeFlowEvent('DRIVER_STOPPED_MOVING_TO_CLIENT', {
            orderId,
            driverId,
            screen: 'PassengerOrderScreen',
            uiState,
            data: orderData,
          })
        }
      })

      nextSnapshots[orderId] = {
        orderState: order.b_state,
        driverIds,
        driverStates,
        confirmedChoiceId: confirmedChoiceId ? String(confirmedChoiceId) : null,
        driverCode: driverCodes,
      }
    }

    previousFlowSnapshot.current = nextSnapshots
  }, [activeOrders, setPickupPrice])

  useEffect(() => {
    (async() => {

      const activeOrdersIds = new Set(
        activeOrders?.map(order => order.b_id) ?? [],
      )
      for (const order of prevActiveOrders.current) {
        if (activeOrdersIds.has(order.b_id))
          continue

        const driver = order.drivers
          ?.find(item => item.c_state === EBookingDriverState.Finished) ||
          order.drivers?.find(item => item.c_state !== EBookingDriverState.Canceled)
        if (!driver)
          continue

        if (driver.c_state <= EBookingDriverState.Started) {
          try {
            const res = await API.getOrder(order.b_id)
            const resDriver = res?.drivers
              ?.find(item => item.c_state !== EBookingDriverState.Canceled)
            if (resDriver?.c_state === EBookingDriverState.Finished) {
              writeFlowEvent('TRIP_FINISHED', {
                orderId: order.b_id,
                driverId: resDriver.u_id,
                screen: 'PassengerOrderScreen',
                uiState: 'RemovedOrderFinishCheck',
                data: {
                  source: 'fetch_removed_active_order',
                  finishedAt: resDriver.c_completed || order.b_completed || null,
                  driverState: resDriver.c_state,
                },
              })
              writeFlowEvent('REVIEW_ELIGIBILITY_CHECK', {
                orderId: order.b_id,
                driverId: resDriver.u_id,
                screen: 'PassengerOrderScreen',
                uiState: 'RemovedOrderFinishCheck',
                data: {
                  result: true,
                  reason: 'trip_finished_after_removed_order_fetch',
                  driverState: resDriver.c_state,
                },
              })
              writeFlowEvent('REVIEW_REQUESTED', {
                orderId: order.b_id,
                driverId: resDriver.u_id,
                screen: 'PassengerOrderScreen',
                uiState: 'RemovedOrderFinishCheck',
                data: {
                  reason: 'open_rating_after_removed_order_finished',
                },
              })
              finishedRatingShownRef.current[String(order.b_id)] = true
              setPickupPrice(null)
              setRatingModal({ isOpen: true, orderID: order.b_id })
              break
            }

            writeFlowEvent('REVIEW_ELIGIBILITY_CHECK', {
              orderId: order.b_id,
              driverId: resDriver?.u_id || driver.u_id,
              screen: 'PassengerOrderScreen',
              uiState: 'RemovedOrderFinishCheck',
              data: {
                result: false,
                reason: 'trip_not_finished_after_removed_order_fetch',
                driverState: resDriver?.c_state ?? null,
              },
            })
          } catch (error) {
            console.error(error)
          }
        }
      }

    })()

    const nextDriverStates: Record<string, EBookingDriverState> = {}
    for (const order of activeOrders ?? []) {
      for (const driver of order.drivers ?? []) {
        const key = `${order.b_id}:${driver.u_id}`
        const previousState = previousDriverStates.current[key]
        nextDriverStates[key] = driver.c_state

        if (
            (previousState === undefined || previousState !== EBookingDriverState.Arrived) &&
            driver.c_state === EBookingDriverState.Arrived &&
            String(selectedOrderID ?? '') === String(order.b_id)
          ) {
          setIsCreatingAnotherOrder(false)
          setSelectedOrder(order.b_id)
          setIsExpanded(true)
          setMessageModal({
            isOpen: true,
            status: EStatuses.Success,
            kind: 'passenger-driver-arrived',
            orderID: order.b_id,
            message: t(TRANSLATION.CLIENT_DRIVER_ARRIVED),
          })
        }

        if (
          previousState &&
          previousState !== EBookingDriverState.Started &&
          driver.c_state === EBookingDriverState.Started
        ) {
          setMessageModal({ isOpen: false, status: EStatuses.Default, message: '' })
        }

        if (
          (previousState === undefined || previousState !== EBookingDriverState.Finished) &&
          driver.c_state === EBookingDriverState.Finished &&
          !finishedRatingShownRef.current[String(order.b_id)]
        ) {
          writeFlowEvent('REVIEW_ELIGIBILITY_CHECK', {
            orderId: order.b_id,
            driverId: driver.u_id,
            screen: 'PassengerOrderScreen',
            uiState: 'ActiveOrderFinishDetected',
            data: {
              result: true,
              reason: 'driver_state_finished',
              driverState: driver.c_state,
              finishedAt: driver.c_completed || order.b_completed || null,
            },
          })
          writeFlowEvent('REVIEW_REQUESTED', {
            orderId: order.b_id,
            driverId: driver.u_id,
            screen: 'PassengerOrderScreen',
            uiState: 'ActiveOrderFinishDetected',
            data: {
              reason: 'open_rating_after_driver_finished',
            },
          })
          finishedRatingShownRef.current[String(order.b_id)] = true
          setPickupPrice(null)
          setIsCreatingAnotherOrder(false)
          setSelectedOrder(order.b_id)
          setMessageModal({ isOpen: false, status: EStatuses.Default, message: '' })
          setRatingModal({ isOpen: true, orderID: order.b_id })
        }
      }
    }
    previousDriverStates.current = nextDriverStates
    prevActiveOrders.current = activeOrders ?? []
  }, [activeOrders, setPickupPrice])

  const handleOrderClick = useCallback((order: IOrder) => {
    setIsCreatingAnotherOrder(false)
    setSelectedOrder(order.b_id)
    setOrderReselected(true)
  }, [setSelectedOrder])

  const handleNewOrderClick = useCallback(() => {
    resetClientOrder()
    setIsCreatingAnotherOrder(true)
    setSubmittedOrderId(null)
    setSubmittedOrderDraft(null)
    setSelectedOrder(null)
    setIsExpanded(false)
  }, [resetClientOrder, setSelectedOrder, setIsExpanded])

  const handleLockedCancel = useCallback((orderId: IOrder['b_id']) => {
    writeFlowEvent('ORDER_CANCEL_REQUESTED_BY_CLIENT', {
      orderId,
      screen: 'PassengerOrderScreen',
      uiState: 'CancelModalOpened',
      data: { orderId },
    })
    setIsCreatingAnotherOrder(false)
    setCancelRequestedOrderId(orderId)
    setSelectedOrder(orderId)
    setCancelModal(true)
  }, [setSelectedOrder, setCancelModal])

  const onSubmit = useCallback((data: { b_id: IOrder['b_id'] }, draft?: IRequestOrderDraft) => {
    if (!data?.b_id)
      return

    writeFlowEvent('CREATE_ORDER', {
      orderId: data.b_id,
      screen: 'PassengerOrderScreen',
      uiState: 'OrderSubmittedWaitingBackend',
      data: {
        orderId: data.b_id,
        isOffer: Boolean(draft?.isOffer),
        isVoting: Boolean(draft?.isVoting),
      },
    })
    writeFlowEvent('ORDER_SEARCH_STARTED', {
      orderId: data.b_id,
      screen: 'PassengerOrderScreen',
      uiState: 'SearchingDrivers',
      data: {
        orderId: data.b_id,
        isOffer: Boolean(draft?.isOffer),
        isVoting: Boolean(draft?.isVoting),
      },
    })

    setSubmittedOrderId(data.b_id)
    setSubmittedOrderDraft(draft ?? null)
    setIsCreatingAnotherOrder(false)
    setSelectedOrder(null)
    setIsExpanded(false)
  }, [setSelectedOrder, setIsExpanded])

  const waitingForSubmittedOrder = submittedOrderId !== null && !selectedOrder

  const shouldKeepRequestForm = Boolean(selectedOrder)
  const showLiveOrderPanel = false

  const votingFormContent = useMemo(() =>
    <VotingForm
      isExpanded={isExpanded}
      setIsExpanded={setIsExpanded}
      syncFrom={setFromAsMapCenter}
      syncTo={setToAsMapCenter}
      onSubmit={onSubmit}
      lockedOrder={shouldKeepRequestForm ? selectedOrder : null}
      lockedDraft={waitingForSubmittedOrder ? submittedOrderDraft : null}
      lockedOrderId={shouldKeepRequestForm ? selectedOrder?.b_id : submittedOrderId}
      onLockedCancel={handleLockedCancel}
      onNewOrder={handleNewOrderClick}
      minimizedPartRef={minimizedPartRef}
      noSwipeElementsRef={formSlidersRef}
      uiConfig={effectivePassengerUiConfig}
    />
  , [
    languageIso,
    isExpanded, setIsExpanded,
    setFromAsMapCenter, setToAsMapCenter,
    onSubmit,
    shouldKeepRequestForm, selectedOrder, waitingForSubmittedOrder, submittedOrderDraft,
    submittedOrderId, handleLockedCancel, handleNewOrderClick, effectivePassengerUiConfig,
  ])

  const miniOrdersContent = useMemo(() =>
    <MiniOrders
      className="passenger__mini-orders"
      handleOrderClick={handleOrderClick}
      uiConfig={effectivePassengerUiConfig}
    />
  , [handleOrderClick, languageIso, effectivePassengerUiConfig])
  const shouldPinPassengerPanel = passengerUiFsmEnabled ?
    passengerUiConfig.pinBottomSheet :
    isDriverArrivedOrStarted(selectedOrderDriver?.c_state)

  return (
    <Layout>
      <PageSection className="passenger" scrollable={false}>

        {miniOrdersContent}

        {useMemo(() =>
          <Map
            containerClassName={cn('passenger__form-map-container', {
              'passenger__form-map-container--live-order': showLiveOrderPanel,
            })}
            forceFreeMode={passengerUiFsmEnabled ? passengerUiConfig.mapMode === 'draft' : isCreatingAnotherOrder}
            setCenter={setMapCenter}
          />
        , [setMapCenter, selectedOrder?.b_id, showLiveOrderPanel, isCreatingAnotherOrder, passengerUiFsmEnabled, passengerUiConfig.mapMode, languageIso])}

        <div className="passenger__form-placeholder" />

        <div
          ref={formContainerRef}
          className={cn('passenger__form-container', {
            'passenger__form-container--live-order': showLiveOrderPanel,
            'passenger__form-container--pinned': shouldPinPassengerPanel,
          })}
        >
          {useMemo(() => <BoundaryButtons />, [languageIso])}
          <div
            className={cn('passenger__draggable', {
              'passenger__draggable--live-order': showLiveOrderPanel,
              'passenger__draggable--pinned': shouldPinPassengerPanel,
            })}
            ref={draggableRef}
          >
            <div className="passenger__swipe-line"></div>

            {showLiveOrderPanel && selectedOrder ? (
              <PassengerLiveOrder order={selectedOrder} onNewOrder={handleNewOrderClick} />
            ) : votingFormContent}
          </div>
        </div>

      </PageSection>
    </Layout>
  )
}

export default connector(Passenger)

interface IOrderFlowSnapshot {
  orderState?: IOrder['b_state']
  driverIds: string[]
  driverStates: Record<string, EBookingDriverState>
  confirmedChoiceId: string | null
  driverCode: string
}

function getPassengerFlowOrderData(order: IOrder, uiState: string) {
  return {
    orderId: order.b_id,
    orderState: order.b_state,
    uiState,
    driversCount: order.drivers?.length ?? 0,
    start: {
      latitude: order.b_start_latitude,
      longitude: order.b_start_longitude,
      address: order.b_start_address,
    },
    destination: {
      latitude: order.b_destination_latitude,
      longitude: order.b_destination_longitude,
      address: order.b_destination_address,
    },
  }
}

function getPassengerFlowUiState(order: IOrder, confirmedChoiceId: unknown) {
  const drivers = order.drivers ?? []
  const selectedDriver = confirmedChoiceId ? drivers.find(driver => String(driver.u_id) === String(confirmedChoiceId)) : undefined

  if (selectedDriver?.c_state === EBookingDriverState.Finished)
    return 'TripFinishedWaitingReview'
  if (selectedDriver?.c_state === EBookingDriverState.Started)
    return 'TripInProgress'
  if (selectedDriver?.c_state === EBookingDriverState.Arrived)
    return 'DriverArrivedWaitingBoardingCode'
  if (selectedDriver?.c_state === EBookingDriverState.Performer)
    return 'SelectedDriverMovingToClient'
  if (confirmedChoiceId)
    return 'DriverSelectedWaitingState'
  if (drivers.length > 0)
    return 'WaitingClientChooseDriver'
  return 'SearchingDrivers'
}

function getDriverFlowStateName(state?: EBookingDriverState) {
  switch (state) {
    case EBookingDriverState.Considering:
      return 'CONSIDERING'
    case EBookingDriverState.Canceled:
      return 'CANCELED'
    case EBookingDriverState.Performer:
      return 'PERFORMER'
    case EBookingDriverState.Arrived:
      return 'ARRIVED'
    case EBookingDriverState.Started:
      return 'STARTED'
    case EBookingDriverState.Finished:
      return 'FINISHED'
    default:
      return 'UNKNOWN'
  }
}

function isRequestChoiceOrder(order: IOrder | null | undefined) {
  return Boolean(order && isChoiceOrder(order))
}

function isDriverArrivedOrStarted(state?: EBookingDriverState) {
  return [
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(state as EBookingDriverState)
}
