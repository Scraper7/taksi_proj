/**
 * Platform Core — сторона Application для канала «карта».
 *
 * Единственный обработчик Stage 1: на Action driver.order.select публикует
 * Event driver.order.selected. И всё.
 *
 * Про UI обработчик не знает ничего — ни mockEnabled, ни setOrderCardModal:
 * решение «открывать ли карточку» принимает UI-подписчик (см. useMapChannel).
 * Event публикуется ДО любого UI-действия по построению: подписчик получает
 * управление уже после того, как Handler закончил, поэтому рассинхрон
 * «Event ушёл, а модалка упала» невозможен.
 *
 * Handler не импортирует Mapper: обе стороны границы говорят на общем словаре
 * map-channel-protocol.
 */

import type {
  InteractionAction,
  InteractionEvent,
  Unsubscribe,
} from '../interaction-contract'
import type {
  IApplicationContract,
  IOrderSelectedPayload,
  IOrderSelectPayload,
} from './map-channel-protocol'
import {
  DRIVER_ORDER_SELECTED_EVENT,
  DRIVER_ORDER_SELECT_ACTION,
  MAP_CHANNEL_SOURCE,
} from './map-channel-protocol'

/**
 * Регистрация зависит от интерфейса IApplicationContract, а не от класса:
 * реализацию шины можно подменить, не трогая обработчик.
 */
export function registerMapApplicationHandler(contract: IApplicationContract): Unsubscribe {
  return contract.registerHandler((action: InteractionAction) => {
    if (action.type !== DRIVER_ORDER_SELECT_ACTION)
      return

    const payload = action.payload as IOrderSelectPayload | undefined
    const orderId = payload ? payload.orderId : ''
    // Тот же контроль, что и в Mapper: до Event'а доходит только валидное
    // действие. Молча выходим — никаких исключений на стороне Application.
    if (!orderId)
      return

    const event: InteractionEvent<IOrderSelectedPayload> = {
      type: DRIVER_ORDER_SELECTED_EVENT,
      payload: { orderId },
      metadata: {
        source: MAP_CHANNEL_SOURCE,
        timestamp: action.metadata ? action.metadata.timestamp : new Date().toISOString(),
        // correlationId Action'а переезжает в Event: одна цепочка — один id.
        correlationId: action.metadata ? action.metadata.correlationId : undefined,
      },
    }
    contract.publish(event)
  })
}
