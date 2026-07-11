import React from 'react'
import OrderField from './OrderField'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import images from '../../../constants/images'

interface IProps {
  order: IOrder
}

const Boxing: React.FC<IProps> = ({ order }) => {
  return order.b_comments?.includes('98') ?
    <div className="order-info__boxing">
      <OrderField
        image={images.boxing}
        alt={t(TRANSLATION.BOXING)}
        title={t(TRANSLATION.BOXING)}
        value={
          t(
            order.b_options?.is_loading_needs ?
              TRANSLATION.REQUIRED :
              TRANSLATION.NOT_REQUIRED,
            { toLower: true },
          )
        }
      />
    </div> :
    null
}

export default Boxing