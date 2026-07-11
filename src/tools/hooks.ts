import React, { useState, useEffect, useRef, useCallback } from 'react'
import { objectFromEntries } from './compat'
import {
  useSelector as useReduxSelector,
  useDispatch as useReduxDispatch,
} from 'react-redux'
import { useLocation } from 'react-router-dom'
import {
  useWatch,
  DeepPartialSkipArrayKey, Control, FieldValues,
} from 'react-hook-form'
import _ from 'lodash'
import { IRootState, IDispatch } from '../state'
import { getItem, setItem } from './localStorage'

interface IAdditionalDataFlags {
  dirty?: boolean,
  previousValue?: boolean
}
interface IAdditionalData {
  dirty?: boolean,
  previousValue?: any
}
/**
 * Works like useState, but also caches value at localStorage
 * @param key localStorage access key. It should follow the format ${objectKey}.${valueKey} or just ${valueKey}
 * @param defaultValue default value will be used if cached value is not found or some error occured
 * @param allowableValues list of allowable values for cached value.
 * @param additionalData object containing data about additional field data passed to return. Do not change at runtime!
 *  If allowableValues does not includes cached value, defaultValue is used
 */
export const useCachedState = <T>(
  key: string,
  defaultValue?: T,
  allowableValues?: T[],
  additionalData: IAdditionalDataFlags = {},
): [T, React.Dispatch<React.SetStateAction<T>>, IAdditionalData] => {
  const [value, setValue] =
    useState<T>(() => getItem(key, defaultValue, allowableValues))

  let dirty: boolean = false
  let setDirty: React.Dispatch<React.SetStateAction<boolean>>
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (additionalData.dirty) [dirty, setDirty] = useState<boolean>(false)

  let previousValue: T | undefined = undefined
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (additionalData.previousValue || additionalData.dirty) previousValue = usePrevious<T>(value)

  useEffect(() => {
    if (additionalData.dirty && !dirty && previousValue !== undefined && !_.isEqual(value, previousValue)) {
      setDirty(true)
    }
  }, [value])

  return [
    value,
    v => {
      if (typeof v === 'function')
        v = (v as (v: T) => T)(value)
      setValue(v)
      setItem(key, v)
    },
    {
      dirty,
      previousValue,
    },
  ]
}

/** Returns value before update */
export const usePrevious = <T = any>(value: any) => {
  const ref = useRef<T>(undefined)

  useEffect(() => {
    ref.current = value
  }, [value])

  return ref.current
}

type WatchValuesType = {[x: string]: any}
/** Works like useWatch, but also do actions on some value change */
export const useWatchWithEffect = <T extends FieldValues = FieldValues>(
  props: {
    defaultValue?: DeepPartialSkipArrayKey<T>;
    control?: Control<T>;
    disabled?: boolean;
    exact?: boolean;
  },
  callback: (values: WatchValuesType, previousValues: WatchValuesType | undefined) => void,
) => {
  const values = useWatch(props)
  const previousValues = usePrevious<WatchValuesType>(values)

  useEffect(() => {
    if (!_.isEqual(values, previousValues)) {
      callback(values, previousValues)
    }
  }, [values])

  return values as T
}

export const useInterval = (callback: Function, delay: number | null, immediately?: boolean) => {
  const savedCallback = useRef<Function>(undefined)

  useEffect(() => {
    savedCallback.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null)
      return undefined

    // TypeScript does not keep the null-check narrowing inside nested
    // callbacks, so keep a local number-only copy for setTimeout.
    const intervalDelay = delay

    let timeoutId: number | undefined
    let stopped = false

    function tick() {
      savedCallback.current && savedCallback.current()
    }

    function schedule() {
      if (stopped)
        return

      timeoutId = window.setTimeout(() => {
        tick()
        schedule()
      }, intervalDelay)
    }

    function wakeTick() {
      if (stopped)
        return

      if (!document.hidden)
        tick()
    }

    immediately && tick()
    schedule()

    window.addEventListener('focus', wakeTick)
    window.addEventListener('pageshow', wakeTick)
    document.addEventListener('visibilitychange', wakeTick)

    return () => {
      stopped = true
      if (timeoutId !== undefined)
        window.clearTimeout(timeoutId)
      window.removeEventListener('focus', wakeTick)
      window.removeEventListener('pageshow', wakeTick)
      document.removeEventListener('visibilitychange', wakeTick)
    }
  }, [delay, immediately])
}

/**
 * Живой timestamp для таймеров/счётчиков.
 *
 * Важно: это один общий clock на всё приложение. Раньше каждый компонент
 * заводил свой timeout/listeners и на Android Chrome это могло давать render
 * storm вместе с картой, polling и геолокацией. Теперь все таймеры получают
 * время из одного общего источника, а UI считает значения только через
 * Date.now()/targetTimestamp, без «минус 1 каждую секунду».
 *
 * Android-safe правила:
 * - не будим clock на touchstart/pointerdown;
 * - не используем setTimeout(..., 0) после wake;
 * - не синхронизируемся на wall-clock через 250ms bursts.
 */
type ReliableNowListener = (now: number) => void

const reliableNowListeners = new Set<ReliableNowListener>()
let reliableNowTimer: number | undefined
let reliableNowValue = Date.now()
let reliableNowInterval = 1000
let reliableNowStarted = false
let reliableNowLastEmitAt = Date.now()

