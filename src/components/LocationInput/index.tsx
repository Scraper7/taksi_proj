import React, { useEffect, useRef, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import _ from 'lodash'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import {
  clientOrderActionCreators,
  clientOrderSelectors,
} from '../../state/clientOrder'
import {
  EPointType,
  ISuggestion, EBookingLocationKinds, IAddressPoint,
} from '../../types/types'
import * as API from '../../API'
import { useCachedState } from '../../tools/hooks'
import { cachedOrderDataStateKey } from '../../tools/utils'
import Input, { EInputStyles } from '../Input'

const mapStateToProps = (state: IRootState) => ({
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  locationClass: clientOrderSelectors.locationClass(state),
})

const mapDispatchToProps = {
  setFrom: clientOrderActionCreators.setFrom,
  setTo: clientOrderActionCreators.setTo,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

const hasCoordinates = (point?: IAddressPoint | null): point is IAddressPoint =>
  Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  type: EPointType
  onOpenMap: () => void
  extended?: boolean
  error?: string
  disabled?: boolean
}

const debouncedGetPointSuggestion = _.debounce((callback, ...args) => {
  API.getPointSuggestions(
    ...args,
  ).then(callback)
}, 500)

function LocationInput({
  from,
  to,
  locationClass,
  setFrom,
  setTo,
  className,
  type,
  onOpenMap,
  extended = false,
  error,
  disabled = false,
}: IProps) {
  const point = type === EPointType.From ? from : to
  const setPoint = type === EPointType.From ? setFrom : setTo

  const [isAddressShort, setIsAddressShort] = useCachedState(
    `${cachedOrderDataStateKey}.is${EPointType[type]}AddressShort`,
    true,
  )
  const [suggestions, setSuggestions] = useState<ISuggestion[]>([])
  const lastFromWithCoordinates = useRef<IAddressPoint | null>(hasCoordinates(from) ? from : null)
  const lastToWithCoordinates = useRef<IAddressPoint | null>(hasCoordinates(to) ? to : null)

  if (hasCoordinates(from))
    lastFromWithCoordinates.current = from
  if (hasCoordinates(to))
    lastToWithCoordinates.current = to

  const getSuggestionSearchCenter = () => {
    if (type === EPointType.To)
      return lastFromWithCoordinates.current || lastToWithCoordinates.current || null

    return hasCoordinates(point) ?
      point :
      lastFromWithCoordinates.current || lastToWithCoordinates.current || null
  }

  const suggestionSearchCenter = getSuggestionSearchCenter()
  const suggestionSearchCenterKey = suggestionSearchCenter ?
    `${Number(suggestionSearchCenter.latitude).toFixed(5)},${Number(suggestionSearchCenter.longitude).toFixed(5)}` :
    ''

  const getPointDisplayValue = () => {
    const address = isAddressShort && point?.shortAddress ?
      point.shortAddress :
      point?.address

    if (address)
      return address

    return ''
  }

  const locationClassData = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
    .find(({ id }) => id === locationClass)!
  const isIntercity = locationClassData.kind === EBookingLocationKinds.Intercity
  useEffect(() => {
    const query = String(point?.address || '').trim()
    if (!query) {
      setSuggestions([])
      return
    }

    debouncedGetPointSuggestion(setSuggestions, query, isIntercity, suggestionSearchCenter || undefined)
  }, [point?.address, isIntercity, suggestionSearchCenterKey])

  const resolveTypedAddress = () => {
    if (disabled)
      return
    const query = String(point?.address || point?.shortAddress || '').trim()
    if (!query || (point?.latitude && point?.longitude))
      return
    setPoint({
      address: query,
      resolveAddress: true,
    })
  }

  const buttons = [
    {
      src: isAddressShort ? images.minusIcon : images.plusIcon,
      onClick: disabled ? undefined : () => setIsAddressShort(prev => !prev),
    },
    {
      src: images.pointOnMap,
      onClick: disabled ? undefined : onOpenMap,
    },
  ]

  return (
    <Input
      fieldWrapperClassName={className}
      inputProps={{
        placeholder: t(type === EPointType.From ?
          TRANSLATION.START_POINT :
          TRANSLATION.DESTINATION_POINT,
        ),
        value: getPointDisplayValue(),
        disabled,
        readOnly: disabled,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
          if (disabled) return
          setPoint({ address: e.target.value })
        },
        onBlur: resolveTypedAddress,
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (disabled) return
          if (e.key === 'Enter') {
            e.preventDefault()
            resolveTypedAddress()
          }
        },
      }}
      style={EInputStyles.RedDesign}
      error={error}
      buttons={
        point?.shortAddress ?
          buttons :
          buttons.slice(1)
      }
      suggestions={disabled ? [] : suggestions}
      onSuggestionClick={(suggestion) => {
        if (disabled) return
        const selectedPoint = suggestion.point || null
        if (
          selectedPoint &&
          (selectedPoint.address || selectedPoint.shortAddress) &&
          !(selectedPoint.latitude && selectedPoint.longitude)
        ) {
          setPoint({
            ...selectedPoint,
            resolveAddress: true,
          })
          return
        }
        setPoint(selectedPoint)
      }}
    />
  )
}

export default connector(LocationInput)
