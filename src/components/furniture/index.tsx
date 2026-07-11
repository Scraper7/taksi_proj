import React, { useState } from 'react'
import './styles.scss'
import { IFurnitureItem, roomsFurniture } from '../../constants/furniture'
import { t, TRANSLATION } from '../../localization'
import _ from 'lodash'
import Slider from '../slider'
import { IRoom, TRoomFurniture } from '../../types/types'
import SITE_CONSTANTS from '../../siteConstants'
import FurnitureRow from './furnitureRow'

interface IProps {
  value: TRoomFurniture | null
  room: IRoom['id'] | null
  total: number
  listAll: boolean
  handleChange: (id: IRoom['id'], value: TRoomFurniture) => any
}

const Furniture: React.FC<IProps> = ({
  value,
  room,
  total,
  listAll,
  // roomsChoosen,
  handleChange,
}) => {
  const [chosenFurniture, setChosenFurniture] = useState<IFurnitureItem['id'] | null>(null)

  if (room === null) return null

  const onChange = (id: IFurnitureItem['id'], newValue: number) => {
    handleChange(room, { ...value, [id]: newValue })
  }

  return (
    <div className="furniture">
      <label className="input__label">
        {t(TRANSLATION.FURNITURE_LIST)}
      </label>
      {chosenFurniture && (
        <div className="furniture__chosen">
          <FurnitureRow id={chosenFurniture} value={value && value[chosenFurniture]} onChange={onChange}/>
        </div>
      )}
      <Slider
        className="furniture__slider"
        slides={_.chunk(listAll ? roomsFurniture.all as number[] : roomsFurniture[room], 4).map(item => (
          <ul className="furniture__column">
            {item.map(i => (
              <FurnitureRow id={i} value={value && value[i]} onChange={onChange} onChoose={setChosenFurniture}/>
            ))}
          </ul>
        ))}
        options={{
          perView: 2,
          gap: 10,
        }}
        bullets
      />
      <div className="furniture__total">
        {t(TRANSLATION.CHOSEN)} <span style={{ color: SITE_CONSTANTS.PALETTE.primary.dark }}>
          {value ? _.sum(Object.values(value)) : 0}
        </span>&nbsp;&nbsp;&nbsp;
        {t(TRANSLATION.TOTAL_ITEMS)}&nbsp;
        <span style={{ color: SITE_CONSTANTS.PALETTE.primary.dark }}>{total}</span>
      </div>
    </div>
  )
}

export default Furniture