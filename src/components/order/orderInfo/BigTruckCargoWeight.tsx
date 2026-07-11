import React from 'react'
import images from '../../../constants/images'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import OrderField from './OrderField'

interface IProps {
  order: IOrder
}

const BigTruckCargoWeight: React.FC<IProps> = ({ order }) => {
  if (!order.b_options?.bigTruckCargoWeight) return null

  return (
    <OrderField
      image={images.boxing}
      alt={t(TRANSLATION.CARGO_WEIGHT_P)}
      title={t(TRANSLATION.CARGO_WEIGHT_P)}
      value={order.b_options?.bigTruckCargoWeight}
    />
  )
}

export default BigTruckCargoWeight