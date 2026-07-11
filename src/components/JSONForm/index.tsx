import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import * as yup from 'yup'
import { EStatuses, ILanguage } from '../../types/types'
import { firstItem, makeFlat, makeNested, deepGet } from '../../tools/utils'
import { IRootState } from '../../state'
import { configSelectors } from '../../state/config'
import { t, TRANSLATION } from '../../localization'
import JSONFormElement from './JSONFormElement'
import CustomComponent from './components'
import { TForm, TFormElement } from './types'
import { getCalculation, isRequired, getOptions, parseVariable } from './utils'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  language: configSelectors.language(state),
  configStatus: configSelectors.status(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {
  language: ILanguage,
  configStatus: EStatuses,
  fields: TForm,
  onSubmit?: (values: any) => any,
  onChange?: (fieldName: string, value: any) => any,
  defaultValues?: Record<string, any>,
  errors?: Record<string, any>,
  state?: {
    success?: boolean,
    failed?: boolean,
    pending?: boolean,
    errorMessage?: string,
  }
}

function JSONForm({
  configStatus,
  language,
  onSubmit,
  onChange,
  state = {},
  defaultValues = {},
  errors = {},
  fields,
}: IProps) {

  const [unfilteredValues, setValues] = useState(() => {
    const initialValues: Record<string, any> = makeFlat(defaultValues)

    const reverseFilteredDefaults: Record<string, any> = {}
    for (const field of fields) {
      if (!(
        field.name &&
        !Array.isArray(field.options) &&
        field.options?.filter
      )) continue
      const { path, filter } = field.options

      const value = initialValues[field.name] ?? field.defaultValue
      const map = deepGet((window as any).data, path)
      const filterFieldValue = (map as any)?.[value as any]?.[filter.field]
      if (filterFieldValue != null)
        reverseFilteredDefaults[filter.by] = filterFieldValue
    }

    for (const field of fields) {
      if (!field.name)
        continue

      let value = initialValues[field.name] ??
        reverseFilteredDefaults[field.name] ??
        field.defaultValue ??
        null

      if (value === null) {
        if (field.type === 'checkbox')
          value = false

        if ([
          'select', 'radio',
        ].includes(field.type as any) && isRequired(field))
          value = firstItem(getOptions(field))?.value

        if (!field.type || [
          'text', 'email', 'phone', 'password', 'hidden',
        ].includes(field.type as any))
          value = ''
      }

      initialValues[field.name] = value
    }

    return initialValues
  })
  const [formErrors, setFormErrors] = useState(errors)

  useEffect(() => {
    setFormErrors(errors)
  }, [errors])

  const getLengthValidationMessage = (name: string) =>
    name.includes('card') ?
      t(TRANSLATION.CARD_NUMBER_PATTERN_ERROR) :
      t(TRANSLATION.PASSWORD_MIN_LENGTH)

  const [form, values] = useMemo(() => {
    const form: TFormElement[] = []
    const values = { ...unfilteredValues }

    for (const field of fields) {
      if (
        field.type === 'select' &&
        !Array.isArray(field.options) &&
        field.options?.path
      ) {
        const map = deepGet((window as any).data, field.options.path)
        // Если есть фильтр, применяем его
        if (field.options.filter) {
          const filterBy = field.options.filter.by
          const filterField = field.options.filter.field
          const selectedValue = values[filterBy]

          // Проверяем, что map существует и является объектом
          if (!map || typeof map !== 'object') {
            form.push({
              ...field,
              options: [],
              defaultValue: undefined,
              disabled: true,
            })
            continue
          }

          // Фильтруем опции по выбранному значению
          const filteredOptions = Object.entries(map)
            .filter(([_, value]: [string, any]) => {
              if (!value || typeof value !== 'object') return false
              return value[filterField]?.toString() === selectedValue?.toString()
            })
            .map(([num, value]: [string, any]) => ({
              value: num,
              labelLang: value,
            }))

          if (
            field.name &&
            (isRequired(field) || values[field.name] != null) &&
            (map as any)[values[field.name]]?.[filterField]?.toString() !== selectedValue?.toString()
          ) values[field.name] = filteredOptions[0]?.value ?? null
          // Если после фильтрации нет опций, показываем пустой список
          if (filteredOptions.length === 0)
            form.push({
              ...field,
              options: [{
                value: '',
                labelLang: { ru: '', en: '' },
              }],
              defaultValue: '',
              disabled: true,
            })
          else
            form.push({
              ...field,
              options: filteredOptions,
              defaultValue: filteredOptions[0]?.value,
            })
        } else {
          // Стандартная обработка без фильтрации
          if (!map || typeof map !== 'object')
            form.push({
              ...field,
              options: [],
              defaultValue: undefined,
              disabled: true,
            })
          else {
            const options = Object.entries(map).map(([num, value]) => ({
              value: num,
              labelLang: value,
            }))
            form.push({
              ...field, options,
              defaultValue: options[0]?.value,
            })
          }
        }
      }

      else
        form.push(field)
    }

    return [form, values]
  }, [fields, unfilteredValues])

  const validationSchema = form.reduce((res: any, item: TFormElement) => {
    const { name, type, validation = {} } = item
    if (!name) return res
    if (item.visible != null && !getCalculation(item.visible, values, { form: {} }))
      return res
    if (parseVariable(getCalculation(item.disabled, values, { form: {} }), { form: {} }))
      return res
    let obj

    if (type === 'file') {
      obj = yup.array()
    }

    else if (type === 'number') {
      obj = yup.number()

      if (getCalculation(validation.max, values)) {
        obj = obj.max(getCalculation(validation.max, values), t(TRANSLATION.CARD_NUMBER_PATTERN_ERROR))
      }
      if (getCalculation(validation.min, values)) {
        obj = obj.min(getCalculation(validation.min, values), t(TRANSLATION.CARD_NUMBER_PATTERN_ERROR))
      }
    }

    else if (type === 'checkbox') {
      obj = yup.bool()

      if (isRequired(item, values))
        obj = obj.oneOf([true], t(TRANSLATION.REQUIRED_FIELD))

      return {
        ...res,
        [name]: obj,
      }
    }

    else if (type === 'select') {
      obj = yup.string().nullable()
    }

    else {
      obj = yup.string()

      if (type === 'email') {
        obj = obj.email(t(TRANSLATION.EMAIL_ERROR))
      }
      if (getCalculation(validation.length, values)) {
        obj = obj.length(getCalculation(validation.length, values), t(TRANSLATION.CARD_NUMBER_PATTERN_ERROR))
      }
      if (getCalculation(validation.max, values)) {
        obj = obj.max(getCalculation(validation.max, values), t(TRANSLATION.CARD_NUMBER_PATTERN_ERROR))
      }
      if (getCalculation(validation.min, values)) {
        obj = obj.min(getCalculation(validation.min, values), getLengthValidationMessage(name))
      }
      if (getCalculation(validation.pattern, values)) {
        const pattern: [string, string] = getCalculation(validation.pattern, values)
        if (Array.isArray(pattern)) {
          const regexp = new RegExp(...pattern)
          // Get phone mask from site constants
          const phoneMask = (window as any).data?.site_constants?.def_maska_tel?.value
          // Add phone mask as postfix to error message if it's a phone field
          const errorMessage = name === 'u_phone' && phoneMask ?
            `${t(TRANSLATION.PHONE_PATTERN_ERROR)} ${phoneMask}` :
            t(TRANSLATION.PHONE_PATTERN_ERROR)
          obj = obj.matches(getCalculation(regexp, values), errorMessage)
        }
      }
    }

    if (isRequired(item, values)) {
      if (type === 'file')
        obj = obj.min(1, t(TRANSLATION.REQUIRED_FIELD))
      else
        obj = obj.required(t(TRANSLATION.REQUIRED_FIELD))
    } else {
      obj = obj.nullable().optional()
    }

    return {
      ...res,
      [name]: obj,
    }
  }, {})
  const yupSchema = yup.object(validationSchema)
  const isValid = yupSchema.isValidSync(values)

  const handleChange = useCallback((e: any, name: any, value: any) => {
    setValues({
      ...values,
      [name]: value,
    })
    onChange && onChange(name, value)

    // Добавляем дополнительную валидацию для номера телефона
    if (name === 'u_phone' && value) {
      // Получаем маску телефона из констант
      const phoneMask = (window as any).data?.site_constants?.def_maska_tel?.value
      if (phoneMask) {
        // Извлекаем префикс из маски
        const prefixMatch = phoneMask.match(/^\+?(\d+)/)
        const prefix = prefixMatch ? prefixMatch[1] : ''

        // Проверяем, начинается ли номер с правильного префикса
        const digits = value.replace(/\D/g, '')
        const prefixWithoutPlus = prefix.replace('+', '')

        // Если номер не пустой и не начинается с правильного префикса, устанавливаем ошибку
        if (digits.length > 0 && !digits.startsWith(prefixWithoutPlus)) {
          setFormErrors({
            ...formErrors,
            [name]: t(TRANSLATION.PHONE_PATTERN_ERROR) + ' ' + phoneMask,
          })
        } else {
          // Если префикс правильный или номер пустой, удаляем ошибку
          const newErrors = { ...formErrors }
          delete newErrors[name]
          setFormErrors(newErrors)
        }
      }
    }
  }, [values, formErrors])

  const variables = useMemo(() => ({
    form: {
      valid: isValid,
      invalid: !isValid,
      pending: state.pending,
      submitSuccess: state.success,
      submitFailed: state.failed,
      errorMessage: state.errorMessage,
    },
  }), [isValid, state])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!onSubmit)
      return

    try {
      yupSchema.validateSync(values, { abortEarly: false })
      setFormErrors({})
    } catch (error: any) {
      const validationErrors: Record<string, string> = {}
      const innerErrors = Array.isArray(error?.inner) && error.inner.length ?
        error.inner :
        [error]

      innerErrors.forEach((item: any) => {
        if (item?.path && !validationErrors[item.path])
          validationErrors[item.path] = item.message
      })

      setFormErrors(validationErrors)
      return
    }

    const submitValues = { ...values }
    for (const field of form)
      if (
        !(field.submit ?? true) ||
        ([
          'button', 'submit',
        ] as const).includes(getCalculation(field.type, values, variables))
      ) {
        const key: string = getCalculation(field.name, values, variables)
        delete submitValues[key]
      }
    onSubmit(makeNested(submitValues))
  }

  return configStatus === EStatuses.Success && (
    <div style={{ position: 'relative', zIndex: 500 }}>
      <form onSubmit={handleSubmit}>
        {form.map((formElement: TFormElement, i: number) => formElement.name ?
          <JSONFormElement
            key={i}
            element={formElement}
            values={values}
            variables={variables}
            onChange={handleChange}
            validationSchema={validationSchema[formElement.name]}
            language={language}
            errors={formErrors}
          /> :
          <CustomComponent
            {...formElement}
            key={i}
            values={values}
            variables={variables}
          />,
        )}
      </form>
    </div>
  )
}

export default connector(JSONForm)
