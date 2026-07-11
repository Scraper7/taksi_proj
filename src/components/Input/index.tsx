import React, { useMemo, useState, useRef } from 'react'
import './styles.scss'
import InputMask from '@mona-health/react-input-mask'
import SITE_CONSTANTS from '../../siteConstants'
import useMergedRef from '@react-hook/merged-ref'
import { ISelectOption } from '../../types'
import cn from 'classnames'
import Button, { EButtonShapes } from '../Button'
import { ESuggestionType, ISuggestion } from '../../types/types'
import { t, TRANSLATION } from '../../localization'
import { Helmet } from 'react-helmet-async'
import images from '../../constants/images'
import CompareVariants, { ECompareVariants } from '../CompareVariants'
import RadioCheckbox from '../RadioCheckbox'
import { replaceAllString } from '../../tools/compat'

type InputMaskProps = React.ComponentProps<typeof InputMask>

const getSuggestionClass = (type: ESuggestionType = ESuggestionType.PointOfficial) => {
  switch (type) {
    case ESuggestionType.PointOfficial:
      return 'official'
    case ESuggestionType.PointUnofficial:
      return 'unofficial'
    case ESuggestionType.PointUserTop:
      return 'user-top'
  }
}

const getSuggestionSourceLabel = (type: ESuggestionType = ESuggestionType.PointOfficial) => {
  switch (type) {
    case ESuggestionType.PointUserTop:
      return 'Личный'
    case ESuggestionType.PointUnofficial:
      return 'Общий'
    case ESuggestionType.PointOfficial:
    default:
      return 'Карта'
  }
}


const compactAddressPart = (value: string) => value
  .replace(/\s+/g, ' ')
  .trim()

const isHouseNumberPart = (value: string) => /^\d+[\wа-яёА-ЯЁ\-\/]*$/i.test(value.trim())

const isLowValueAddressPart = (value: string) => {
  const part = value.toLowerCase().trim()
  return !part ||
    /^\d{5,6}$/.test(part) ||
    part === 'россия' ||
    part.includes('федеральный округ') ||
    part.includes('область') ||
    part.includes('край') ||
    part.includes('городской округ') ||
    part.includes('муниципальный округ')
}

const buildCompactSuggestionAddress = (address?: string, shortAddress?: string) => {
  const source = String(shortAddress || address || '').trim()
  if (!source)
    return ''

  const parts = source
    .split(',')
    .map(compactAddressPart)
    .filter(Boolean)

  if (parts.length <= 2)
    return source

  let street = ''
  let house = ''
  let startIndex = 0

  if (isHouseNumberPart(parts[0]) && parts[1]) {
    house = parts[0]
    street = parts[1]
    startIndex = 2
  } else if (parts[1] && isHouseNumberPart(parts[1])) {
    street = parts[0]
    house = parts[1]
    startIndex = 2
  } else {
    street = parts[0]
    startIndex = 1
  }

  const main = [street, house].filter(Boolean).join(', ')
  const details = parts
    .slice(startIndex)
    .filter(part => !isLowValueAddressPart(part))
    .filter((part, index, list) => list.findIndex(item => item.toLowerCase() === part.toLowerCase()) === index)
    .slice(0, 2)
    .join(', ')

  const compact = details ? `${main} · ${details}` : main

  if (compact.length <= 76)
    return compact

  return `${compact.slice(0, 73).trim()}...`
}

export enum EInputTypes {
  Default,
  Number,
  Textarea,
  Select,
  MaskedPhone,
  File,
}

export enum EInputStyles {
  Default,
  Login,
  RedDesign,
}

interface ISideCheckbox {
  value: boolean
  onClick: () => any
  component: React.ReactNode
}

