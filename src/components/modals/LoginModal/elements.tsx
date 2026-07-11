import React from 'react'
import cn from 'classnames'
import BaseInput, { EInputStyles } from '../../Input'

export function Input({
  fieldWrapperClassName,
  ...props
}: React.ComponentProps<typeof BaseInput>) {
  return (
    <BaseInput
      style={EInputStyles.Login}
      fieldWrapperClassName={cn('login-form__input', fieldWrapperClassName)}
      {...props}
    />
  )
}