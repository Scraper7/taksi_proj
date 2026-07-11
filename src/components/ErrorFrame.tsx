import images from '../constants/images'
import React from 'react'
import { t, TRANSLATION } from '../localization'

interface IProps {
   title?: string,
   image?: string,
   renderImage?: () => any
}

const LoadFrame: React.FC<IProps> = ({ title, image = images.error, renderImage }) => {
  return <div className="loading-frame">
    <div className="loading-frame__title">{title}</div>
    {!!renderImage ? renderImage() : <img src={image} alt={t(TRANSLATION.ERROR)} style={{ marginTop: '20px' }}/>  }
  </div>
}

export default LoadFrame