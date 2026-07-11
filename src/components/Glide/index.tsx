import React, { useRef, useEffect, useLayoutEffect, useId } from 'react'
import cn from 'classnames'
import VanillaGlide from '@glidejs/glide'
import '@glidejs/glide/dist/css/glide.core.min.css'
import './styles.scss'

interface IProps extends Omit<React.ComponentProps<'div'>, 'id'> {
  perView: number,
  gap?: number,
  focused?: number,
  focusPaddingLeft?: number,
  focusPaddingRight?: number,
  slides: (React.ComponentProps<'li'> & {
    key: React.ComponentProps<'li'>['key']
  })[],
  buttons?: (IButtonProps & {
    key: IButtonProps['key']
  })[],
  onPositionChange?: (position: number) => void
}

interface IButtonProps extends React.ComponentProps<'button'> {
  dir: '<' | '>'
}

export default function Glide({
  className = undefined,
  perView,
  gap = 0,
  focused = -1,
  focusPaddingLeft = 0,
  focusPaddingRight = 0,
  slides,
  buttons = undefined,
  onPositionChange = () => {},
  ...props
}: IProps) {

  const glideId = useId()
  const glide = useRef<VanillaGlide.Properties | null>(null)
  const position = useRef<number>(0)

  useLayoutEffect(() => {
    const vanillaGlide = new VanillaGlide(`#${CSS.escape(glideId)}`, {
      perView, gap,
      type: 'slider',
      keyboard: false,
      bound: true,
      startAt: position.current,
    })
    const mountedGlide = vanillaGlide.mount()
    glide.current = mountedGlide

    vanillaGlide.on('run.after', () => {
      position.current = mountedGlide.index
      onPositionChange(mountedGlide.index)
    })

    return () => {
      mountedGlide.destroy()
      glide.current = null
    }
  }, [slides, buttons])

  useLayoutEffect(() => {
    if (!glide.current)
      return
    glide.current.update({ perView, gap })
  }, [perView, gap])

  useLayoutEffect(() => {
    if (!glide.current)
      return
    if (slides.length <= perView)
      glide.current.disable()
    else
      glide.current.enable()
  }, [slides, perView])

  useEffect(() => {
    if (focused < 0 || !glide.current)
      return
    const leftIndex = focused - perView + 1 + focusPaddingLeft
    const rightIndex = focused - focusPaddingRight
    const goTo = Math.max(Math.min((
      glide.current.index < leftIndex ?
        leftIndex :
        glide.current.index > rightIndex ?
          rightIndex :
          glide.current.index
    ), slides.length - perView), 0)
    if (goTo === glide.current.index)
      return
    glide.current.go(`=${goTo}`)
  }, [focused, focusPaddingLeft, focusPaddingRight])

  return (
    <div {...props} id={glideId} className={cn('glide', className)}>
      <div className="glide__track" data-glide-el="track">
        <ul className="glide__slides">
          {slides.map(({
            className, ...props
          }) => <li className={cn('glide__slide', className)} {...props} />)}
        </ul>
      </div>
      {buttons &&
        <div className="glide__arrows" data-glide-el="controls">
          {buttons.map(({
            dir, ...props
          }) => <button data-glide-dir={dir} {...props} />)}
        </div>
      }
    </div>
  )
}