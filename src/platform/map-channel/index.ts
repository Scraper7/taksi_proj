/**
 * Platform Core — канал «карта» водителя.
 * Единственная точка импорта для прикладного кода карты.
 */

export { AppInteractionContract } from './AppInteractionContract'
export type { TActionHandler } from './AppInteractionContract'

export { MapChannel } from './MapChannel'
export type { TNow } from './MapChannel'

export {
  DRIVER_ORDER_SELECTED_EVENT,
  DRIVER_ORDER_SELECT_ACTION,
  MAP_CHANNEL_SOURCE,
  mapOrderSelectToAction,
} from './MapMapper'
export type { IOrderSelectPayload } from './MapMapper'

export { registerMapApplicationHandler } from './MapApplicationHandler'
export type { IMapApplicationDeps } from './MapApplicationHandler'

export { useMapChannel } from './useMapChannel'
