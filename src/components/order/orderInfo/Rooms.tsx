import React from 'react'
import OrderField from './OrderField'
import { t, TRANSLATION } from '../../../localization'
import { IFurniture, IOrder, IRoom, TRoomFurniture } from '../../../types/types'
import images from '../../../constants/images'
import furniture, { IFurnitureItem } from '../../../constants/furniture'
import { EMoveTypes } from '../../passenger-order/move/MoveTypeTabs'
import rooms from '../../../constants/rooms'

interface IProps {
  order: IOrder
}

// TODO: refactor
const Rooms: React.FC<IProps> = ({ order }) => {
  return order.b_options?.furniture ?
    <div className="order-info__furniture">
      {order.b_options.moveType === EMoveTypes.Apartament ?
        Object.entries<TRoomFurniture>(order.b_options.furniture as IFurniture['house'])
          .map(([roomID, room]: [string, TRoomFurniture]) => {
            const foundRoom = rooms.find(r => r.id === +roomID) as IRoom

            return (
              <OrderField
                image={images.furniture}
                alt={t(foundRoom.label)}
                title={t(foundRoom.label)}
                value={<>
                  {
                    order.b_options?.elevator?.steps[roomID] ?
                      `${order.b_options?.elevator?.steps[roomID]} ${t(TRANSLATION.STEPS)}, ` :
                      ''
                  }
                  {
                    Object.entries<number>(
                      room,
                    )
                      .filter(([key, value]) => !!value)
                      .map(([key, value], index) => {
                        const foundFurniture = furniture.find(i => i.id === +key) as IFurnitureItem
                        return (
                          <span key={key}>
                            {index !== 0 && ', '}
                            {
                              <img src={foundFurniture.image} alt={t(foundFurniture.label)}/>
                            }{
                              t(foundFurniture.label, { toLower: true })
                            }({value})
                          </span>
                        )
                      })
                  }
                </>}
              />
            )
          }) :
        (
          <OrderField
            image={images.furniture}
            alt={t(TRANSLATION.FURNITURE_LIST)}
            title={t(TRANSLATION.FURNITURE_LIST)}
            value={
              Object.entries(
                order.b_options.furniture,
              )
                .filter(([key, value]) => !!value)
                .map(([key, value], index) => {
                  const foundFurniture = furniture.find(i => i.id === +key) as IFurnitureItem
                  return (
                    <React.Fragment key={key}>
                      {index !== 0 && ', '}
                      {
                        <img src={foundFurniture.image} alt={t(foundFurniture.label)}/>
                      }{
                        t(foundFurniture.label, { toLower: true })
                      }({value})
                    </React.Fragment>
                  )
                })
            }
          />
        )}
    </div> :
    null
}

export default Rooms