/**
 * Platform Core — сборка канала «карта» и его подключение к React-компоненту.
 *
 * Контракт и канал — МОДУЛЬНЫЕ СИНГЛТОНЫ: создаются ровно один раз на загрузку
 * модуля, а не в теле рендера. Карта не получает ни одного дополнительного
 * ре-рендера, идентичность channel постоянна.
 *
 * Здесь же живёт UI-подписчик: единственное место, где Event контракта
 * превращается в действие интерфейса.
 */

import { useEffect, useRef } from 'react'
import { AppInteractionContract } from './AppInteractionContract'
import { MapChannel } from './MapChannel'
import { registerMapApplicationHandler } from './MapApplicationHandler'
import type { IApplicationContract, IOrderSelectedPayload } from './map-channel-protocol'
import { DRIVER_ORDER_SELECTED_EVENT } from './map-channel-protocol'

/**
 * UI-зависимости подписчика карты. Прикладной обработчик их не видит и видеть
 * не должен: это сторона интерфейса, а не домена.
 */
export interface IMapApplicationDeps {
  /**
   * Мок-режим: карточку заказа не открываем — данных на бэке нет.
   * Тап только выделяет маркер и показывает диагностику (поведение как до интеграции).
   */
  readonly mockEnabled: boolean

  /** Тот же props-диспатч из connect(), что раньше вызывался прямо из карты. */
  readonly setOrderCardModal: (payload: { isOpen: true, orderId: string }) => unknown
}

// Тип синглтона — интерфейс, а не класс: регистрация и подписка зависят от
// IApplicationContract, конкретная реализация шины подменяема.
const contract: IApplicationContract = new AppInteractionContract()
const channel = new MapChannel(contract)

/**
 * Регистрирует прикладной обработчик и UI-подписчика, возвращает стабильный канал.
 *
 * Свежие зависимости отдаём через ref (тот же приём, что у MockClusterLayer в
 * Map.tsx): подписчик регистрируется один раз, но всегда видит актуальные
 * mockEnabled/setOrderCardModal — смена пропсов не пересоздаёт подписку.
 *
 * Эффект с пустыми зависимостями + честный cleanup корректен и под StrictMode:
 * двойной вызов в dev даёт register → unregister → register, то есть ровно одну
 * активную регистрацию.
 */
export function useMapChannel(deps: IMapApplicationDeps): MapChannel {
  const depsRef = useRef(deps)
  depsRef.current = deps

  useEffect(() => {
    const unregister = registerMapApplicationHandler(contract)

    // UI-подписчик. К моменту его вызова Handler уже отработал и опубликовал
    // Event — порядок «сначала Event, потом UI» гарантирован построением цепочки,
    // а не соглашением.
    const unsubscribe = channel.subscribe(event => {
      if (event.type !== DRIVER_ORDER_SELECTED_EVENT)
        return
      const { mockEnabled, setOrderCardModal } = depsRef.current
      // Мок-режим: карточку по-прежнему не открываем — данных на бэке нет,
      // тап только выделяет маркер и показывает диагностику.
      if (mockEnabled)
        return
      const { orderId } = event.payload as IOrderSelectedPayload
      setOrderCardModal({ isOpen: true, orderId })
    })

    return () => {
      unregister()
      unsubscribe()
    }
  }, [])

  return channel
}
