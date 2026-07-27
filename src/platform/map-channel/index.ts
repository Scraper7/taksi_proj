/**
 * Platform Core — канал «карта» водителя.
 * Единственная точка импорта для прикладного кода карты.
 */

export {
  DRIVER_ORDER_SELECTED_EVENT,
  DRIVER_ORDER_SELECT_ACTION,
  MAP_CHANNEL_SOURCE,
} from './map-channel-protocol'
export type {
  IApplicationContract,
  IOrderSelectedPayload,
  IOrderSelectPayload,
  TActionHandler,
} from './map-channel-protocol'

export { AppInteractionContract } from './AppInteractionContract'

export { MapChannel } from './MapChannel'
export type { TNewId, TNow } from './MapChannel'

export { mapOrderSelectToAction } from './MapMapper'

export { registerMapApplicationHandler } from './MapApplicationHandler'

export { consoleInteractionLogger } from './logger'
export type { IInteractionLogger } from './logger'

export { useMapChannel } from './useMapChannel'
export type { IMapApplicationDeps } from './useMapChannel'
