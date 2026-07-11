import React from 'react'
import OrderField from './OrderField'
import SITE_CONSTANTS, { CURRENCY } from '../../../siteConstants'
import { t, TRANSLATION } from '../../../localization'
import { IOrder } from '../../../types/types'
import images from '../../../constants/images'

interface IProps {
  order: IOrder
}

const Delivery: React.FC<IProps> = ({ order }) => {
  if (!order?.b_options?.object) return null

  const getCostText = (cost?: number) => {
    const _costSettings = SITE_CONSTANTS.LIST_OF_CARGO_VALUATION_AMOUNTS?.split(',')

    if (!_costSettings || _costSettings.length !== 2) return ''

    switch (cost) {
      case (+_costSettings[0]): return `${t(TRANSLATION.NUMBER_TILL)} ${_costSettings[0]}${CURRENCY.SIGN}`
      case (-+_costSettings[1]): return `${t(TRANSLATION.NUMBER_TILL)} ${_costSettings[1]}${CURRENCY.SIGN}`
      case (+_costSettings[1]): return `${t(TRANSLATION.NUMBER_FROM)} ${_costSettings[1]}${CURRENCY.SIGN}`
      default: return ''
    }
  }


  const _image = order.b_comments?.includes('98') ? images.deliveryRed : images.motorcycleRed,
    _title = t(TRANSLATION.WHAT_WE_DELIVERING),
    _value = (order.b_options.object ? order.b_options.object : '') +
      ' ' +
      (
        order.b_options.weight ?
          `${t(TRANSLATION.NUMBER_TILL)} ${order.b_options.weight}${t(TRANSLATION.KG)}` :
          getCostText(order.b_options.cost)
      )

  return <div className="order-info__delivery">
    <OrderField image={_image} alt={'delivery'} title={_title} value={_value}/>
  </div>
}

export default Delivery