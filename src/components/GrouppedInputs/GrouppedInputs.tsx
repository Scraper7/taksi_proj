import React from 'react'
import './styles.scss'
import cn from 'classnames'

interface IProps {
  children?: React.ReactNode,
  label?: string,
  className?: string,
}

const GroupedInputs: React.FC<IProps> = ({ label, className, children }) => {
  return (
    <div className={cn('groupped-inputs', className)}>
      {label && <div className="groupped-inputs__label">{label}:</div>}
      {children}
    </div>
  )
}

export default GroupedInputs