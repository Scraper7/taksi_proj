import React from 'react'
import './styles.scss'
import { t, TRANSLATION } from '../../localization'
import { IRoom, IFurniture } from '../../types/types'
import cn from 'classnames'
import rooms from '../../constants/rooms'
import { gradient } from '../../tools/theme'
import { Helmet } from 'react-helmet-async'
import SITE_CONSTANTS from '../../siteConstants'

interface IProps {
  furnitureState: IFurniture['house']
  value: IRoom['id'] | null
  onChange: (value: IRoom['id']) => any
}

const Rooms: React.FC<IProps> = ({
  furnitureState,
  value,
  onChange,
}) => {
  return (
    <>
      <Helmet>
        <style>
          {`
            .rooms__item:hover, .rooms__item:focus, .rooms__item:active {
              border: 2px solid ${SITE_CONSTANTS.PALETTE.primary.main};
            }
            .rooms__item--furniture {
              border: 2px solid ${SITE_CONSTANTS.PALETTE.primary.main} !important;
            }
            .rooms__item--furniture.rooms__item--active::before {
              content: "";
              position: absolute;
              top: 0px;
              left: 0px;
              right: 0px;
              bottom: 0px;
              border-radius: 10px;
              border: 2px solid #fff;
            }
          `}
        </style>
      </Helmet>
      <label
        className="input__label"
      >
        {t(TRANSLATION.ROOM_LIST)}
      </label>
      <div className="rooms">
        {rooms.map(item =>
          <div
            key={item.id}
            onClick={() => onChange(item.id)}
            className={cn(
              'rooms__item',
              {
                'rooms__item--active': value === item.id,
                'rooms__item--furniture': furnitureState &&
                furnitureState[item.id] &&
                Object
                  .values(furnitureState[item.id])
                  .filter(Boolean)
                  .length,
              },
            )}
            style={{
              background: value === item.id ? gradient() : '#EEEEEE',
            }}
          >
            {t(item.label)}
          </div>,
        )}
      </div>
    </>
  )
}

export default Rooms