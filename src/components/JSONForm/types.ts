type TElementType = 'text' |
  'email' |
  'number' |
  'phone' |
  'password' |
  'hidden' |
  'select' |
  'checkbox' |
  'radio' |
  'file' |
  'button' |
  'submit'

type TOperation = '=' | '<' | '>' | '<=' | '>=' | '!='

type TOption = {
  label?: string,
  labelLang?: Record<string, string>,
  disabled?: boolean,
  value: string | number
}

type TOptionData = {
  path: string,
  filter?: {
    by: string,
    field: string
  }
}

type TCondition = [string, TOperation, any]

type TExpression<Result> = {
  expression: TCondition[],
  result: Result
}

type TCalculate<Result> = TExpression<Result>[]

type TFormElement = {
  name?: string,
  placeholder?: string,
  hint?: string,
  defaultValue?: string | number | boolean,
  label?: string | TCalculate<string>,
  type?: TElementType | TCalculate<TElementType>,
  options?: TOptionData | TOption[] | TCalculate<TOptionData | TOption[]>,
  multiple?: boolean,
  accept?: string,
  visible?: boolean | string | TCalculate<boolean | string>,
  disabled?: boolean | string | TCalculate<boolean | string>,
  validation?: {
    email?: boolean | TCalculate<boolean>,
    required?: boolean | TCalculate<boolean>
    length?: number | TCalculate<number>,
    min?: number | TCalculate<number>,
    max?: number | TCalculate<number>,
    pattern?: string[] | TCalculate<string[]>
  },
  submit?: boolean,
  component?: string,
  props?: Record<string, any>,
}

type TForm = TFormElement[]

type TFormValues = Record<string, any>

export type {
  TCondition,
  TExpression,
  TOperation,
  TOption,
  TCalculate,
  TFormElement,
  TForm,
  TFormValues,
}