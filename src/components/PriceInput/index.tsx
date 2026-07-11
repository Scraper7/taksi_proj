import React, { useEffect, useMemo, useRef, useState } from 'react'
import cn from 'classnames'
import { connect, ConnectedProps } from 'react-redux'
import moment from 'moment'
import { getPayment } from '../../tools/utils'
import images from '../../constants/images'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import { IRootState } from '../../state'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import { t, TRANSLATION } from '../../localization'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  time: clientOrderSelectors.time(state),
  carClass: clientOrderSelectors.carClass(state),
  pickupPrice: clientOrderSelectors.pickupPrice(state),
  customerPrice: clientOrderSelectors.customerPrice(state),
})

const mapDispatchToProps = {
  setPickupPrice: clientOrderActionCreators.setPickupPrice,
  setCustomerPrice: clientOrderActionCreators.setCustomerPrice,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  disabled?: boolean
  forceCustomerPrice?: boolean
  pickupEditable?: boolean
  customerOfferEditable?: boolean
  pickupIncreaseOnly?: boolean
  minPickupPrice?: number | string | null
  onPickupPriceCommit?: (value: number) => void
  increaseOnly?: boolean
  minCustomerPrice?: number | string | null
  onCustomerPriceCommit?: (value: number) => void
}

type TPriceItemKey = 'estimated' | 'pickup' | 'customer'

interface IPriceItem {
  key: TPriceItemKey
  label: string
  value: string
  compactValue: string
  placeholder?: string
  icon: string
  disabled?: boolean
  editable?: boolean
  onChange?: (value: string | number | File[] | null) => void
  onFocus?: () => void
  onBlur?: () => void
  minValue?: number
}

function PriceInput({
  from,
  to,
  time,
  carClass,
  pickupPrice,
  customerPrice,
  setPickupPrice,
  setCustomerPrice,
  className,
  disabled = false,
  forceCustomerPrice = false,
  pickupEditable = true,
  customerOfferEditable = true,
  pickupIncreaseOnly = false,
  minPickupPrice = null,
  onPickupPriceCommit,
  increaseOnly = false,
  minCustomerPrice = null,
  onCustomerPriceCommit,
}: IProps) {
  const { value: payment } = useMemo(() => getPayment(
    null,
    [from ?? {}, to ?? {}],
    undefined,
    time === 'now' ? moment() : time,
    carClass,
  ), [from, to, time, carClass])

  const callRate = useMemo(() => {
    const selectedClass = carClass ? SITE_CONSTANTS.CAR_CLASSES?.[carClass] : null
    const value = selectedClass?.courier_call_rate ?? SITE_CONSTANTS.COURIER_CALL_RATE
    const numberValue = Number(value)

    return Number.isFinite(numberValue) ? numberValue : 0
  }, [carClass])

  const hasCustomerPrice = SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE || forceCustomerPrice
  const [activeItem, setActiveItem] = useState<TPriceItemKey>(forceCustomerPrice ? 'pickup' : 'estimated')
  const pickupSegment = useMoneySegment({
    value: pickupPrice,
    setValue: setPickupPrice,
    increaseOnly: pickupIncreaseOnly,
    minValue: minPickupPrice,
    onCommit: onPickupPriceCommit,
  })
  const customerSegment = useMoneySegment({
    value: customerPrice,
    setValue: setCustomerPrice,
    increaseOnly,
    minValue: minCustomerPrice,
    onCommit: onCustomerPriceCommit,
  })
  const customerPlaceholder = t(TRANSLATION.CUSTOMER_PRICE)

  const makeEditablePriceItem = (
    key: TPriceItemKey,
    label: string,
    icon: string,
    segment: TMoneySegment,
    itemEditable = true,
    forceReadOnlyValue?: number,
  ): IPriceItem => {
    const canEditItem = !disabled && itemEditable
    const readOnlyValue = forceReadOnlyValue !== undefined ? formatMoneyValue(forceReadOnlyValue, true) : null

    return {
      key,
      label,
      value: readOnlyValue ?? segment.draftValue,
      compactValue: readOnlyValue ?? segment.value,
      placeholder: customerPlaceholder,
      icon,
      disabled: disabled || !itemEditable,
      editable: canEditItem,
      minValue: increaseOnly ? segment.minValue : 0,
      onFocus: () => {
        if (!canEditItem) return
        segment.onFocus()
      },
      onChange: value => {
        if (!canEditItem) return
        segment.onChange(value)
      },
      onBlur: () => {
        if (!canEditItem) return
        segment.onBlur()
      },
    }
  }

  const items: IPriceItem[] = [
    {
      key: 'estimated',
      label: t(TRANSLATION.CLIENT_ESTIMATED_PRICE),
      value: formatMoneyValue(payment),
      compactValue: formatMoneyValue(payment),
      icon: images.priceEstimatedIcon,
      disabled: true,
    },
  ]

  if (forceCustomerPrice) {
    // In offer/voting form all three segments stay visible.
    // Segment 2 is the pickup amount and is stored separately.
    // Segment 3 is the customer's whole-trip offer and is editable only
    // for offer orders; in voting/ordinary orders it opens grey/read-only
    // and never duplicates the pickup amount.
    items.push(makeEditablePriceItem(
      'pickup',
      t(TRANSLATION.CLIENT_PICKUP_PRICE),
      images.pricePickupIcon,
      pickupSegment,
      pickupEditable,
    ))

    if (hasCustomerPrice) {
      items.push(makeEditablePriceItem(
        'customer',
        t(TRANSLATION.CLIENT_CUSTOMER_OFFER_PRICE),
        images.priceCustomerIcon,
        customerSegment,
        customerOfferEditable,
        customerOfferEditable ? undefined : 0,
      ))
    }
  } else {
    items.push({
      key: 'pickup',
      label: t(TRANSLATION.CLIENT_PICKUP_PRICE),
      value: formatMoneyValue(callRate),
      compactValue: formatMoneyValue(callRate),
      icon: images.pricePickupIcon,
      disabled: true,
    })

    if (hasCustomerPrice) {
      items.push(makeEditablePriceItem(
        'customer',
        t(TRANSLATION.CLIENT_CUSTOMER_OFFER_PRICE),
        images.priceCustomerIcon,
        customerSegment,
        customerOfferEditable,
        customerOfferEditable ? undefined : 0,
      ))
    }
  }

  const normalizedActiveItem = items.some(item => item.key === activeItem) ? activeItem : items[0].key

  return (
    <div className={cn('price-input', className)}>
      {items.map(item => (
        <PriceInputItem
          key={item.key}
          item={item}
          active={item.key === normalizedActiveItem}
          setActive={() => setActiveItem(item.key)}
        />
      ))}
    </div>
  )
}

