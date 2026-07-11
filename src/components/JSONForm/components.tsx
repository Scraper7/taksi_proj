import React, { useState } from 'react'
import { t } from '../../localization'
import Alert from '../Alert/Alert'
import { getCalculation, parseVariable } from './utils'
import { TCalculate } from './types'

const CustomAlert = (props: any) => {
  const [ isVisible, setIsVisible ] = useState(true)

  return !isVisible ?
    null :
    (
      <Alert
        {...props}
        message={props.message && (t(props.message) === 'Error' ? props.message : t(props.message))}
        onClose={() => setIsVisible(false)}
      />
    )
}

const customComponents: Record<string, any> = {
  alert: CustomAlert,
}

interface IPropsCustomComponent {
  component?: string,
  props?: Record<string, any>,
  values: any,
  variables?: Record<string, any>,
  visible?: boolean | string | TCalculate<boolean | string>
}

const CustomComponent: React.FC<IPropsCustomComponent> = ({
  component,
  props = {},
  values,
  visible,
  variables = {},
}) => {
  if (
    !component ||
        !customComponents[component] ||
        !parseVariable(getCalculation(visible, values), variables)
  ) return null
  const Component = customComponents[component]
  const computedProps = Object.keys(props).reduce((res, key) => ({
    ...res,
    [key]: parseVariable(getCalculation(props[key], values), variables),
  }), {})

  return <Component {...computedProps} />
}

export default CustomComponent