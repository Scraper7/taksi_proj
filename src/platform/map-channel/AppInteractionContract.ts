/**
 * Platform Core — сторона Application.
 *
 * Минимальная in-memory реализация IApplicationContract: единственная граница
 * между каналом «карта» и приложением. Никакого эмулятора, scenario-engine и
 * эмуляторного состояния — только шина:
 *
 *   dispatch  → маршрутизирует Action зарегистрированным обработчикам приложения
 *   subscribe → раздаёт Event подписчикам каналов
 *   publish   → публикация Event приложением
 *   snapshot  → минимальное сериализуемое состояние
 *
 * Сам interaction-contract не меняется — здесь только его реализация.
 */

import type {
  InteractionAction,
  InteractionEvent,
  InteractionSnapshot,
  Revision,
  Unsubscribe,
} from '../interaction-contract'
import type { IInteractionLogger } from './logger'
import { consoleInteractionLogger } from './logger'
import type { IApplicationContract, TActionHandler } from './map-channel-protocol'

export class AppInteractionContract implements IApplicationContract {
  private actionHandlers: TActionHandler[] = []
  private eventListeners: Array<(event: InteractionEvent) => void> = []
  private revision: Revision = 0
  private readonly logger: IInteractionLogger

  constructor(logger: IInteractionLogger = consoleInteractionLogger) {
    this.logger = logger
  }

  /**
   * Регистрация прикладного обработчика. Возвращает отписку.
   *
   * Регистрация НЕ идемпотентна: один и тот же handler, зарегистрированный
   * дважды, получит Action дважды. Каждая отписка снимает ровно одно вхождение
   * и безопасна к повторному вызову — «отписался один раз, отвалились оба»
   * не случается.
   */
  registerHandler(handler: TActionHandler): Unsubscribe {
    this.actionHandlers.push(handler)
    let unsubscribed = false
    return () => {
      if (unsubscribed)
        return
      unsubscribed = true
      const index = this.actionHandlers.indexOf(handler)
      if (index !== -1)
        this.actionHandlers.splice(index, 1)
    }
  }

  /**
   * Доставка Action обработчикам приложения.
   *
   * Три правила Stage 1 (зафиксированы юнит-тестами):
   *  - порядок    — последовательный обход, порядок доставки = порядок регистрации;
   *  - изоляция   — исключение обработчика ловится и уходит в логгер;
   *  - продолжение— следующие обработчики выполняются, промис резолвится успешно.
   *
   * Семантика — доставка, а не транзакция: сбой одного получателя не отменяет
   * остальных и не роняет канал с UI карты.
   */
  async dispatch<TPayload>(action: InteractionAction<TPayload>): Promise<void> {
    this.revision += 1
    // Обход по копии: обработчик вправе отписаться прямо во время обхода.
    for (const handler of this.actionHandlers.slice()) {
      try {
        await handler(action)
      } catch (error) {
        this.logger.error('action handler failed', error)
      }
    }
  }

  subscribe(listener: (event: InteractionEvent) => void): Unsubscribe {
    this.eventListeners.push(listener)
    let unsubscribed = false
    return () => {
      if (unsubscribed)
        return
      unsubscribed = true
      const index = this.eventListeners.indexOf(listener)
      if (index !== -1)
        this.eventListeners.splice(index, 1)
    }
  }

  /** Публикация Event приложением — обратное направление контракта. */
  publish(event: InteractionEvent): void {
    this.revision += 1
    this.eventListeners.slice().forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        this.logger.error('event listener failed', error)
      }
    })
  }

  /**
   * Сериализуемо по контракту: только revision и пустое доменное состояние.
   * Никаких DOM, React, Leaflet, колбэков и ref.
   *
   * Stage 1: доменного состояния нет, внедрение — на этапе FSM.
   * Исключений не бросает: snapshot безопасно читать в любой момент.
   */
  snapshot(): Promise<InteractionSnapshot> {
    return Promise.resolve({ revision: this.revision, state: {} })
  }
}
