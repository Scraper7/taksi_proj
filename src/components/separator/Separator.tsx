import React from 'react'
import SITE_CONSTANTS from '../../siteConstants'
import './styles.scss'

interface IProps {
  text?: string,
  style?: React.CSSProperties,
  src?: string,
  active?: boolean,
  onClick?: React.PointerEventHandler<HTMLDivElement>,
}

const Separator: React.FC<IProps> = ({ text, style, src, active, onClick }) => (
  // <div className="separator" style={{ color: SITE_CONSTANTS.PALETTE.primary.dark, ...style }} onClick={onClick}>
  <div className="separator" style={{ ...style }} onClick={onClick}>
    {text}
    {/* {src && <img src={src} alt={text}/>} */}
    <svg data-active={active} width="16" height="16" viewBox="0 0 16 16" fill="none" ><path d="M3.33337 10L8.00004 6L12.6667 10" stroke="#1C274C" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </div>
)

export default Separator