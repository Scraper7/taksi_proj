import React from 'react'
import OrderField from './OrderField'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import images from '../../../constants/images'
import { stringifyDateTime } from '../../../tools/dateTime'

interface IProps {
  order: IOrder
}

const DateTimeInterval: React.FC<IProps> = ({ order }) => {
  if (!order.b_options?.fromDateTimeInterval && !order.b_options?.tillDateTimeInterval) return null
  return (
    <OrderField
      image={images.date}
      alt={t(TRANSLATION.DATE_P)}
      title={t(TRANSLATION.DATE_P)}
      value={
        `${
          order.b_options?.fromDateTimeInterval ?
            `${t(TRANSLATION.DATE_FROM, { toLower: true })} ${
              stringifyDateTime(order.b_options.fromDateTimeInterval)
            } ` :
            ''
        }${
          order.b_options?.tillDateTimeInterval ?
            `${t(TRANSLATION.DATE_TILL, { toLower: true })} ${
              stringifyDateTime(order.b_options.tillDateTimeInterval)
            }` :
            ''
        }`
      }
    />
  )
}

export default DateTimeInterval