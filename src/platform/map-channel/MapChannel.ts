/**
 * Platform Core — Channel «карта».
 *
 * Только транспорт: принимает событие от карты, зовёт Mapper, отдаёт Action в
 * контракт; подписан на Event из контракта и отдаёт его наружу колбэком.
 * Ноль бизнес-логики — решение «открывать ли карточку» принимает Application
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
import { mapOrderSelectToAction } from './MapMapper'

/** Источник времени — вынесен, чтобы Mapper оставался чистым. */
export type TNow = () => string

export class MapChannel {
  private readonly contract: InteractionContract
  private readonly now: TNow

  constructor(contract: InteractionContract, now?: TNow) {
    this.contract = contract
    this.now = now || (() => new Date().toISOString())
  }

  /** Карта → приложение: водитель выбрал заказ. */
  selectOrder(orderId: string): void {
    const action = mapOrderSelectToAction(orderId, this.now())
    console.log('[InteractionContract] Action', action.type, action)
    this.contract.dispatch(action).catch(error => {
      console.error('[InteractionContract] dispatch failed', error)
    })
  }

  /** Приложение → карта: подписка на Event контракта. */
  subscribe(listener: (event: InteractionEvent) => void): Unsubscribe {
    return this.contract.subscribe(event => {
      console.log('[InteractionContract] Event', event.type, event)
      listener(event)
    })
  }
}
