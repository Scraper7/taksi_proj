/**
 * Platform Core — Mapper канала «карта».
 *
 * Переводит намерение пользователя карты в семантический Action контракта.
 * Через контракт ходят только семантические действия домена (driver.order.select),
 * никогда UI-события вроде marker.clicked / popup.closed.
 *
 * Словарь границы живёт в map-channel-protocol: Mapper его импортирует, но
 * ничего не экспортирует сам, кроме собственно преобразования.
 */

import type { InteractionAction } from '../interaction-contract'
import type { IOrderSelectPayload } from './map-channel-protocol'
import { DRIVER_ORDER_SELECT_ACTION, MAP_CHANNEL_SOURCE } from './map-channel-protocol'

/**
 * Чистая функция: без состояния, без I/O, без Browser API.
 *
 * timestamp и correlationId приходят извне (их порождает транспорт — см.
 * MapChannel), чтобы функция оставалась детерминированной и тестируемой.
 *
 * Невалидный orderId (undefined / пустая строка / одни пробелы) → null: Action
 * не создаётся, вызывающая сторона молча выходит. Исключений в пути клика нет
 * по построению.
 */
export function mapOrderSelectToAction(
  orderId: string,
  timestamp: string,
  correlationId: string,
): InteractionAction<IOrderSelectPayload> | null {
  // Сознательно без сужения типа: значение уходит в payload сырым, ровно таким,
  // каким пришло из заказа (заказы в сторе кэшируются по сырому b_id).
  if (!orderId || !String(orderId).trim())
    return null

  return {
    type: DRIVER_ORDER_SELECT_ACTION,
    payload: { orderId },
    metadata: {
      source: MAP_CHANNEL_SOURCE,
      timestamp,
      correlationId,
    },
  }
}
