import React, { useId } from 'react'
import cn from 'classnames'
import './styles.scss'
import { Helmet } from 'react-helmet-async'
import SITE_CONSTANTS from '../../siteConstants'

export enum ECheckboxStyles {
  Default,
  RedDesign,
}

interface IProps extends React.ComponentProps<'input'> {
  label: string,
  wrapperClassName?: string,
  wrapperAdditionalClassName?: string
  checkboxStyle?: ECheckboxStyles
}

const Checkbox = React.forwardRef<HTMLInputElement, IProps>((
  {
    label,
    wrapperClassName,
    wrapperAdditionalClassName,
    checkboxStyle = ECheckboxStyles.Default,
    ...inputProps
  },
  ref,
) => {
  const innerId = useId()
  const id = inputProps.id ?? inputProps.name ?? innerId

  return (
    <div
      className={wrapperClassName || cn(
        'checkbox',
        checkboxStyle !== ECheckboxStyles.Default && 'checkbox--style--' + {
          [ECheckboxStyles.RedDesign]: 'red-design',
        }[checkboxStyle],
        wrapperAdditionalClassName,
        {
          'checkbox--disabled': inputProps.disabled,
        },
      )}
    >
      <Helmet>
        <style>
          {`
          .checkbox input + label:before {
            border: 2px solid ${SITE_CONSTANTS.PALETTE.primary.dark};
          }
          `}
        </style>
      </Helmet>
      <input
        ref={ref}
        type="checkbox"
        className={cn('checkbox__input', inputProps.className)}
        {...inputProps}
        id={id}
      />
      <label
        htmlFor={id}
        className="colored checkbox__label"
      >
        {label}
      </label>
    </div>
  )
})

export default Checkbox