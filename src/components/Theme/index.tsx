import React from 'react'
import SITE_CONSTANTS from '../../siteConstants'
import './styles.scss'

export default function Theme({ children }: React.PropsWithChildren) {
  return (
    <div
      className="theme"
      style={{
        '--theme--primary-main': SITE_CONSTANTS.PALETTE.primary.main,
        '--theme--primary-light': SITE_CONSTANTS.PALETTE.primary.light,
        '--theme--primary-dark': SITE_CONSTANTS.PALETTE.primary.dark,
        '--theme--secondary-main': SITE_CONSTANTS.PALETTE.secondary.main,
        '--theme--secondary-light': SITE_CONSTANTS.PALETTE.secondary.light,
        '--theme--secondary-dark': SITE_CONSTANTS.PALETTE.secondary.dark,
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}