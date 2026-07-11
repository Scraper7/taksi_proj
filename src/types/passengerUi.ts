export type PassengerUiState =
  | 'DRAFT'
  | 'SEARCHING_DRIVER'
  | 'CANDIDATE_SELECTION'
  | 'DRIVER_ASSIGNED'
  | 'DRIVER_ARRIVED'
  | 'TRIP_STARTED'
  | 'TRIP_FINISHED'
  | 'CANCELLED'
  | 'LEGACY_CHOICE_ORDER'

export type PassengerUiHeader =
  | 'mini-orders'
  | 'searching'
  | 'candidates'
  | 'assigned'
  | 'arrived'
  | 'started'
  | 'finished'
  | 'none'

export type PassengerUiBottomSheet =
  | 'draft'
  | 'searching'
  | 'candidates'
  | 'assigned'
  | 'arrived'
  | 'trip'
  | 'finished'
  | 'legacy'

export type PassengerUiPopup = 'none' | 'arrival' | 'rating'

export type PassengerUiTimerKind = 'none' | 'search' | 'onWay' | 'trip'

export interface PassengerUiConfig {
  state: PassengerUiState
  header: PassengerUiHeader
  bottomSheet: PassengerUiBottomSheet
  popup: PassengerUiPopup
  pinBottomSheet: boolean
  showChat: boolean
  showCancel: boolean
  showFinishTrip: boolean
  showTripTimer: boolean
  timerKind: PassengerUiTimerKind
  visibleBlocks: string[]
  mapMode: 'draft' | 'selected-order'
  legacy: boolean
}
