import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react'
import _ from 'lodash'

export function useSwipe(
  element: React.RefObject<HTMLElement | null>,
  draggable: React.RefObject<HTMLElement | null> = element,
  minimizedPart?: React.RefObject<HTMLElement | null>,
  noSwipeElements?: React.RefObject<HTMLElement[]>,
  speed = 300,
): {
  isExpanded: boolean,
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>
} {

  const [isExpanded, setIsExpanded] = useState(false)
  const isExpandedRef = useRef(false)
  isExpandedRef.current = isExpanded

  const getLiftingHeightBounds = useCallback((): [min: number, max: number] => {
    if (!element.current)
      return [0, 0]
    const parent = element.current.offsetParent! as HTMLElement
    const visible = parent.offsetHeight - element.current.offsetTop
    const expanded = element.current.offsetHeight

    let minimized = visible
    if (minimizedPart?.current) {
      minimized = minimizedPart.current.offsetHeight
      let minimizedParent: HTMLElement | null = minimizedPart.current
      while (minimizedParent && minimizedParent !== element.current) {
        minimized += minimizedParent.offsetTop
        minimizedParent = minimizedParent.offsetParent as HTMLElement | null
      }
    }

    return [minimized - visible, expanded - visible]
  }, [element, minimizedPart])

  const transform = useCallback((
    value: number,
    height = getLiftingHeightBounds(),
  ) => {
    if (!element.current || !draggable.current)
      return
    const [min, max] = height
    const translate = Math.max(Math.min(value, -min), -max)
    element.current.style.transform = `translateY(${translate}px)`
    if (translate > -max) {
      draggable.current.style.overflow = 'hidden'
      draggable.current.scrollTop = 0
    } else
      draggable.current.style.overflow = ''
  }, [element, draggable])

  const update = useCallback(() => {
    transform(isExpandedRef.current ? -Infinity : Infinity)
  }, [transform])

  useLayoutEffect(update, [isExpanded, update])

  useEffect(() => {
    if (!element.current)
      return
    window.addEventListener('resize', update)
    const observer = new ResizeObserver(update)
    observer.observe(element.current)
    if (minimizedPart?.current)
      observer.observe(minimizedPart.current)
    return () => {
      window.removeEventListener('resize', update)
      observer.disconnect()
    }
  }, [element, minimizedPart, update])

  useEffect(() => {
    if (!element.current || !draggable.current)
      return
    const elementValue = element.current
    const draggableValue = draggable.current

    let
      startY: number,
      startTime: number,
      minHeight: number,
      maxHeight: number,
      currentY = 0,
      deltaY = 0,
      canMove = false

    function start(e: TouchEvent) {
      for (const noSwipeElement of noSwipeElements?.current ?? [])
        if (noSwipeElement.contains(e.target as Node)) {
          canMove = false
          return
        }
      startY = e.touches[0].clientY + draggableValue.scrollTop
      startTime = Date.now()
      ;[minHeight, maxHeight] = getLiftingHeightBounds()
      currentY = isExpandedRef.current ? -maxHeight : -minHeight
      deltaY = 0
      canMove = true
      elementValue.style.transition = 'transform 0.05s linear'
    }

    const move = _.throttle((e: TouchEvent) => {
      if (!canMove) return
      deltaY = e.touches[0].clientY - startY
      transform(currentY + deltaY, [minHeight, maxHeight])
    }, 50)

    function end() {
      if (!canMove) return
      const endTime = Date.now()
      const duration = endTime - startTime
      const center = (maxHeight - minHeight) / 2
      elementValue.style.transition = 'transform 0.3s ease'

      if (
        duration < speed ||
        deltaY > center ||
        deltaY < -center
      ) {
        if (deltaY > 0)
          setIsExpanded(false)
        if (deltaY < 0)
          setIsExpanded(true)
      } else
        transform(currentY)
      canMove = false
    }

    draggableValue.addEventListener('touchstart', start)
    document.addEventListener('touchmove', move)
    document.addEventListener('touchend', end)

    return () => {
      draggableValue.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
    }
  }, [
    draggable, element, noSwipeElements, speed,
    getLiftingHeightBounds, transform,
  ])

  return { isExpanded, setIsExpanded }
}