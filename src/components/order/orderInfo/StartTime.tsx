import React from 'react'
import images from '../../../constants/images'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import { dateFormatDate, dateShowFormat } from '../../../tools/utils'
import OrderField from './OrderField'

interface IProps {
  order: IOrder
}

const StartTime: React.FC<IProps> = ({ order }) => {
  if (order.b_comments?.includes('95')) return null

  return <div className="order-info__start-time">
    <OrderField
      image={images.clockBlue}
      alt={t(TRANSLATION.CLOCK)}
      title={t(TRANSLATION.START_TIME)}
      value={order.b_start_datetime?.format(
        order.b_options?.time_is_not_important ? dateFormatDate : dateShowFormat,
      )}
    />
  </div>
}

export default StartTime