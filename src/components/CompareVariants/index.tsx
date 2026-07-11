import cn from 'classnames'
import React from 'react'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'
import { Helmet } from 'react-helmet-async'
import './styles.scss'
import { gradient } from '../../tools/theme'

export enum ECompareVariants {
  Greater,
  Equal,
  Less
}

interface IProps {
  value: ECompareVariants,
  onChange: (value: ECompareVariants) => any
}

const CompareVariants: React.FC<IProps> = ({ value, onChange }) => {
  const getImage = (variant: ECompareVariants) => {
    switch (variant) {
      case ECompareVariants.Equal:
        return <img src={images.equal} alt={t(TRANSLATION.EQUAL)} />
      case ECompareVariants.Less:
        return <img src={images.less} alt={t(TRANSLATION.LESS)} />
      case ECompareVariants.Greater:
        return <img src={images.more} alt={t(TRANSLATION.MORE)} />
    }
  }

  return (
    <div className="compareVariants">
      <Helmet>
        <style>
          {`
            .compareVariants__item--selected {
              background: ${gradient()};
            }
          `}
        </style>
      </Helmet>
      {
        (
          Object.keys(ECompareVariants)
            .filter(value => !isNaN(Number(value)))
            .map(item => parseInt(item)) as unknown as Array<ECompareVariants>
        )
          .map(item => (
            <button
              type="button"
              className={cn(
                'compareVariants__item',
                { 'compareVariants__item--selected': value === item },
              )}
              onClick={() => onChange(item)}
            >
              {getImage(item)}
            </button>
          ))
      }
    </div>
  )
}

export default CompareVariants