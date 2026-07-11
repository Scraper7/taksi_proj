import React from 'react'

interface IProps {
  src: string
  className?: string
}

const DriverStatusIcon: React.FC<IProps> = ({ src, className }) => (
  <img className={className} src={src} alt="" aria-hidden="true" />
)

export default DriverStatusIcon
