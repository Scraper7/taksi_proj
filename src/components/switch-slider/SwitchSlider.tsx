import React from 'react'
import './styles.scss'
import cn from 'classnames'
import { Helmet } from 'react-helmet-async'
import SITE_CONSTANTS from '../../siteConstants'

interface IButton {
  label: string
}

interface IProps extends React.ComponentProps<'input'> {
  onValueChanged: (value: boolean) => any
  isVertical?: boolean
  startButton?: IButton
  endButton?: IButton
  wrapperClassName?: string
  oneline?: boolean
}

const SwitchSlider: React.FC<IProps> = ({
  onValueChanged,
  isVertical,
  startButton,
  endButton,
  wrapperClassName,
  ...inputProps
}) => (
  <div className={cn('switcher__wrapper', wrapperClassName, { 'switcher__wrapper--vertical': isVertical })}>
    <Helmet>
      <style>
        {`
          input:checked + .switcher__slider-circle {
            background-color: ${SITE_CONSTANTS.PALETTE.primary.main};
          }

          input:focus + .switcher__slider-circle {
            box-shadow: 0 0 5px ${SITE_CONSTANTS.PALETTE.primary.dark};
          }
        `}
      </style>
    </Helmet>
    {startButton && <button onClick={() => onValueChanged(false)} type='button' className="switcher__button">
      {startButton.label}
    </button>}
    <label className="switcher__slider">
      <input type="checkbox" checked={!!inputProps.value} {...inputProps} onChange={e => onValueChanged(e.target.checked)}/>
      <span className="switcher__slider-circle"/>
    </label>
    {endButton && <button onClick={() => onValueChanged(true)} type='button' className="switcher__button">
      {endButton.label}
    </button>}
  </div>
)

export default SwitchSlider