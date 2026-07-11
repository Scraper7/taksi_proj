import React, { useState, useEffect, useRef } from 'react'

type Props = {
    children: React.ReactNode
    isShownShortInfo: boolean
    threshold: number
    draggableElement: HTMLFormElement | null
    blockOpacityElements?: {carSlider: HTMLDivElement| null, seatSlider: HTMLDivElement| null}
}

export function OpacityLayer({ children, isShownShortInfo, threshold, draggableElement, blockOpacityElements }: Props) {
  const [opacity, setOpacity] = useState(() => isShownShortInfo ? 1 : 0)
  const elementRef = useRef<HTMLDivElement>(null)
  const blockOpacityRef = useRef({
    carSlider: blockOpacityElements?.carSlider,
    seatSlider: blockOpacityElements?.seatSlider })

  let startY: number,
    deltaY = 0,
    initOpacity = opacity < 0.5 ? 0 : 1,
    canMove = false



  useEffect(() => {
    if(!blockOpacityRef.current.carSlider && !blockOpacityRef.current.seatSlider) return
    blockOpacityRef.current.carSlider = blockOpacityElements?.carSlider
    blockOpacityRef.current.seatSlider = blockOpacityElements?.seatSlider

    console.log(blockOpacityRef.current.carSlider, blockOpacityRef.current.seatSlider)
  }, [])



  useEffect(() => {
    setOpacity(isShownShortInfo ? 1 : 0)

    if (!elementRef.current || !draggableElement) return
    draggableElement.addEventListener('touchstart', start)
    document.addEventListener('touchmove', move)
    document.addEventListener('touchend', end)


    return () => {
      draggableElement.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
    }
  }, [elementRef.current, isShownShortInfo, draggableElement])



  function start(e: TouchEvent) {
    if (!blockOpacityRef.current.carSlider && !blockOpacityRef.current.seatSlider) return
    if (blockOpacityRef.current.carSlider?.contains(e.target as Node) || blockOpacityRef.current.seatSlider?.contains(e.target as Node)) {
      canMove = false
      console.log('cant move')
      return
    } else { canMove = true
      startY = e.touches[0].clientY}
  }

  function move(e: TouchEvent) {
    console.log(canMove, 'move function')
    if (!canMove) return
    if (!elementRef.current) return
    // if (!blockOpacityRef.current.carSlider && !blockOpacityRef.current.seatSlider) return
    // console.log(blockOpacityRef)

    deltaY = e.touches[0].clientY - startY
    if(!isShownShortInfo && deltaY < 0) return
    if(isShownShortInfo && deltaY > 0) return
    if (deltaY < 0) {
      setOpacity((Math.round((1 - Math.abs(deltaY) / threshold) * 10) / 10))
    }
    if (deltaY > 0) {
      setOpacity(Math.round(Math.abs(deltaY) / threshold * 10) / 10)
    }

  }
  function end() {
    if (!elementRef.current) return
    if (
      deltaY > threshold / 2 ||
            deltaY < -threshold / 2
    ) {
      if (deltaY > 0) {
        setOpacity(1)
        initOpacity = 1
      }
      if (deltaY < 0) {
        setOpacity(0)
        initOpacity = 0
      }
    } else {
      console.log('else', initOpacity)
      setOpacity(initOpacity)
    }
    canMove = false
  }

  return (
    <div ref={elementRef} style={{ opacity, transition: 'opacity 0.3s ease', display: opacity < 0.2 ? 'none' : 'block' }}>
      {children}
    </div>
  )
}