interface IProps {
  inputType?: EInputTypes
  style?: EInputStyles,
  error?: string | null
  label?: string
  buttons?: (React.ComponentProps<'img'> | React.ComponentProps<typeof Button>)[]
  suggestions?: ISuggestion[]
  onSuggestionClick?: (value: ISuggestion) => any
  options?: ISelectOption[]
  inputProps?: React.ComponentProps<'input'> | React.ComponentProps<'select'> | React.ComponentProps<'textarea'> | InputMaskProps
  onChange?: (newValue: string | number | File[] | null) => any
  removeDefaultImage?: (id: number) => any
  fieldWrapperClassName?: string
  oneline?: boolean
  fileName?: string
  showDisablerCheckbox?: boolean
  onDisableChange?: (value: boolean) => any
  defaultValue?: string
  sideText?: string
  sideCheckbox?: ISideCheckbox
  compareVariant?: ECompareVariants
  onChangeCompareVariant?: (value: ECompareVariants) => any
  hideInput?: boolean,
  defaultFiles?: number[]
}

export default function Input({
  inputType,
  style = EInputStyles.Default,
  error,
  label,
  buttons,
  options,
  inputProps = {},
  fieldWrapperClassName,
  suggestions,
  oneline,
  showDisablerCheckbox,
  defaultValue,
  sideText,
  fileName,
  defaultFiles = [],
  sideCheckbox,
  compareVariant,
  hideInput,
  onChange,
  removeDefaultImage,
  onDisableChange,
  onChangeCompareVariant,
  onSuggestionClick,
}: IProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isDisabled, setIsDisabled] = useState<boolean>(Boolean(inputProps.disabled))
  const [isDefaultValueUsed, setIsDefaultValueUsed] = useState(false)
  const [files, setFiles] = useState<File[]>([])

  const prevValue = useRef<string>('')
  const [bufferedValue, setRawBufferedValue] = useState<string | undefined>()
  const setBufferedValue =
    inputProps.value === undefined ? () => {} : setRawBufferedValue

  const id = useMemo(() => inputProps.id || Math.random().toString().slice(2), [])

  const innerRef = React.createRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>()
  const refs: any[] = [innerRef]
  if ((inputProps as React.ComponentProps<'input'>).ref) refs.push((inputProps as React.ComponentProps<'input'>).ref)
  if ((inputProps as InputMaskProps).inputRef) {
    refs.push((inputProps as InputMaskProps).inputRef)
    delete (inputProps as InputMaskProps).inputRef
  }
  const mergedRef = useMergedRef(...refs)

  const addImageToRaw = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFiles(files.concat(Array.from(e.target.files)))
      onChange && onChange(files.concat(Array.from(e.target.files)))
    }
  }

  const removeImg = (file: File) => {
    const newFiles = [...files.filter((e) => e !== file)]
    setFiles(newFiles)
    onChange && onChange(newFiles)
  }

  const blurTimeoutId = useRef<ReturnType<typeof setTimeout>>(undefined)
  const properties = {
    className: cn('input', inputProps.className),

    onFocus: (e: any) => {
      clearTimeout(blurTimeoutId.current)
      setIsFocused(true)
      inputProps.onFocus && inputProps.onFocus(e)
    },

    onBlur: (e: any) => {
      blurTimeoutId.current = setTimeout(() =>
        setIsFocused(prev => false)
      , 300)
      inputProps.onBlur && inputProps.onBlur(e)
    },

    onChange: (e: any) => {
      if (inputType === EInputTypes.File) {
        inputProps.onChange && inputProps.onChange(e as any)
        addImageToRaw(e)
      }

      else {
        let { value } = e.target
        if (inputType === EInputTypes.MaskedPhone)
          value = value.replace(/[^\d]/g, '')
        const numberValue = ([
          EInputTypes.Number,
          EInputTypes.MaskedPhone,
        ] as unknown[]).includes(inputType) ?
          +value :
          null
        let valid = true

        if (numberValue !== null) {
          let normalized = value
          if (normalized[normalized.length - 1] === '.')
            normalized = normalized.slice(0, -1)

          valid = false
          if (numberValue !== 0 && (
            numberValue.toString() !== normalized ||
            numberValue < 0 ||
            isNaN(numberValue) ||
            numberValue === Infinity
          ))
            e.target.value = prevValue.current
          else if (value !== normalized) {
            prevValue.current = value
            setBufferedValue(value)
          } else
            valid = true
        }

        if (valid) {
          prevValue.current = value
          setBufferedValue(undefined)
          if (onChange)
            onChange(
              numberValue === null ?
                value :
                value.length > 0 ?
                  numberValue :
                  null,
            )
        }

        if (inputProps.onChange)
          inputProps.onChange(e as any)
      }
    },

    id,
    disabled: isDisabled || isDefaultValueUsed || inputProps.disabled,
    value: inputProps.value === undefined ?
      undefined :
      bufferedValue ?? inputProps.value.toString(),
  }

  const getInputByType = () => {
    switch (inputType) {
      case EInputTypes.Textarea:
        return (
          <textarea
            ref={mergedRef}
            {...inputProps as React.ComponentProps<'textarea'>}
            {...properties}
          />
        )
      case EInputTypes.Select:
        return (
          <select
            ref={mergedRef}
            {...inputProps as React.ComponentProps<'select'>}
            {...properties}
          >
            {options?.map((item, index) => <option value={item.value} key={index}>{item.label}</option>)}
          </select>
        )
      case EInputTypes.MaskedPhone:
        return (
          <InputMask
            alwaysShowMask
            ref={mergedRef}
            inputMode="decimal"
            {...inputProps as InputMaskProps}
            mask={replaceAllString(SITE_CONSTANTS.DEFAULT_PHONE_MASK, '_', '9')}
            {...properties}
          />
        )
      case EInputTypes.File:
        return (
          <div className="input-file">
            {defaultFiles.map((file: any, index: number) => {
              return (
                <div
                  className="input-file-uploaded"
                  key={index}
                  onClick={(e) => {
                    removeDefaultImage && removeDefaultImage(file[0])
                  }}
                >
                  <img src={file[1]}></img>
                </div>)
            })}
            {files.map((file: File, index: number) =>
              <div
                className="input-file-uploaded"
                key={index}
                onClick={(e) => {
                  removeImg(file)
                }}
              >
                <img src={URL.createObjectURL(file)}></img>
              </div>,
            )}
            <label className="input-file-add">
              <input
                type={'file'}
                {...inputProps as React.ComponentProps<'input'>}
                {...properties}
              />
              <img alt={'add photo'} src={images.addPhoto}></img>
            </label>
          </div>
        )
      case EInputTypes.Number:
        return (
          <input
            ref={mergedRef}
            inputMode="decimal"
            {...inputProps as React.ComponentProps<'input'>}
            {...properties}
          />
        )
      default:
        return (
          <input
            ref={mergedRef}
            {...inputProps as React.ComponentProps<'input'>}
            {...properties}
          />
        )
    }
  }

  suggestions = useMemo(() => {
    if (!suggestions)
      return suggestions
    const addressesMet = new Set<string>()
    const result = []
    for (const suggestion of suggestions) {
      if (
        !suggestion.point?.address ||
        addressesMet.has(suggestion.point?.address)
      )
        continue
      result.push(suggestion)
      addressesMet.add(suggestion.point?.address)
    }
    return result
  }, [suggestions])

  const handleSuggestionClick = (item: ISuggestion) => {
    setIsFocused(false)
    onSuggestionClick && onSuggestionClick(item)
  }

  const handleDisablerCheckboxChange = (e: React.ChangeEvent) => {
    setIsDisabled(prev => {
      onDisableChange && onDisableChange(!prev)
      return !prev
    })
  }

  const handleIsDefaultValueUsedChange = () => {
    setIsDefaultValueUsed(prev => {
      defaultValue && !prev && onChange && onChange(defaultValue)
      return !prev
    })
  }

  return (
    <div className={
      cn(
        'input__field-wrapper',
        fieldWrapperClassName,
        {
          'input__field-wrapper--oneline': oneline || isDefaultValueUsed,
          'input__field-wrapper--margin-disabled': hideInput,
        },
        style !== EInputStyles.Default && 'input__field-wrapper--style--' + {
          [EInputStyles.Login]: 'login',
          [EInputStyles.RedDesign]: 'red-design',
        }[style],
      )
    }
    >
      <Helmet>
        <style>
          {`
            .input__label {
              color: ${SITE_CONSTANTS.PALETTE.primary.dark}
            }

            input[type="date"]::-webkit-calendar-picker-indicator {
              background-image: url("${images.date}");
              background-position: center;
              margin-left: 0px;
              width: 17px;
            }

            input[type="time"]::-webkit-calendar-picker-indicator {
              background-image: url("${images.time}");
              background-position: center;
              margin-left: 0px;
              width: 17px;
            }

          `}
        </style>
      </Helmet>
      <div
        className={cn('input__header', { 'input__header--empty': !showDisablerCheckbox && !defaultValue && !label && !sideCheckbox })}
      >
        <div className="input__header-item">
          {showDisablerCheckbox && (
            <RadioCheckbox
              checked={!isDisabled && !inputProps.disabled && !hideInput}
              onChange={handleDisablerCheckboxChange}
            />
          )}
          {defaultValue && (
            <div className="input__default-value">
              <RadioCheckbox
                checked={isDefaultValueUsed}
                onChange={handleIsDefaultValueUsedChange}
              />
              <span
                onClick={handleIsDefaultValueUsedChange}
              >{t(TRANSLATION.USE_THE)} {isDefaultValueUsed ? '' : defaultValue}</span>
            </div>
          )}
          {
            !!label && (
              <label
                htmlFor={id}
                className="input__label"
              >
                {label}
                {(inputProps as React.ComponentProps<'input'>).required && <span style={{ color: 'red' }}>*</span>}
                {hideInput ? '' : ':'}
              </label>
            )
          }
        </div>
        {!hideInput && !!sideCheckbox && (
          <div className="input__header-item" onClick={() => sideCheckbox.onClick()}>
            <RadioCheckbox
              checked={sideCheckbox.value}
              onClick={e => e.stopPropagation()}
            />
            {sideCheckbox.component}
          </div>
        )}
      </div>
      {
        !hideInput && (
          <>
            <div className="input__side-text-wrapper">
              {sideText && <span>{sideText}</span>}
              <div
                className={cn(
                  'input__wrapper',
                  {
                    'input__wrapper--with-hints': suggestions?.length,
                    disabled: isDisabled || isDefaultValueUsed || inputProps.disabled,
                  },
                )}
              >
                {getInputByType()}
                {!!buttons && <div className='input__buttons'>
                  {buttons.map((item, index) => (
                    (item as React.ComponentProps<'img'>).src ?
                      (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <img key={index} {...item as React.ComponentProps<'img'>} />
                      ) :
                      (
                        <Button
                          fixedSize={false}
                          shape={
                            style === EInputStyles.Login ?
                              EButtonShapes.Flat :
                              undefined
                          }
                          key={index}
                          {...item as React.ComponentProps<typeof Button>}
                        />
                      )
                  ))}
                </div>}
                <div
                  className={cn('input__suggestions', { 'input__suggestions--active': isFocused && suggestions?.length })}
                >
                  {suggestions && suggestions.map((item, index) => (
                    <div
                      key={index}
                      onClick={() => handleSuggestionClick(item)}
                      className={cn('input__suggestion', `input__suggestion--${getSuggestionClass(item.type)}`)}
                    >
                      <span className='input__suggestion-source'>{getSuggestionSourceLabel(item.type)}</span>
                      <span
                        className='input__suggestion-text'
                        title={item.point?.address || item.point?.shortAddress}
                      >
                        {buildCompactSuggestionAddress(item.point?.address, item.point?.shortAddress)}
                      </span>
                      {
                        item.distance ?
                          <span className='input__suggestion-distance'> {(item.distance / 1000).toFixed(1)}{t(TRANSLATION.KM, { toLower: true })}</span> :
                          undefined
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {
              compareVariant !== undefined &&
              onChangeCompareVariant &&
              <CompareVariants value={compareVariant} onChange={onChangeCompareVariant}/>
            }
            {!!error && <p className="input__error">{error}</p>}
          </>
        )
      }
    </div>
  )
}
