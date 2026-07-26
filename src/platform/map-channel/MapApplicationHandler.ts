/**
 * Platform Core — сторона Application для канала «карта».
 *
 * Единственный обработчик Stage 1: на Action driver.order.select публикует
 * Event driver.order.selected и — только если НЕ мок-режим — вызывает тот же
 * props-диспатч setOrderCardModal, что раньше звался из обработчика клика
 * напрямую. Поведение приложения не меняется.
 */

import type { InteractionAction, InteractionEvent, Unsubscribe } from '../interaction-contract'
import type { AppInteractionContract } from './AppInteractionContract'
import type { IOrderSelectPayload } from './MapMapper'
import {
  DRIVER_ORDER_SELECTED_EVENT,
  DRIVER_ORDER_SELECT_ACTION,
  MAP_CHANNEL_SOURCE,
} from './MapMapper'

export interface IMapApplicationDeps {
  /**
   * Мок-режим: карточку заказа не открываем — данных на бэке нет.
   * Тап только выделяет маркер и показывает диагностику (поведение как до интеграции).
   */
  readonly mockEnabled: boolean

  /** Тот же props-диспатч из connect(), что раньше вызывался прямо из карты. */
  readonly setOrderCardModal: (payload: { isOpen: true, orderId: string }) => unknown
}

/**
 * getDeps — геттер, а не значение: обработчик регистрируется один раз, но всегда
 * читает актуальные mockEnabled/setOrderCardModal, не пересоздавая подписку.
 */
export function registerMapApplicationHandler(
  contract: AppInteractionContract,
  getDeps: () => IMapApplicationDeps,
): Unsubscribe {
  return contract.registerHandler((action: InteractionAction) => {
    if (action.type !== DRIVER_ORDER_SELECT_ACTION)
      return

    const { orderId } = action.payload as IOrderSelectPayload
    const deps = getDeps()

    const event: InteractionEvent<IOrderSelectPayload> = {
      type: DRIVER_ORDER_SELECTED_EVENT,
      payload: { orderId },
      metadata: {
        source: MAP_CHANNEL_SOURCE,
        timestamp: action.metadata ? action.metadata.timestamp : new Date().toISOString(),
      },
    }
    contract.publish(event)

    if (!deps.mockEnabled)
      deps.setOrderCardModal({ isOpen: true, orderId })
  })
}
