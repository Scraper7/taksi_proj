/**
 * Platform Core — сборка канала «карта» и его подключение к React-компоненту.
 *
 * Контракт и канал — МОДУЛЬНЫЕ СИНГЛТОНЫ: создаются ровно один раз на загрузку
 * модуля, а не в теле рендера. Карта не получает ни одного дополнительного
 * ре-рендера, идентичность channel постоянна.
 */

import { useEffect, useRef } from 'react'
import { AppInteractionContract } from './AppInteractionContract'
import { MapChannel } from './MapChannel'
import type { IMapApplicationDeps } from './MapApplicationHandler'
import { registerMapApplicationHandler } from './MapApplicationHandler'

const contract = new AppInteractionContract()
const channel = new MapChannel(contract)

/**
 * Регистрирует прикладной обработчик и возвращает стабильный канал.
 *
 * Свежие зависимости отдаём через ref (тот же приём, что у MockClusterLayer в
 * Map.tsx): обработчик регистрируется один раз, но всегда видит актуальные
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
    const unregister = registerMapApplicationHandler(contract, () => depsRef.current)
    // Stage 1: внешних потребителей Event ещё нет — наблюдаемость даёт сам канал
    // (лог [InteractionContract] Event). Подписка держит обратное направление живым.
    const unsubscribe = channel.subscribe(() => undefined)
    return () => {
      unregister()
      unsubscribe()
    }
  }, [])

  return channel
}
