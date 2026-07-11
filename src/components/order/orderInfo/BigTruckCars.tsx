import React from 'react'
import images from '../../../constants/images'
import logicOptions from '../../../constants/logicOptions'
import { t, TRANSLATION } from '../../../localization'
import SITE_CONSTANTS from '../../../siteConstants'
import { ELogic, IOrder } from '../../../types/types'
import OrderField from './OrderField'

interface IProps {
  order: IOrder
}

const BigTruckCars: React.FC<IProps> = ({ order }) => {
  if (!order.b_options?.bigTruckCarTypes?.length) return null

  return (
    <OrderField
      image={images.bigTruck}
      alt={t(TRANSLATION.CAR_QUANTITY_AND_CAR_TYPE)}
      title={t(TRANSLATION.CAR_QUANTITY_AND_CAR_TYPE)}
      value={`${order.b_options?.carsCount}, ${
        order.b_options?.bigTruckCarTypes.map(item => t(
          (SITE_CONSTANTS.BIG_TRUCK_TRANSPORT_TYPES.find(i => i.key === item) as any)
            .value,
          { toLower: true },
        )).join(` ${t(
          (logicOptions.find(l => l.value === order.b_options?.bigTruckCarLogic || ELogic.Or) as any).label,
        )} `)
      }`}
    />
  )
}

export default BigTruckCars