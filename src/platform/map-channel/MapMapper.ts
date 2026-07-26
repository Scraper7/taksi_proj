/**
 * Platform Core — Mapper канала «карта».
 *
 * Переводит намерение пользователя карты в семантический Action контракта.
 * Через контракт ходят только семантические действия домена (driver.order.select),
 * никогда UI-события вроде marker.clicked / popup.closed.
 */

import type { InteractionAction } from '../interaction-contract'

/** Action: водитель выбрал заказ (карта → приложение). */
export const DRIVER_ORDER_SELECT_ACTION = 'driver.order.select'

/** Event: приложение подтвердило выбор заказа (приложение → карта). */
export const DRIVER_ORDER_SELECTED_EVENT = 'driver.order.selected'

/** Канал-источник в metadata контракта. */
export const MAP_CHANNEL_SOURCE = 'map'

export interface IOrderSelectPayload {
  readonly orderId: string
}

/**
 * Чистая функция: без состояния, без I/O, без Browser API.
 * timestamp приходит извне (его порождает транспорт — см. MapChannel),
 * чтобы функция оставалась детерминированной и тестируемой.
 */
export function mapOrderSelectToAction(
  orderId: string,
  timestamp: string,
): InteractionAction<IOrderSelectPayload> {
  return {
    type: DRIVER_ORDER_SELECT_ACTION,
    payload: { orderId },
    metadata: {
      source: MAP_CHANNEL_SOURCE,
      timestamp,
    },
  }
}
