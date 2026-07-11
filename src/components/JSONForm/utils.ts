import { t } from '../../localization'
import {
  TOption, TFormElement, TExpression, TCondition, TOperation, TFormValues,
} from './types'

export const isExpression = (value: any) => {
  if (typeof value !== 'object') return false
  if (!value.expression || !value.result) return false
  if (!Array.isArray(value.expression)) return false
  return value.expression.reduce((res: boolean, item: any) => res && item.length === 3, true)
}

export const isCalculate = (value: any) => {
  if (!Array.isArray(value)) return false
  return value.reduce((res: boolean, item: any) => res && isExpression(item), true)
}

export const getConditionResult = (left: any, op: TOperation, right: any) => {
  switch (op) {
    case '=':
      return left == right // eslint-disable-line eqeqeq

    case '>':
      return left > right

    case '<':
      return left < right

    case '>=':
      return left >= right

    case '<=':
      return left <= right
  }
}

export const getTranslation = (str: any) => {
  if (typeof str !== 'string') return str
  const translate = t(str)
  return translate.toLowerCase() === 'error' ? str : translate
}

export const parseVariable = (str: any, variables: Record<string, any>) => {
  if (typeof str !== 'string' || str[0] !== '@') return str
  let result = variables
  str.substr(1).split('.').forEach(key => {
    result = result && result[key]
  })
  return result
}

export const getCalculation = (calculate: any, values?: TFormValues, variables?: Record<string, any>) => {
  if (!isCalculate(calculate)) {
    return values === undefined ? () => calculate : calculate
  }

  const resultFn = (values: TFormValues) => {
    let returnValue: any
    calculate.forEach((exp: TExpression<any>) => {
      const { expression, result } = exp
      expression.forEach((item: TCondition) => {
        if (returnValue) return
        const [ key, op, right ] = item
        let left = values[key]
        if (left === undefined && variables) {
          left = parseVariable(key, variables)
        }
        if (getConditionResult(left, op, right)) returnValue = result
      })
    })
    return returnValue
  }
  return values === undefined ? resultFn : resultFn(values)
}

export const isRequired = (
  field: TFormElement,
  values?: TFormValues,
  variables?: Record<string, any>,
): boolean => {
  return values ?
    field.validation?.required != null ?
      getCalculation(field.validation.required, values, variables) :
      ['select', 'radio']
        .includes(getCalculation(field.type, values, variables) as any) :
    typeof field.validation?.required === 'boolean' ?
      field.validation.required :
      typeof field.type === 'string' ?
        ['select', 'radio'].includes(field.type as any) :
        false
}

export function* getOptions(field: TFormElement): Iterable<TOption> {
  if (!field.options)
    return

  if (field.options instanceof Array) {
    for (const item of field.options)
      if ('value' in item)
        yield item
  }

  else {
    const path = field.options.path.split('.')
    const map = path.reduce((res, key) => res[key], (window as any).data)

    if (map && typeof map === 'object')
      for (const num in map)
        yield {
          value: num,
          labelLang: map[num],
        }
  }
}