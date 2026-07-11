import React, { useEffect, useState } from 'react'
import cn from 'classnames'
import furniture, { IFurnitureItem } from '../../../constants/furniture'
import { t, TRANSLATION } from '../../../localization'
import { gradient } from '../../../tools/theme'
import SITE_CONSTANTS from '../../../siteConstants'
import images from '../../../constants/images'

interface IProps {
  id: IFurnitureItem['id']
  value: number | null
  onChange: (id: IFurnitureItem['id'], newValue: number) => any
  onChoose?: (id: IFurnitureItem['id']) => any
}

const FurnitureRow: React.FC<IProps> = ({ id, value, onChoose, onChange }) => {
  const [hoverActive, setHoverActive] = useState(false)
  const [clickActive, setClickActive] = useState(false)
  const [focusActive, setFocusActive] = useState(false)

  const active = (clickActive || hoverActive || focusActive) && window.innerWidth < 768
  const item = furniture.find(i => i.id === id)

  useEffect(() => {
    if ((clickActive || focusActive) && onChoose) onChoose(id)
  }, [clickActive, focusActive])

  if (!item) return null

  return (
    <li
      className={cn('furniture__row', { 'furniture__row--active': !onChoose || active })}
      onMouseEnter={() => setHoverActive(true)}
      onMouseLeave={() => setHoverActive(false)}
      onClick={() => {setClickActive(true); setTimeout(() => setClickActive(false), 5000)}}
      style={{
        border: value && !active ? `2px solid ${SITE_CONSTANTS.PALETTE.secondary.main}` : undefined,
        background: !onChoose || active ?
          gradient(SITE_CONSTANTS.PALETTE.secondary.main, SITE_CONSTANTS.PALETTE.secondary.light) :
          undefined,
      }}
    >
      <div className="furniture__view">
        <img className="furniture__image" src={item.image} alt={t(item.label)} />
        <span className={cn('furniture__name', { 'furniture__name--chosen': !onChoose })}>{t(item.label)}</span>
      </div>
      <div className="furniture__change-wrapper">
        {
          !onChoose && (
            <img
              src={images.minusIcon}
              alt={t(TRANSLATION.DECREMENT)}
              onClick={() => onChange(item.id, Math.max((value || 0) - 1, 0))}
              className="furniture__change-button"
            />
          )
        }
        <input
          className="furniture__input"
          type="number"
          value={value || ''}
          onChange={e => onChange(item.id, parseInt(e.target.value) || 0)}
          min={0}
          max={99}
          onFocus={() => setFocusActive(true)}
          onBlur={() => setFocusActive(false)}
        />
        {!onChoose && (
          <img
            src={images.plusIcon}
            alt={t(TRANSLATION.INCREMENT)}
            onClick={() => onChange(item.id, Math.min((value || 0) + 1, 99))}
            className="furniture__change-button"
          />
        )}
      </div>
    </li>
  )
}

export default FurnitureRow