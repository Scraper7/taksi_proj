import React from 'react'
import { t, TRANSLATION } from '../../../localization'
import OrderField from './OrderField'
import { IOrder } from '../../../types/types'
import images from '../../../constants/images'

interface IProps {
  order: IOrder,
}

const BigSize: React.FC<IProps> = ({ order }) => {
  if (!order.b_options?.object) return null

  const _value = t(
    order.b_options.is_big_size ?
      TRANSLATION.YES :
      TRANSLATION.NO,
  )

  return (
    <div className="order-info__big-size">
      <OrderField
        image={images.bigSize}
        alt={'is big size'}
        title={t(TRANSLATION.LARGE_PACKAGE)}
        value={_value}
      />
    </div>
  )
}

export default BigSize