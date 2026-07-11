import React from 'react'
import bigTruckServices from '../../../constants/bigTruckServices'
import images from '../../../constants/images'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import OrderField from './OrderField'

interface IProps {
  order: IOrder
}

const BigTruckServices: React.FC<IProps> = ({ order }) => {
  if (!order.b_options?.bigTruckServices) return null

  return (
    <OrderField
      image={images.bigTruck}
      alt={t(TRANSLATION.ADDITIONAL_SERVICES_P)}
      title={t(TRANSLATION.ADDITIONAL_SERVICES_P)}
      value={order.b_options.bigTruckServices.map(
        item => t(bigTruckServices.find(i => i.id === item)?.label as string, { toLower: true }),
      ).join(', ')}
    />
  )
}

export default BigTruckServices