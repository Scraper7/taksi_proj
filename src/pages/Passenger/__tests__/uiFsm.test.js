import { EBookingDriverState, EBookingStates } from '../../../types/types'
import fsmConfig from '../fsm_config.json'
import { isPassengerUiFsmEnabled } from '../fsmFeature'
import { resolvePassengerUiConfig, resolvePassengerUiState } from '../uiFsm'

jest.mock('../../../siteConstants', () => ({
  __esModule: true,
  default: {
    PASSENGER_CHOICE_MODE_STORAGE_KEY: 'test_choice_mode',
    PASSENGER_CONFIRMED_CHOICE_STORAGE_KEY: 'test_confirmed_choice',
  },
}))

function makeOrder(overrides = {}) {
  return {
    b_id: 7315,
    b_state: EBookingStates.Processing,
    drivers: [],
    ...overrides,
  }
}

function makeDriver(c_state, overrides = {}) {
  return {
    u_id: 100,
    c_state,
    ...overrides,
  }
}

describe('Passenger UI FSM resolver', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete process.env.REACT_APP_PASSENGER_UI_FSM
  })

  it('keeps draft when there is no selected or submitted order', () => {
    expect(resolvePassengerUiState({ selectedOrder: null, submittedOrderId: null })).toBe('DRAFT')
  })

  it('shows searching state while submitted order is not in activeOrders yet', () => {
    expect(resolvePassengerUiState({ selectedOrder: null, submittedOrderId: 7315 })).toBe('SEARCHING_DRIVER')
  })

  it('derives direct searching when backend order exists but no driver is assigned', () => {
    const config = resolvePassengerUiConfig({ selectedOrder: makeOrder(), submittedOrderId: null })
    expect(config.state).toBe('SEARCHING_DRIVER')
    expect(config.bottomSheet).toBe('searching')
    expect(config.showCancel).toBe(true)
    expect(config.timerKind).toBe('search')
  })

  it('derives assigned, arrived, started and finished from selected driver state', () => {
    const order = makeOrder()
    expect(resolvePassengerUiState({ selectedOrder: order, selectedDriver: makeDriver(EBookingDriverState.Performer) })).toBe('DRIVER_ASSIGNED')
    expect(resolvePassengerUiState({ selectedOrder: order, selectedDriver: makeDriver(EBookingDriverState.Arrived) })).toBe('DRIVER_ARRIVED')
    expect(resolvePassengerUiState({ selectedOrder: order, selectedDriver: makeDriver(EBookingDriverState.Started) })).toBe('TRIP_STARTED')
    expect(resolvePassengerUiState({ selectedOrder: order, selectedDriver: makeDriver(EBookingDriverState.Finished) })).toBe('TRIP_FINISHED')
  })

  it('returns cancelled layout for cancelled order', () => {
    const config = resolvePassengerUiConfig({ selectedOrder: makeOrder({ b_state: EBookingStates.Canceled }) })
    expect(config.state).toBe('CANCELLED')
    expect(config.mapMode).toBe('draft')
    expect(config.bottomSheet).toBe('draft')
  })

  it('marks trip started as pinned and uses trip timer policy', () => {
    const config = resolvePassengerUiConfig({ selectedOrder: makeOrder(), selectedDriver: makeDriver(EBookingDriverState.Started) })
    expect(config.state).toBe('TRIP_STARTED')
    expect(config.pinBottomSheet).toBe(true)
    expect(config.showTripTimer).toBe(true)
    expect(config.timerKind).toBe('trip')
  })

  it('keeps choice/candidate order behind legacy boundary unless separately released', () => {
    const choiceOrder = makeOrder({
      b_voting: true,
      drivers: [makeDriver(EBookingDriverState.Considering)],
    })
    const config = resolvePassengerUiConfig({ selectedOrder: choiceOrder })
    expect(['CANDIDATE_SELECTION', 'LEGACY_CHOICE_ORDER']).toContain(config.state)
    expect(config.legacy).toBe(true)
  })

  it('keeps JSON FSM states in sync with TypeScript resolver states', () => {
    const knownStates = new Set(fsmConfig.states)
    ;['DRAFT', 'SEARCHING_DRIVER', 'CANDIDATE_SELECTION', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_FINISHED', 'CANCELLED'].forEach(state => {
      expect(knownStates.has(state)).toBe(true)
    })
  })

  it('supports storage rollback flag over environment flag', () => {
    process.env.REACT_APP_PASSENGER_UI_FSM = '1'
    window.localStorage.setItem('feature.passenger_ui_fsm', '0')
    expect(isPassengerUiFsmEnabled()).toBe(false)
    window.localStorage.setItem('feature.passenger_ui_fsm', '1')
    expect(isPassengerUiFsmEnabled()).toBe(true)
  })
})
