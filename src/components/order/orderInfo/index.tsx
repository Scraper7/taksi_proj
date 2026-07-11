import React from 'react'
import OrderPhone from './Phone'
import StartTime from './StartTime'
import Comment from './Comment'
import Payment from './Payment'
import Boxing from './Boxing'
import BigSize from './BigSize'
import Delivery from './Delivery'
import { IOrder } from '../../../types/types'
import Rooms from './Rooms'
import Attachments from './Attachments'
import Elevator from './Elevator'
import DateTimeInterval from './DateTimeInterval'
import BigTruckCargo from './BigTruckCargo'
import Size from './Size'
import BigTruckCargoWeight from './BigTruckCargoWeight'
import BigTruckCars from './BigTruckCars'
import BigTruckServices from './BigTruckServices'

interface IProps {
  order?: IOrder | null
}

const OrderInfo: React.FC<IProps> = ({ order }) => {
  if (!order) return null

  return <div className="order-info">
    <OrderPhone order={order} />
    <Rooms order={order} />
    <Attachments order={order} />
    <Elevator order={order} />
    <StartTime order={order} />
    <Delivery order={order} />
    <BigSize order={order} />
    <Boxing order={order} />
    <Payment order={order} />
    <Comment order={order} />
    <BigTruckCars order={order} />
    <DateTimeInterval order={order} />
    <BigTruckCargo order={order} />
    <Size order={order} />
    <BigTruckCargoWeight order={order} />
    <BigTruckServices order={order} />
  </div>
}

export default OrderInfo