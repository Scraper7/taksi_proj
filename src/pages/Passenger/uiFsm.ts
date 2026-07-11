import { EBookingDriverState, EBookingStates, IDriver, IOrder } from '../../types/types'
import { candidateMode } from '../../tools/order'
import {
  getPassengerConfirmedChoice,
  isChoiceOrder,
  isStoredSimpleOrderMode,
} from '../../tools/driverOffer'
import { PassengerUiConfig, PassengerUiState } from '../../types/passengerUi'

export interface PassengerUiFacts {
  selectedOrder?: IOrder | null
  submittedOrderId?: IOrder['b_id'] | null
  isCreatingAnotherOrder?: boolean
  selectedDriver?: IDriver | null
}


function safeCandidateMode(order?: IOrder | null): boolean {
  try {
    return Boolean(order && candidateMode(order))
  } catch {
    return false
  }
}

function baseConfig(state: PassengerUiState): PassengerUiConfig {
  return {
    state,
    header: 'mini-orders',
    bottomSheet: 'draft',
    popup: 'none',
    pinBottomSheet: false,
    showChat: false,
    showCancel: false,
    showFinishTrip: false,
    showTripTimer: false,
    timerKind: 'none',
    visibleBlocks: ['map', 'miniOrders'],
    mapMode: 'draft',
    legacy: false,
  }
}

function getSelectedSimpleDriver(order?: IOrder | null): IDriver | null {
  if (!order)
    return null

  const confirmedChoiceId = getPassengerConfirmedChoice(order.b_id)
  const drivers = order.drivers ?? []

  if (confirmedChoiceId) {
    return drivers.find(driver =>
      String(driver.u_id) === String(confirmedChoiceId) &&
      driver.c_state !== EBookingDriverState.Canceled,
    ) ?? null
  }

  if (isChoiceOrder(order) || (safeCandidateMode(order) && !isStoredSimpleOrderMode(order)))
    return null

  return drivers.find(driver => [
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(driver.c_state)) ?? null
}

export function resolvePassengerUiState(facts: PassengerUiFacts): PassengerUiState {
  const { selectedOrder, submittedOrderId, isCreatingAnotherOrder } = facts

  if (isCreatingAnotherOrder || (!selectedOrder && !submittedOrderId))
    return 'DRAFT'

  if (
    selectedOrder &&
    (isChoiceOrder(selectedOrder) || (safeCandidateMode(selectedOrder) && !isStoredSimpleOrderMode(selectedOrder)))
  ) {
    const hasCandidates = Boolean((selectedOrder.drivers ?? []).some(driver =>
      driver.c_state !== EBookingDriverState.Canceled,
    ))

    return hasCandidates ? 'CANDIDATE_SELECTION' : 'LEGACY_CHOICE_ORDER'
  }

  if (!selectedOrder && submittedOrderId)
    return 'SEARCHING_DRIVER'

  if (!selectedOrder)
    return 'DRAFT'

  if (selectedOrder.b_state === EBookingStates.Canceled)
    return 'CANCELLED'

  const driver = facts.selectedDriver ?? getSelectedSimpleDriver(selectedOrder)

  if (driver?.c_state === EBookingDriverState.Finished || selectedOrder.b_state === EBookingStates.Completed)
    return 'TRIP_FINISHED'

  if (driver?.c_state === EBookingDriverState.Started)
    return 'TRIP_STARTED'

  if (driver?.c_state === EBookingDriverState.Arrived)
    return 'DRIVER_ARRIVED'

  if (driver?.c_state === EBookingDriverState.Performer)
    return 'DRIVER_ASSIGNED'

  return 'SEARCHING_DRIVER'
}

export function resolvePassengerUiConfig(facts: PassengerUiFacts): PassengerUiConfig {
  const state = resolvePassengerUiState(facts)
  const config = baseConfig(state)

  switch (state) {
    case 'DRAFT':
      return {
        ...config,
        bottomSheet: 'draft',
        visibleBlocks: ['map', 'miniOrders', 'draftRouteInputs', 'draftOptions', 'draftSubmitButtons'],
        mapMode: 'draft',
      }
    case 'CANDIDATE_SELECTION':
      return {
        ...config,
        header: 'candidates',
        bottomSheet: 'candidates',
        showCancel: true,
        visibleBlocks: ['map', 'miniOrders', 'readonlyRoute', 'candidateList', 'priceInput', 'cancelButton'],
        mapMode: 'selected-order',
        legacy: true,
      }
    case 'LEGACY_CHOICE_ORDER':
      return {
        ...config,
        bottomSheet: 'legacy',
        showCancel: true,
        visibleBlocks: ['map', 'miniOrders', 'legacyVotingForm'],
        mapMode: 'selected-order',
        legacy: true,
      }
    case 'SEARCHING_DRIVER':
      return {
        ...config,
        header: 'searching',
        bottomSheet: 'searching',
        showCancel: true,
        timerKind: 'search',
        visibleBlocks: ['map', 'miniOrders', 'readonlyRoute', 'searchStatus', 'cancelButton'],
        mapMode: 'selected-order',
      }
    case 'DRIVER_ASSIGNED':
      return {
        ...config,
        header: 'assigned',
        bottomSheet: 'assigned',
        showChat: true,
        showCancel: true,
        timerKind: 'onWay',
        visibleBlocks: ['map', 'miniOrders', 'readonlyRoute', 'driverCard', 'chatButton', 'cancelButton'],
        mapMode: 'selected-order',
      }
    case 'DRIVER_ARRIVED':
      return {
        ...config,
        header: 'arrived',
        bottomSheet: 'arrived',
        popup: 'arrival',
        pinBottomSheet: true,
        showChat: true,
        visibleBlocks: ['map', 'miniOrders', 'readonlyRoute', 'driverCard', 'boardingCode', 'chatButton'],
        mapMode: 'selected-order',
      }
    case 'TRIP_STARTED':
      return {
        ...config,
        header: 'started',
        bottomSheet: 'trip',
        pinBottomSheet: true,
        showFinishTrip: true,
        showTripTimer: true,
        timerKind: 'trip',
        visibleBlocks: ['map', 'miniOrders', 'readonlyRoute', 'driverCard', 'finishButton', 'sosButton'],
        mapMode: 'selected-order',
      }
    case 'TRIP_FINISHED':
      return {
        ...config,
        header: 'finished',
        bottomSheet: 'finished',
        popup: 'rating',
        pinBottomSheet: true,
        visibleBlocks: ['map', 'miniOrders', 'tripSummary'],
        mapMode: 'selected-order',
      }
    case 'CANCELLED':
      return {
        ...config,
        header: 'none',
        bottomSheet: 'draft',
        visibleBlocks: ['map', 'miniOrders', 'draftRouteInputs', 'draftOptions', 'draftSubmitButtons'],
        mapMode: 'draft',
      }
    default:
      return config
  }
}
