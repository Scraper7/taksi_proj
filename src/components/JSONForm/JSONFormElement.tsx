import React, { useCallback, useState, useEffect } from 'react'
import cn from 'classnames'
import { ILanguage } from '../../types/types'
import { getPhoneMask } from '../../tools/phoneUtils'
import { t } from '../../localization'
import Button from '../Button'
import { TFormElement, TOption, TFormValues } from './types'
import {
  getCalculation, isRequired,
  getTranslation, parseVariable,
} from './utils'
import './styles.scss'

interface IProps {
  element: TFormElement
  validationSchema?: any
  onChange: (e: any, name: string, value: any) => any
  values?: TFormValues
  language?: ILanguage
  variables?: Record<string, any>
  errors?: Record<string, any>
}

function JSONFormElement({
  onChange = () => {},
  values = {},
  validationSchema,
  language,
  variables = {},
  errors = {},
  element: formElement,
}: IProps) {
  const {
    accept,
    placeholder,
    multiple,
    visible,
    disabled,
    options = [],
  } = formElement

  const [ errorMessage, setErrorMessage ] = useState<string>('')
  const [ files, setFiles ] = useState<[any, File][]>()
  const name: string = getCalculation(formElement.name, values, variables)
  const type = getCalculation(formElement.type, values, variables)
  const value = values[name]
  const hintTextName = `hint_${name.split('.').slice(-1)[0]}`
  let hint = formElement.hint
  if (!hint && getTranslation(hintTextName) !== hintTextName) {
    hint = getTranslation(hintTextName)
  }

  useEffect(() => {
    if (type === 'file' && value) {
      setFiles(value)
    }
  }, [])

  const validate = useCallback((value: any) => {
    if (!validationSchema) return
    validationSchema.validate(value)
      .then(() => {
        setErrorMessage('')
      })
      .catch((error: any) => {
        setErrorMessage(error.message)
      })
  }, [])

  if (visible) {
    const isVisible = getCalculation(visible, values, variables)
    if (!isVisible) return null
  }

  type TElement = HTMLInputElement | HTMLSelectElement
  const calculatedDisabled = parseVariable(
    getCalculation(disabled, values, variables),
    variables,
  )
  const commonProperties = {
    name,
    disabled: calculatedDisabled,
    onChange(event: React.ChangeEvent<TElement>) {
      const value = getValue(event)
      validate(value)
      onChange(event, event.target.name, value)
    },
    onBlur(event: React.ChangeEvent<TElement>) {
      validate(getValue(event))
    },
  }
  const getValue = (event: React.ChangeEvent<TElement>) => type === 'select' ?
    event.target.value || null :
    event.target.value

  let hintElement: any = !hint ?
    null :
    (
      <div className="element__hint">
        <span className="element__hint_icon">?</span>
        <div className={`element__hint_message element__hint_message_${!formElement.label ? 'left' : 'right'}`}>
          {getTranslation(hint)}
        </div>
      </div>
    )

  let labelElement: any = !formElement.label ?
    null :
    (
      <div className="element__label">
        {getTranslation(getCalculation(formElement.label, values, variables))}
        {isRequired(formElement, values, variables) && <span className="element__required">*</span>}
        {hintElement}
      </div>
    )
  let element

  if (type === 'hidden') {
    return (
      <input
        type='hidden'
        name={name}
        value={value}
      />
    )
  }

  if (type === 'button' || type === 'submit') {
    const disabledByFormInvalid = getCalculation(disabled, values, variables) === '@form.invalid'

    return (
      <Button
        type={type}
        text={getTranslation(getCalculation(formElement.label, values, variables))}
        disabled={type === 'submit' && disabledByFormInvalid ? false : calculatedDisabled}
        skipHandler
      />
    )
  }

  if (type === 'select') {
    const required = isRequired(formElement, values, variables)
    const selectOptions = getCalculation(options, values, variables)
    element = (
      <select
        {...commonProperties}
        value={value ?? ''}
        className='element__select_input'
      >
        {!required && <option value="">-</option>}
        {selectOptions.map((option: TOption) => (
          <option key={option.value} value={option.value}>
            {!!option.label && getTranslation(option.label)}
            {!!option.labelLang && !!language && option.labelLang[language.iso]}
          </option>
        ))}
      </select>
    )
  }

  if (type === 'radio') {
    const radioOptions = getCalculation(options, values, variables)
    element = (
      <>
        {radioOptions.map((option: TOption) => (
          <label key={option.value} className='element__radio'>
            <input
              {...commonProperties}
              disabled={option.disabled}
              type='radio'
              className='element__radio_input'
              value={option.value}
              checked={values[name] === option.value}
            />
            <span>{getTranslation(option.label)}</span>
          </label>
        ))}
      </>
    )
  }

  if (type === 'checkbox') {
    labelElement = null
    element = (
      <label className='element__checkbox'>
        <input
          {...commonProperties}
          type='checkbox'
          className='element__checkbox_input'
          checked={value}
          onChange={e => onChange(e, e.target.name, e.target.checked)}
        />
        <span>
          <span
            dangerouslySetInnerHTML={{
              __html: getTranslation(getCalculation(formElement.label, values, variables)),
            }}
          />
          {isRequired(formElement, values, variables) && <span className="element__required">*</span>}
        </span>
      </label>
    )
  }

  if (type === 'phone') {
    element = (
      <input
        {...commonProperties}
        value={value || ''}
        type="tel"
        className='element__text_input'
        placeholder={getPhoneMask()}
      />
    )
  } else if (type === 'file') {
    element = (
      <div className='element__file'>
        {!!files && files.map((file: [any, File], key: number) => (
          <div
            className='element__file_value'
            key={key}
            onClick={e => {
              const newFiles = files.filter((file, index: number) => index !== key)
              setFiles(newFiles)
              onChange(e, name, newFiles.length ? newFiles : null)
            }}
          >
            <img src={URL.createObjectURL(file[1])} alt="" />
          </div>
        ))}
        <label className={cn('element__file_add', {
          element__file_add_disabled: commonProperties.disabled,
        })}
        >
          <input
            {...commonProperties}
            className='element__file_input'
            type='file'
            multiple={multiple}
            accept={accept}
            onChange={e => {
              if (!e.target.files) return
              const inputFiles: [any, File][] = Array.from(e.target.files)
                .map((file: File) => ([ null, file ]))
              const newFiles = (files || []).concat(inputFiles)
              setFiles(newFiles)
              onChange(e, name, newFiles)
              e.target.value = ''
            }}
          />
        </label>
      </div>
    )
  }

  if (!element) {
    element = (
      <input
        {...commonProperties}
        value={value || ''}
        type={type}
        className='element__text_input'
        placeholder={placeholder}
      />
    )
  }

  const Wrap = ['file', 'radio', 'checkbox'].includes(type) ? 'div' : 'label'

  const subscription = type === 'file' && accept === 'image/png, image/jpeg, image/jpg' ? t('subscription_images_upload') : null

  return (
    <Wrap className={cn('element__field', {
      'element__field--error': errors[name],
    })}
    >
      {labelElement}
      <div className={type === 'file' || !hintElement ? '' : 'element__input'}>
        {element}
        {!labelElement && !!hint && hintElement}
      </div>
      {!!subscription && <div className="element__field_subscription">
        {subscription}
      </div>}
      {!!errorMessage && <div className='element__field_error'>
        {errorMessage}
      </div>}
      {!!errors[name] && !errorMessage && <div className='element__field_error'>
        {errors[name]}
      </div>}
    </Wrap>
  )
}

export default JSONFormElement
