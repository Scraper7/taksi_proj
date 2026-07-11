import React from 'react'
import OrderField from './OrderField'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import images from '../../../constants/images'

interface IProps {
  order: IOrder
}

const Elevator: React.FC<IProps> = ({ order }) => {
  return order.b_options?.elevator?.elevator ?
    <div className="order-info__elevator">
      <OrderField
        image={images.elevator}
        alt={t(TRANSLATION.ELEVATOR)}
        title={t(TRANSLATION.ELEVATOR)}
        value={
          `${
            t(TRANSLATION.YES, { toLower: true })
          }
          `
        }
      />
    </div> :
    null
}

export default Elevator