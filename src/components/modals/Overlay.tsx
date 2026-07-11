import cn from 'classnames'
import React from 'react'
import { createPortal } from 'react-dom'
import './styles.scss'
import { Helmet } from 'react-helmet-async'
import SITE_CONSTANTS from '../../siteConstants'

interface IProps {
  isOpen: boolean,
  onClick?: () => any,
  children: React.ReactNode,
  wrapperClassName?: string,
  overlayClassName?: string,
}

const Overlay: React.FC<IProps> = ({
  isOpen,
  onClick,
  children,
  wrapperClassName,
  overlayClassName,
}) => {
  const content = (
    <div
      className={cn('overlay__wrapper', wrapperClassName, { 'overlay__wrapper--active': isOpen })}
    >
      <Helmet>
        <style>
          {`
          .modal form fieldset, .login-modal fieldset {
            border: 2px solid ${SITE_CONSTANTS.PALETTE.primary.main};
          }
          .modal form fieldset legend, .login-modal fieldset legend {
            color: ${SITE_CONSTANTS.PALETTE.primary.dark};
          }
          `}
        </style>
      </Helmet>
      <div
        className={cn('overlay', overlayClassName)}
        onClick={onClick}
      />

      {children}
    </div>
  )

  if (typeof document === 'undefined')
    return content

  return createPortal(content, document.body)
}

export default Overlay
