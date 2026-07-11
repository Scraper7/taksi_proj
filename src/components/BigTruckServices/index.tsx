import cn from 'classnames'
import React, { useState } from 'react'
import { Helmet } from 'react-helmet-async'
import bigTruckServices, { IBigTruckService } from '../../constants/bigTruckServices'
import { t, TRANSLATION } from '../../localization'
import { gradient } from '../../tools/theme'
import Button from '../Button'
import './styles.scss'
import { EColorTypes } from '../../types/types'

type TValue = IBigTruckService['id'][]

export interface IProps {
  value: TValue
  onChange: (ids: TValue) => void
}

const BigTruckServices: React.FC<IProps> = ({ value, onChange }) => {
  const [currentItemId, setCurrentItemId] = useState<IBigTruckService['id'] | null>(null)

  const handleCellClick = (id: IBigTruckService['id']) => {
    setCurrentItemId(id)
  }
  const handleOrderClick = () => {
    currentItemId !== null && onChange(value.concat(currentItemId))
    setCurrentItemId(null)
  }
  const handleCancelClick = () => {
    currentItemId !== null && onChange(value.filter(item => item !== currentItemId))
    setCurrentItemId(null)
  }

  const currentItem = currentItemId !== undefined ? bigTruckServices.find(item => item.id === currentItemId) : null

  return (
    <div className="bigTruckServices">
      <Helmet>
        <style>
          {`
            .bigTruckServices__cell--selected, .bigTruckServices__cell--current {
              background: ${gradient()};
            }
          `}
        </style>
      </Helmet>

      <label className="input__label">{t(TRANSLATION.ADDITIONAL_SERVICES_P)}:</label>
      <div className="bigTruckServices__body">
        {
          bigTruckServices
            .map(item => {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleCellClick(item.id)}
                  className={
                    cn(
                      'bigTruckServices__cell',
                      {
                        'bigTruckServices__cell--selected': value.includes(item.id),
                        'bigTruckServices__cell--current': currentItemId === item.id,
                      },
                    )
                  }
                >
                  {t(item.label)}
                </button>
              )
            })}
      </div>

      {currentItem?.description &&
        <div className="bigTruckServices__description">
          {t(currentItem.description)}
        </div>
      }

      {currentItemId !== null && (
        <>
          {
            !value.includes(currentItemId) &&
            <Button
              type="button"
              text={t(TRANSLATION.TO_ORDER, { toUpper: true })}
              onClick={handleOrderClick}
            />
          }
          {
            value.includes(currentItemId) &&
            <Button
              type="button"
              text={t(TRANSLATION.CANCEL, { toUpper: true })}
              colorType={EColorTypes.Accent}
              onClick={handleCancelClick}
            />
          }
        </>
      )}
    </div>
  )
}

export default BigTruckServices