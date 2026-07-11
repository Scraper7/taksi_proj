import React from 'react'
import cn from 'classnames'
import './styles.scss'

interface IProps {
  className?: string,
  scrollable?: boolean,
}

export default function PageSection({
  children,
  className = undefined,
  scrollable,
}: React.PropsWithChildren<IProps>) {
  return (
    <section
      className={cn('page-section', {
        'page-section--scroll--enabled': scrollable === true,
        'page-section--scroll--disabled': scrollable === false,
      }, className)}
    >
      {children}
    </section>
  )
}