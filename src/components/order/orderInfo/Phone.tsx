import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import images from '../../../constants/images'
import { t, TRANSLATION } from '../../../localization'
import { IRootState } from '../../../state'
import { userSelectors } from '../../../state/user'
import { EBookingDriverState, IOrder } from '../../../types/types'

interface IProps extends ConnectedProps<typeof connector> {
  order: IOrder,
}

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
})

const connector = connect(mapStateToProps)

// TODO use OrderField
const OrderPhone: React.FC<IProps> = ({ user, order }) => {
  if (
    !order.b_contact ||
    (
      order.b_comments?.includes('96') &&
      !order.drivers?.find(item => item.c_state > EBookingDriverState.Canceled && item.u_id === user?.u_id)
    )
  ) return null

  return <div className="order-info__phone">
    <div className="order-fields">
      <img src={images.phone} alt={t(TRANSLATION.PHONE)}/>
      <label className="colored">
        <span className="order-fields__title">{t(TRANSLATION.CLIENT_TEL_MAIN)}:</span>
        <a className="phone-link" href={`tel:${order['b_contact']}`}>{order['b_contact']}</a>
      </label>
    </div>
    <div className="order__separator"/>
  </div>
}

export default connector(OrderPhone)