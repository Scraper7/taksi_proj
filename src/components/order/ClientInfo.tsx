import React from 'react'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'
import { IOrder, IUser } from '../../types/types'

interface IProps {
  order: IOrder,
  client: IUser | null,
  user: IUser | null
}

const ClientInfo: React.FC<IProps> = ({
  order,
  client,
  user,
}) => {
  const _userName = client ? `${client.u_name} ${client.u_family} ${client.u_middle}` : '',
    _driver = !!user && order?.drivers?.find(item => item.u_id === user.u_id),
    _extInfo =
    order.b_canceled ?
      `(${t(TRANSLATION.CANCELED)})` :
      order.b_completed ?
        `(${t(TRANSLATION.FINISHED)})` :
        _driver ?
          `(${t(TRANSLATION.BOOKING_DRIVER_STATES[_driver.c_state])})` :
          ''

  return <div className="order__passenger-info">
    <div className="order_passenger-info">
      <img src={images.passengerAvatar} alt={t(TRANSLATION.PASSENGER)}/>
      <span>
        <span className="colored">{_userName} {_extInfo}</span>
        <div>
          <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
        </div>
      </span>
    </div>
    <div className="order__separator"/>
  </div>
}

export default ClientInfo