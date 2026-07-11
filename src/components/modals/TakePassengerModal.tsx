import React, { useEffect, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import Input, { EInputTypes } from '../Input'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import { getPointError } from '../../tools/utils'
import images from '../../constants/images'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { IRootState } from '../../state'
import { EMapModalTypes } from '../../state/modals/constants'
import './styles.scss'
import Overlay from './Overlay'
import { EStatuses, IAddressPoint, ISuggestion } from '../../types/types'
import { userActionCreators } from '../../state/user'
import _ from 'lodash'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isTakePassengerModalOpen(state),
  from: modalsSelectors.takePassengerModalFrom(state),
  to: modalsSelectors.takePassengerModalTo(state),
})

const mapDispatchToProps = {
  setMapModal: modalsActionCreators.setMapModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setTakePassengerModal: modalsActionCreators.setTakePassengerModal,
  updateTakePassengerModal: modalsActionCreators.updateTakePassengerModal,
  setTakePassengerModalFrom: modalsActionCreators.setTakePassengerModalFrom,
  setTakePassengerModalTo: modalsActionCreators.setTakePassengerModalTo,
  setUser: userActionCreators.setUser,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const debouncedGetFromPointSuggestion = _.debounce((callback, ...args) => {
  API.getPointSuggestions(
    ...args,
  ).then(callback)
}, 500)
const debouncedGetToPointSuggestion = _.debounce((callback, ...args) => {
  API.getPointSuggestions(
    ...args,
  ).then(callback)
}, 500)

function getPointDisplayValue(point: IProps['from'], isShort: boolean) {
  if (isShort && point?.shortAddress)
    return point.shortAddress

  return point?.address || ''
}

const hasCoordinates = (point?: IAddressPoint | null): point is IAddressPoint =>
  Number.isFinite(Number(point?.latitude)) && Number.isFinite(Number(point?.longitude))

const TakePassengerModal: React.FC<IProps> = ({
  isOpen,
  from,
  to,
  setMapModal,
  setMessageModal,
  setTakePassengerModal,
  updateTakePassengerModal,
  setTakePassengerModalFrom,
  setTakePassengerModalTo,
  setUser,
}) => {
  const [seats, setSeats] = useState(1)
  const [isFromAddressShort, setIsFromAddressShort] = useState(true)
  const [isToAddressShort, setIsToAddressShort] = useState(true)
  const [fromSuggestions, setFromSuggestions] = useState<ISuggestion[]>([])
  const [toSuggestions, setToSuggestions] = useState<ISuggestion[]>([])

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    API.setOutDrive(
      false,
      {
        fromAddress: from?.address,
        fromLatitude: from?.latitude?.toString(),
        fromLongitude: from?.longitude?.toString(),
        toAddress: to?.address,
        toLatitude: to?.latitude?.toString(),
        toLongitude: to?.longitude?.toString(),
      },
      seats,
    )
      .then(() => setTakePassengerModal({ isOpen: false }))
      .then(API.getAuthorizedUser)
      .then(setUser)
      .catch(error => {
        console.error(error)
        setMessageModal({ isOpen: true, message: t(TRANSLATION.ERROR), status: EStatuses.Fail })
      })
  }

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        updateTakePassengerModal({
          from: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            address: t(TRANSLATION.MAP_ADDRESS_LOADING),
            shortAddress: t(TRANSLATION.MAP_ADDRESS_LOADING),
            isAddressResolving: true,
          },
        })

        API.reverseGeocode(String(coords.latitude), String(coords.longitude))
          .then(response => {
            const address = String(response?.display_name || '').trim()
            updateTakePassengerModal({
              from: {
                latitude: coords.latitude,
                longitude: coords.longitude,
                address: address || t(TRANSLATION.ADDRESS_NOT_SPECIFIED),
                shortAddress: address || t(TRANSLATION.ADDRESS_NOT_SPECIFIED),
                isAddressResolving: false,
              },
            })
          })
          .catch(error => {
            console.error(error)
            updateTakePassengerModal({
              from: {
                latitude: coords.latitude,
                longitude: coords.longitude,
                address: t(TRANSLATION.ADDRESS_NOT_SPECIFIED),
                shortAddress: t(TRANSLATION.ADDRESS_NOT_SPECIFIED),
                isAddressResolving: false,
              },
            })
          })
      },
      error => console.error(error),
      { enableHighAccuracy: true },
    )
  }, [])

  useEffect(() => {
    debouncedGetFromPointSuggestion(
      setFromSuggestions,
      from?.address,
      true,
      hasCoordinates(from) ? from : hasCoordinates(to) ? to : undefined,
    )
  } , [from, to])
  useEffect(() => {
    debouncedGetToPointSuggestion(
      setToSuggestions,
      to?.address,
      true,
      hasCoordinates(from) ? from : hasCoordinates(to) ? to : undefined,
    )
  } , [from, to])

  const fromButtons = [
    {
      src: isFromAddressShort ? images.minusIcon : images.plusIcon,
      onClick: () => setIsFromAddressShort(prev => !prev),
    },
    {
      src: images.activeMarker,
      onClick: () => setMapModal({
        isOpen: true,
        type: EMapModalTypes.TakePassenger,
        defaultCenter: from?.latitude && from?.longitude ? [from.latitude, from.longitude] : undefined,
      }),
    },
  ]
  const toButtons = [
    {
      src: isToAddressShort ? images.minusIcon : images.plusIcon,
      onClick: () => setIsToAddressShort(prev => !prev),
    },
    {
      src: images.activeMarker,
      onClick: () => setMapModal({
        isOpen: true,
        type: EMapModalTypes.TakePassenger,
        defaultCenter: to?.latitude && to?.longitude ? [to.latitude, to.longitude] : undefined,
      }),
    },
  ]

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setTakePassengerModal({ isOpen: false })}
    >
      <div
        className="modal take-passenger-modal"
      >
        <form onSubmit={onSubmit}>
          <fieldset>
            <legend>{t(TRANSLATION.TOOK_PASSENGER)}</legend>
            <div>
              <Input
                inputProps={{
                  placeholder: t(TRANSLATION.START_POINT),
                  value: getPointDisplayValue(from, isFromAddressShort),
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setTakePassengerModalFrom({ address: e.target.value }),
                }}
                label={t(TRANSLATION.FROM)}
                error={getPointError(from)}
                buttons={
                  from?.shortAddress ?
                    fromButtons :
                    fromButtons.slice(1)
                }
                suggestions={fromSuggestions}
                onSuggestionClick={(suggestion) => setTakePassengerModalFrom(suggestion.point)}
              />
              <Input
                inputProps={{
                  placeholder: t(TRANSLATION.DESTINATION_POINT),
                  value: getPointDisplayValue(to, isToAddressShort),
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setTakePassengerModalTo({ address: e.target.value }),
                }}
                label={t(TRANSLATION.TO)}
                error={getPointError(to)}
                buttons={
                  to?.shortAddress ?
                    toButtons :
                    toButtons.slice(1)
                }
                suggestions={toSuggestions}
                onSuggestionClick={(suggestion) => setTakePassengerModalTo(suggestion.point)}
              />
              <Input
                inputProps={{
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSeats(parseInt(e.target.value)),
                  value: seats,
                }}
                label={t(TRANSLATION.SEATS)}
                inputType={EInputTypes.Select}
                options={[
                  { label: '1', value: 1 },
                  { label: '2', value: 2 },
                  { label: '3', value: 3 },
                ]}
              />
              <Button
                text={t(TRANSLATION.PROVE)}
                className="proove-btn"
                type='submit'
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(TakePassengerModal)
