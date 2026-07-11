import React from 'react'
import { t, TRANSLATION } from '../../../localization'
import OrderField from './OrderField'
import images from '../../../constants/images'

function Card() {
  return <div className="order-info__card">
    <OrderField
      image={images.cash}
      alt={t(TRANSLATION.CARD)}
      title={t(TRANSLATION.PAYMENT_WAY)}
      value={t(TRANSLATION.CASH)}
    />
  </div>
}

export default Card