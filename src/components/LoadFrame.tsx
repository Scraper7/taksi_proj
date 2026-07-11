import images from '../constants/images'
import React from 'react'
import { t, TRANSLATION } from '../localization'

interface IProps {
  title?: string
}

const LoadFrame: React.FC<IProps> = ({ title }) => {
  return <div className="loading-frame">
    <img src={images.fetching} alt={t(TRANSLATION.FETCHING)}/>
    <div className="loading-frame__title colored">{title || t(TRANSLATION.LOADING, { toLower: true })}</div>
  </div>
}

export default LoadFrame