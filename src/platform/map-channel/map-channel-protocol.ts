/**
 * Platform Core — протокол канала «карта».
 *
 * Словарь границы: типы Action и Event, их payload, тип прикладного обработчика
 * и прикладной интерфейс шины. Зависит ТОЛЬКО от interaction-contract — ни
 * Mapper, ни Handler, ни конкретная реализация контракта здесь не участвуют.
 *
 * Обе стороны границы (MapMapper и MapApplicationHandler) импортируют этот
 * протокол и ничего не знают друг о друге.
 */

import type {
  InteractionAction,
  InteractionContract,
  InteractionEvent,
  Unsubscribe,
} from '../interaction-contract'

/** Action: водитель выбрал заказ (карта → приложение). */
export const DRIVER_ORDER_SELECT_ACTION = 'driver.order.select'

/** Event: приложение подтвердило выбор заказа (приложение → карта). */
export const DRIVER_ORDER_SELECTED_EVENT = 'driver.order.selected'

/** Канал-источник в metadata контракта. */
export const MAP_CHANNEL_SOURCE = 'map'

/** Payload Action'а driver.order.select. */
export interface IOrderSelectPayload {
  readonly orderId: string
}

/** Payload Event'а driver.order.selected. */
export interface IOrderSelectedPayload {
  readonly orderId: string
}

/**
 * Обработчик Action на стороне приложения.
 *
 * Может быть асинхронным: dispatch ждёт каждый обработчик по очереди, сохраняя
 * порядок регистрации (см. AppInteractionContract).
 */
export type TActionHandler = (action: InteractionAction) => Promise<void> | void

/**
 * Прикладная сторона шины: контракт плюс публикация Event'ов и регистрация
 * обработчиков.
 *
 * Реализуется классом AppInteractionContract. Прикладной обработчик и точка его
 * регистрации зависят от ЭТОГО интерфейса, а не от класса: конкретная
 * реализация шины подменяема без единой правки в Handler'е.
 */
export interface IApplicationContract extends InteractionContract {

  /** Публикация Event приложением — обратное направление контракта. */
  publish(event: InteractionEvent): void

  /** Регистрация прикладного обработчика Action'ов. Возвращает отписку. */
  registerHandler(handler: TActionHandler): Unsubscribe

}
