import React, { InputHTMLAttributes, useMemo } from 'react'
import cn from 'classnames'
import { Helmet } from 'react-helmet-async'
import './styles.scss'
import { gradient } from '../../tools/theme'

interface IProps extends InputHTMLAttributes<HTMLInputElement> {
  textLabel?: string
}

const RadioCheckbox: React.FC<IProps> = ({ textLabel, ...props }) => {
  const id = useMemo(() => Math.random().toString().slice(2), [])

  return (
    <>
      <Helmet>
        <style>
          {`
            .radio__input:checked + .radio__label::before {
              background: ${gradient()}
            }
          `}
        </style>
      </Helmet>
      <span className="radio__wrapper">
        <input
          type="checkbox"
          id={id}
          {...props}
          className={cn('radio__input', props.className)}
        />
        <label className="radio__label" htmlFor={props.id || id}/>
        {textLabel && <label className="input__label radio__text-label" htmlFor={props.id || id}>{textLabel}</label>}
      </span>
    </>
  )
}

export default RadioCheckbox