interface TMoneySegment {
  value: string
  draftValue: string
  minValue: number
  onFocus: () => void
  onChange: (value: string | number | File[] | null) => void
  onBlur: () => void
}

function useMoneySegment({
  value,
  setValue,
  increaseOnly = false,
  minValue = null,
  onCommit,
}: {
  value?: number | string | null
  setValue: (value: number | null) => void
  increaseOnly?: boolean
  minValue?: number | string | null
  onCommit?: (value: number) => void
}): TMoneySegment {
  const [floor, setFloor] = useState(0)
  const floorRef = useRef(0)
  const [draft, setDraft] = useState('0')
  const [editing, setEditing] = useState(false)
  const hasValue = value !== undefined && value !== null
  const numericValue = hasValue ? Number(value) : 0
  const safeValue = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0
  const configuredMinValue = normalizeMoneyNumber(minValue)
  const committedFloor = Math.max(
    0,
    configuredMinValue ?? 0,
    floor,
    increaseOnly ? safeValue : 0,
  )
  const valueText = formatMoneyValue(safeValue, true)

  useEffect(() => {
    if (editing)
      return

    if (value === undefined || value === null) {
      floorRef.current = 0
      setFloor(0)
      setDraft('0')
      return
    }

    floorRef.current = Math.max(floorRef.current, safeValue)
    setFloor(prev => Math.max(prev, safeValue))
    setDraft(formatMoneyValue(safeValue, true))
  }, [value, editing, safeValue])

  const commitValue = (rawValue: number) => {
    const safeNextValue = Number.isFinite(rawValue) ? Math.max(0, rawValue) : 0
    const committedValue = increaseOnly ?
      Math.max(committedFloor, safeNextValue) :
      safeNextValue

    floorRef.current = Math.max(floorRef.current, committedValue)
    setEditing(false)
    setDraft(formatMoneyValue(committedValue, true))
    setFloor(prev => Math.max(prev, committedValue))
    setValue(committedValue)

    const shouldCommit = increaseOnly ?
      committedValue > (configuredMinValue ?? 0) :
      committedValue !== safeValue

    if (shouldCommit)
      onCommit?.(committedValue)
  }

  return {
    value: valueText,
    draftValue: draft,
    minValue: increaseOnly ? committedFloor : 0,
    onFocus: () => {
      setEditing(true)
      setDraft(formatMoneyValue(safeValue, true))
      if (!hasValue)
        setValue(0)
    },
    onChange: next => {
      const rawValue = String(next ?? '').replace(/[^\d]/g, '')
      setEditing(true)
      setDraft(rawValue)

      if (rawValue === '') {
        if (floorRef.current <= 0)
          setValue(0)
        return
      }

      const nextValue = Number(rawValue)
      if (!Number.isFinite(nextValue)) return

      const safeNextValue = Math.max(0, nextValue)
      const nextStoredValue = increaseOnly ?
        Math.max(committedFloor, safeNextValue) :
        safeNextValue

      setValue(nextStoredValue)
    },
    onBlur: () => {
      const nextValue = Number(draft || 0)
      commitValue(nextValue)
    },
  }
}