function isAndroidChromeRuntime() {
  if (typeof navigator === 'undefined')
    return false

  const ua = navigator.userAgent || ''
  return /Android/i.test(ua) && /Chrome|CriOS|EdgA|SamsungBrowser/i.test(ua)
}

function emitReliableNow() {
  reliableNowLastEmitAt = Date.now()
  reliableNowValue = reliableNowLastEmitAt

  reliableNowListeners.forEach(listener => {
    try {
      listener(reliableNowValue)
    } catch (error) {
      console.error(error)
    }
  })
}

function scheduleReliableNow() {
  if (!reliableNowStarted || reliableNowListeners.size === 0 || reliableNowTimer !== undefined)
    return

  const nextDelay = Math.max(750, reliableNowInterval || 1000)

  reliableNowTimer = window.setTimeout(() => {
    reliableNowTimer = undefined
    emitReliableNow()
    scheduleReliableNow()
  }, nextDelay)
}

function restartReliableNow() {
  if (reliableNowTimer !== undefined) {
    window.clearTimeout(reliableNowTimer)
    reliableNowTimer = undefined
  }

  if (!reliableNowStarted || reliableNowListeners.size === 0)
    return

  // Не используем setTimeout(..., 0) и синхронизацию по wall-clock.
  // На Android Chrome это могло давать серию почти мгновенных wake/render
  // циклов рядом с картой и bottom-sheet. Сразу обновляем значение, а
  // следующий тик ставим обычным спокойным таймаутом.
  emitReliableNow()
  scheduleReliableNow()
}

function forceAndroidPaintWake() {
  if (!isAndroidChromeRuntime() || typeof document === 'undefined')
    return

  const root = document.documentElement
  root.classList.add('android-performance-mode')

  // Небольшой compositor wake: помогает Android Chrome после сна вкладки /
  // чёрного экрана не ждать следующего случайного redraw. Это не меняет layout.
  root.style.setProperty('--android-paint-wake', String(Date.now()))
}

function startReliableNowClock() {
  if (reliableNowStarted || typeof window === 'undefined')
    return

  reliableNowStarted = true

  const wake = () => {
    if (typeof document !== 'undefined' && document.hidden)
      return

    forceAndroidPaintWake()
    restartReliableNow()
  }

  window.addEventListener('focus', wake, { passive: true } as AddEventListenerOptions)
  window.addEventListener('pageshow', wake, { passive: true } as AddEventListenerOptions)
  window.addEventListener('online', wake, { passive: true } as AddEventListenerOptions)
  window.addEventListener('resize', wake, { passive: true } as AddEventListenerOptions)
  document.addEventListener('visibilitychange', wake, { passive: true } as AddEventListenerOptions)

  forceAndroidPaintWake()
  scheduleReliableNow()
}

function subscribeReliableNow(listener: ReliableNowListener, interval: number) {
  const safeInterval = Math.max(750, interval || 1000)
  reliableNowInterval = Math.min(reliableNowInterval || safeInterval, safeInterval)
  reliableNowListeners.add(listener)
  startReliableNowClock()

  // Новому подписчику отдаём актуальное время сразу, но не перезапускаем
  // глобальный clock на каждое подключение компонента. Это снижает риск
  // render storm при открытии панелей/карт на Android.
  try {
    listener(Date.now())
  } catch (error) {
    console.error(error)
  }

  scheduleReliableNow()

  return () => {
    reliableNowListeners.delete(listener)

    if (reliableNowListeners.size === 0 && reliableNowTimer !== undefined) {
      window.clearTimeout(reliableNowTimer)
      reliableNowTimer = undefined
    }
  }
}

export const useReliableNow = (enabled: boolean = true, interval: number = 1000) => {
  const [now, setNow] = useState(() => Date.now())
  const lastSecondRef = useRef(Math.floor(now / Math.max(750, interval || 1000)))

  useEffect(() => {
    if (!enabled)
      return undefined

    const safeInterval = Math.max(750, interval || 1000)

    return subscribeReliableNow((value) => {
      const currentBucket = Math.floor(value / safeInterval)
      if (currentBucket === lastSecondRef.current)
        return

      lastSecondRef.current = currentBucket

      if (typeof React.startTransition === 'function') {
        React.startTransition(() => setNow(value))
      } else {
        setNow(value)
      }
    }, safeInterval)
  }, [enabled, interval])

  return now
}


export const useQuery = () => {
  return objectFromEntries(new URLSearchParams(useLocation().search).entries())
}

export const useVisibility = (defaultValue: boolean = false): [boolean, () => void] => {
  const [visible, setVisible] = React.useState(defaultValue)

  const toggleVisibility = () => setVisible(!visible)

  return [visible, toggleVisibility]
}

export const useSimpleSelector = useReduxSelector.withTypes<IRootState>()
export const useDispatch = useReduxDispatch.withTypes<IDispatch>()

export function useSelector<
  TSelector extends(state: IRootState, ...args: any[]) => any
>(
  selector: TSelector,
  ...args: Parameters<TSelector> extends [any, ...infer Rest] ? Rest : never
): ReturnType<TSelector> {
  return useReduxSelector(useCallback(
    (state: IRootState) => selector(state, ...args),
    [selector, ...args],
  ))
}