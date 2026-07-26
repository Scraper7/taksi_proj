/**
 * Platform Core — сторона Application.
 *
 * Минимальная in-memory реализация InteractionContract: единственная граница
 * между каналом «карта» и приложением. Никакого эмулятора, scenario-engine и
 * эмуляторного состояния — только шина:
 *
 *   dispatch  → маршрутизирует Action зарегистрированным обработчикам приложения
 *   subscribe → раздаёт Event подписчикам каналов
 *   snapshot  → минимальное сериализуемое состояние
 *
 * Сам interaction-contract не меняется — здесь только его реализация.
 */

import type {
  InteractionAction,
  InteractionContract,
  InteractionEvent,
  InteractionSnapshot,
  Revision,
  Unsubscribe,
} from '../interaction-contract'

/** Обработчик Action на стороне приложения. */
export type TActionHandler = (action: InteractionAction) => void

export class AppInteractionContract implements InteractionContract {
  private actionHandlers: TActionHandler[] = []
  private eventListeners: Array<(event: InteractionEvent) => void> = []
  private revision: Revision = 0

  /** Регистрация прикладного обработчика. Возвращает отписку. */
  registerHandler(handler: TActionHandler): Unsubscribe {
    this.actionHandlers.push(handler)
    return () => {
      this.actionHandlers = this.actionHandlers.filter(item => item !== handler)
    }
  }

  dispatch<TPayload>(action: InteractionAction<TPayload>): Promise<void> {
    this.revision += 1
    // Обход по копии: обработчик вправе отписаться прямо во время обхода.
    this.actionHandlers.slice().forEach(handler => {
      // Изоляция: ошибка прикладного обработчика не должна ломать канал и UI карты.
      try {
        handler(action)
      } catch (error) {
        console.error('[InteractionContract] action handler failed', error)
      }
    })
    return Promise.resolve()
  }

  subscribe(listener: (event: InteractionEvent) => void): Unsubscribe {
    this.eventListeners.push(listener)
    return () => {
      this.eventListeners = this.eventListeners.filter(item => item !== listener)
    }
  }

  /** Публикация Event приложением — обратное направление контракта. */
  publish(event: InteractionEvent): void {
    this.revision += 1
    this.eventListeners.slice().forEach(listener => {
      try {
        listener(event)
      } catch (error) {
        console.error('[InteractionContract] event listener failed', error)
      }
    })
  }

  /**
   * Сериализуемо по контракту: только revision и пустое доменное состояние.
   * Никаких DOM, React, Leaflet, колбэков и ref.
   */
  snapshot(): Promise<InteractionSnapshot> {
    return Promise.resolve({ revision: this.revision, state: {} })
  }
}
