import React from 'react'
import { IOrder } from '../../../types/types'

interface IProps {
  order: IOrder
}

const Attachments: React.FC<IProps> = ({ order }) => {
  return null
  // return order.b_options?.files ?
  //   <div className="order-info__furniture">
  //     <OrderField
  //       image={images.photoCamera}
  //       alt={t(TRANSLATION.ATTACHMENTS)}
  //       title={t(TRANSLATION.ATTACHMENTS)}
  //       value={
  //         order.b_options.files.map((i: string) => <img src={i} alt={t(TRANSLATION.ATTACHMENTS)} />)
  //       }
  //     />
  //   </div> :
  //   null
}

export default Attachments