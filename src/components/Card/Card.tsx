import cn from 'classnames'
import React from 'react'
import SITE_CONSTANTS from '../../siteConstants'
import './styles.scss'

interface IProps {
  src?: string
  text?: string
  active?: boolean
  style?: React.CSSProperties
  onClick?: React.PointerEventHandler<HTMLDivElement>
  className?: string
  disabled?: boolean
  payment?: string
}

const Card: React.FC<IProps> = ({ src, text, active, style, onClick, className, disabled, payment }) => {
  const color = active ? SITE_CONSTANTS.PALETTE.primary.dark : '#898888'
  return (
    <div className={cn('card', className, { disabled, 'card--active': active })} style={style} onClick={disabled ? () => {} : onClick}>
      <img src={src} alt={text}/>
      <hr style={{ border: `1px solid ${color}` }}/>
      <span style={{ color }}>{text}</span>
      {!!payment && <p className="card__price" style={{ color: SITE_CONSTANTS.PALETTE.primary.light }}>{payment}</p>}
    </div>
  )
}

export default Card