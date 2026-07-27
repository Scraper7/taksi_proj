/**
 * Platform Core — Channel «карта».
 *
 * Только транспорт: принимает событие от карты, зовёт Mapper, отдаёт Action в
 * контракт; подписан на Event из контракта и отдаёт его наружу колбэком.
 * Ноль бизнес-логики — решение «открывать ли карточку» принимает UI-подписчик
 * (см. useMapChannel), а семантику действия определяет Application
 * (см. MapApplicationHandler).
 *
 * Логи с префиксом [InteractionContract] в обе стороны — единственная
 * наблюдаемость Stage 1.
 */

import type {
  InteractionContract,
  InteractionEvent,
  Unsubscribe,
} from '../interaction-contract'
import type { IInteractionLogger } from './logger'
import { consoleInteractionLogger } from './logger'
import { mapOrderSelectToAction } from './MapMapper'

/** Источник времени — вынесен, чтобы Mapper оставался чистым. */
export type TNow = () => string

/** Источник идентификаторов корреляции — вынесен по той же причине, что и TNow. */
export type TNewId = () => string

const defaultNewId = (): string =>
  `map-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export class MapChannel {
  private readonly contract: InteractionContract
  private readonly now: TNow
  private readonly newId: TNewId
  private readonly logger: IInteractionLogger

  constructor(
    contract: InteractionContract,
    now?: TNow,
    newId?: TNewId,
    logger?: IInteractionLogger,
  ) {
    this.contract = contract
    this.now = now || (() => new Date().toISOString())
    this.newId = newId || defaultNewId
    this.logger = logger || consoleInteractionLogger
  }

  /** Карта → приложение: водитель выбрал заказ. */
  selectOrder(orderId: string): void {
    const action = mapOrderSelectToAction(orderId, this.now(), this.newId())
    // Невалидный orderId: Action не создан — молча выходим. Ни исключения, ни
    // лишней строки лога в пути клика.
    if (!action)
      return
    this.logger.log('Action', action.type, action)
    this.contract.dispatch(action).catch(error => {
      this.logger.error('dispatch failed', error)
    })
  }

  /** Приложение → карта: подписка на Event контракта. */
  subscribe(listener: (event: InteractionEvent) => void): Unsubscribe {
    return this.contract.subscribe(event => {
      this.logger.log('Event', event.type, event)
      listener(event)
    })
  }
}
