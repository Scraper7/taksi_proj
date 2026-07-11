import React from 'react'
import cn from 'classnames'
import Overlay from './Overlay'
import './styles.scss'

export enum EModalStyles {
  Default,
  RedDesign,
}

interface IProps {
  overlayProps: Omit<React.ComponentProps<typeof Overlay>, 'children'>
  style?: EModalStyles
  className?: string
}

export default function Modal({
  overlayProps,
  style = EModalStyles.Default,
  className,
  children,
}: React.PropsWithChildren<IProps>) {
  return (
    <Overlay {...overlayProps}>
      <div
        className={cn(
          'modal',
          style !== EModalStyles.Default && 'modal--style--' + {
            [EModalStyles.RedDesign]: 'red-design',
          }[style],
          className,
        )}
      >
        {children}
      </div>
    </Overlay>
  )
}