function formatMoneyValue(value?: number | string | null, showZero = false) {
  if (value === undefined || value === null || value === '')
    return ''

  const rawValue = String(value).trim()
  const normalizedValue = Number(rawValue.replace(',', '.').replace(/[^\d.-]/g, ''))

  if (Number.isFinite(normalizedValue)) {
    const roundedValue = Math.round(normalizedValue)

    return roundedValue === 0 && !showZero ? '' : String(roundedValue)
  }

  const withoutCurrency = rawValue
    .replace(CURRENCY.NAME, '')
    .replace(CURRENCY.SIGN, '')
    .replace(/\s+/g, ' ')
    .trim()

  return (withoutCurrency === '0' && !showZero) || withoutCurrency === '-' ? '' : withoutCurrency
}

function normalizeCustomerPriceInput(value: string) {
  return value.replace(/[^\d]/g, '')
}

function normalizeMoneyNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === '')
    return null

  const numberValue = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  return Number.isFinite(numberValue) ? Math.max(0, valueToRoundedMoney(numberValue)) : null
}

function valueToRoundedMoney(value: number) {
  return Math.round(value)
}

export default connector(PriceInput)

interface IItemProps {
  item: IPriceItem
  active: boolean
  setActive: () => void
}

function PriceInputItem({
  item,
  active,
  setActive,
}: IItemProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const showInput = active && item.editable
  const displayValue = active ? item.value : item.compactValue
  const showContent = active || showInput || Boolean(displayValue)
  const handleActivate = () => {
    setActive()
    if (item.editable)
      window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div
      className={cn('price-input__container', {
        'price-input__container--disabled': item.disabled,
        'price-input__container--active': active,
        'price-input__container--compact': !active,
      })}
      onClick={handleActivate}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          handleActivate()
        }
      }}
    >
      <img
        src={item.icon}
        alt=""
        className={cn('price-input__pictogram', {
          'price-input__pictogram--compact': !active,
        })}
      />
      {showContent && (
        <span className="price-input__content">
          {active && <span className="price-input__label">{item.label}</span>}
          {showInput ? (
            <input
              ref={inputRef}
              className="price-input__segment-input"
              inputMode="numeric"
              value={item.value}
              placeholder={item.placeholder}
              disabled={item.disabled}
              min={item.minValue}
              onClick={event => event.stopPropagation()}
              onMouseDown={event => event.stopPropagation()}
              onTouchStart={event => event.stopPropagation()}
              onKeyDown={event => event.stopPropagation()}
              onFocus={event => {
                const target = event.currentTarget
                item.onFocus?.()
                window.setTimeout(() => target.select(), 0)
              }}
              onBlur={item.onBlur}
              onChange={event => {
                item.onChange?.(normalizeCustomerPriceInput(event.target.value))
              }}
            />
          ) : (
            displayValue ? (
              <span className="price-input__value">{displayValue}</span>
            ) : null
          )}
        </span>
      )}
    </div>
  )
}
