import React from 'react'
import { t, TRANSLATION } from '../../../localization'
import OrderField from './OrderField'
import { formatComment } from '../../../tools/utils'
import { IOrder } from '../../../types/types'
import images from '../../../constants/images'

interface IProps {
  order: IOrder
}

const Comment: React.FC<IProps> = ({ order }) => {
  return (
    <div className="order-info__comment">
      <OrderField
        image={images.chatIconBr}
        alt={t(TRANSLATION.CHAT)}
        title={t(TRANSLATION.COMMENT)}
        value={formatComment(order.b_comments, order.b_custom_comment, order.u_id, order.b_options)}
      />
    </div>
  )
}

export default Comment