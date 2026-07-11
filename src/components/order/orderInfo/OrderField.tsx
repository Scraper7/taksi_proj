import React from 'react'

interface IProps {
  title: string,
  value: string | React.ReactNode,
  image: string,
  alt: string
}

const OrderField: React.FC<IProps> = ({ title, value, image, alt }) => {
  return <React.Fragment>
    <div className="order-fields">
      <img src={image} alt={alt}/>
      <label className="colored">
        <span className="order-fields__title">{title}:</span>
        {value}
      </label>
    </div>
    <div className="order__separator"/>
  </React.Fragment>
}

export default OrderField