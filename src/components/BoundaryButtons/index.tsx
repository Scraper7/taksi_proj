import React, { useRef } from 'react'
import cn from 'classnames'
import { connect, ConnectedProps } from 'react-redux'
import { EBookingLocationKinds } from '../../types/types'
import { IRootState } from '../../state'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import { t, TRANSLATION } from '../../localization'
import { configSelectors } from '../../state/config'
import { hasOfferOrderSupport } from '../../tools/driverOffer'
import SITE_CONSTANTS from '../../siteConstants'
import './styles.scss'
import autoStatusIcon from './status-icons/auto.png'
import manualStatusIcon from './status-icons/manual.png'
import manualOverrideStatusIcon from './status-icons/manual-override.png'

const mapStateToProps = (state: IRootState) => ({
  locationClasses: clientOrderSelectors.availableLocationClasses(state),
  locationClass: clientOrderSelectors.locationClass(state),
  locationClassSelectionMode: clientOrderSelectors.locationClassSelectionMode(state),
  algorithmLocationClass: clientOrderSelectors.algorithmLocationClass(state),
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  setLocationClass: clientOrderActionCreators.setLocationClass,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function BoundaryButtons({
  locationClasses,
  locationClass,
  locationClassSelectionMode,
  algorithmLocationClass,
  from,
  to,
  setLocationClass,
  language,
}: IProps) {
  void language

  const disabled = locationClasses === null
  const prevLocationClasses = useRef(locationClasses ?? [])
  if (locationClasses === null)
    locationClasses = prevLocationClasses.current
  else
    prevLocationClasses.current = locationClasses

  const offerSupport = hasOfferOrderSupport()
  const renderLocationClasses = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
  const hasResolvedLocationContext = Boolean(
    from?.latitude !== undefined &&
    from?.longitude !== undefined &&
    to?.latitude !== undefined &&
    to?.longitude !== undefined &&
    !from?.isAddressResolving &&
    !to?.isAddressResolving,
  )

  const getStatus = (id: string, selected: boolean): TBoundaryButtonStatus => {
    const isAlgorithmChoice = hasResolvedLocationContext &&
      algorithmLocationClass !== null &&
      algorithmLocationClass !== undefined &&
      String(algorithmLocationClass) === String(id)

    if (locationClassSelectionMode === 'manual') {
      if (selected)
        return isAlgorithmChoice ? 'auto' : 'manual-override'

      return isAlgorithmChoice ? 'auto' : 'none'
    }

    if (isAlgorithmChoice)
      return 'auto'

    return selected && hasResolvedLocationContext ? 'auto' : 'none'
  }

  const handleLocationClassClick = (id: string) => {
    if (disabled)
      return

    const isAlgorithmChoice = hasResolvedLocationContext &&
      algorithmLocationClass !== null &&
      algorithmLocationClass !== undefined &&
      String(algorithmLocationClass) === String(id)

    setLocationClass({
      id,
      mode: isAlgorithmChoice ? 'auto' : 'manual',
    })
  }

  return (
    <div
      className={cn('boundary-buttons', {
        'boundary-buttons--disabled': disabled,
      })}
    >
      {renderLocationClasses.map(({ id, kind }) => {
        const selected = locationClassSelectionMode === 'auto' &&
          algorithmLocationClass !== null &&
          algorithmLocationClass !== undefined ?
          String(id) === String(algorithmLocationClass) :
          String(id) === String(locationClass)
        return (
          <div
            key={id}
            className={cn('boundary-buttons__item', {
              'boundary-buttons__item--active': selected,
            })}
            onClick={() => handleLocationClassClick(id)}
          >
            <div className="boundary-buttons__icon">
              {{
                [EBookingLocationKinds.City]:
                  <CityIcon active={selected} />,
                [EBookingLocationKinds.Intercity]:
                  <IntercityIcon active={selected} />,
                [EBookingLocationKinds.Location]:
                  <LocationIcon active={selected} />,
              }[kind]}
            </div>
            <BoundaryStatusIcon status={getStatus(id, selected)} />
            <span className="boundary-buttons__text">
              {{
                [EBookingLocationKinds.City]: t(TRANSLATION.CLIENT_CITY_ORDER_MODE),
                [EBookingLocationKinds.Intercity]: offerSupport ?
                  t(TRANSLATION.CLIENT_INTERCITY_ORDER_MODE) :
                  t(TRANSLATION.BOOKING_LOCATION_CLASSES[id]),
                [EBookingLocationKinds.Location]: t(TRANSLATION.BOOKING_LOCATION_CLASSES[id]),
              }[kind]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default connector(BoundaryButtons)


type TBoundaryButtonStatus = 'none' | 'auto' | 'manual' | 'manual-override'

const BOUNDARY_STATUS_ICON_MAP: Record<Exclude<TBoundaryButtonStatus, 'none'>, string> = {
  auto: autoStatusIcon,
  manual: manualStatusIcon,
  'manual-override': manualOverrideStatusIcon,
}

function BoundaryStatusIcon({ status }: { status: TBoundaryButtonStatus }) {
  if (status === 'none')
    return null

  return (
    <span className={`boundary-buttons__status boundary-buttons__status--${status}`} aria-hidden="true">
      <span className="boundary-buttons__status-badge">
        <img
          className="boundary-buttons__status-image"
          src={BOUNDARY_STATUS_ICON_MAP[status]}
          alt=""
          draggable={false}
        />
      </span>
    </span>
  )
}

function CityIcon({ active }: { active: boolean }) {
  return (<svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M15.222 16C16.617 17.988 17.284 19.047 16.887 19.9C16.847 19.9853 16.8003 20.0677 16.747 20.147C16.172 21 14.687 21 11.717 21H6.28299C3.31299 21 1.82899 21 1.25399 20.147C1.20153 20.0681 1.15475 19.9855 1.11399 19.9C0.716991 19.048 1.38399 17.988 2.77899 16M11.5 8C11.5 8.66304 11.2366 9.29893 10.7678 9.76777C10.2989 10.2366 9.66303 10.5 8.99999 10.5C8.33695 10.5 7.70107 10.2366 7.23222 9.76777C6.76338 9.29893 6.49999 8.66304 6.49999 8C6.49999 7.33696 6.76338 6.70107 7.23222 6.23223C7.70107 5.76339 8.33695 5.5 8.99999 5.5C9.66303 5.5 10.2989 5.76339 10.7678 6.23223C11.2366 6.70107 11.5 7.33696 11.5 8Z" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.257 16.494C9.91922 16.819 9.46871 17.0005 8.99999 17.0005C8.53127 17.0005 8.08076 16.819 7.74299 16.494C4.65399 13.501 0.514992 10.158 2.53299 5.304C3.62599 2.679 6.24599 1 8.99999 1C11.754 1 14.375 2.68 15.467 5.304C17.483 10.151 13.354 13.511 10.257 16.494Z" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>)
}

function IntercityIcon({ active }: { active: boolean }) {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 21V11C2 9.114 2 8.172 2.586 7.586C3.172 7 4.114 7 6 7C7.886 7 8.828 7 9.414 7.586C10 8.172 10 9.114 10 11" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" />
    <path d="M16 21V15C16 13.114 16 12.172 15.414 11.586C14.828 11 13.886 11 12 11H10C8.114 11 7.172 11 6.586 11.586C6 12.172 6 13.114 6 15V21" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" />
    <path d="M20 20.9999V6.77193C20 5.43193 20 4.76093 19.644 4.24693C19.288 3.73293 18.66 3.49693 17.404 3.02693C14.949 2.10593 13.722 1.64593 12.861 2.24193C12 2.83993 12 4.14993 12 6.77193V10.9999" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" />
    <path d="M3 7V5.5C3 4.557 3 4.086 3.293 3.793C3.586 3.5 4.057 3.5 5 3.5H7C7.943 3.5 8.414 3.5 8.707 3.793C9 4.086 9 4.557 9 5.5V7M6 3V1M21 21H1M9 14H13M9 17H13" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" strokeLinecap="round" />
  </svg>)
}

function LocationIcon({ active }: { active: boolean }) {
  return (<svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.121 20.121C21 19.243 21 17.828 21 15C21 12.172 21 10.757 20.121 9.879M20.121 20.121C19.243 21 17.828 21 15 21H7C4.172 21 2.757 21 1.879 20.121M20.121 9.879C19.243 9 17.828 9 15 9H7C4.172 9 2.757 9 1.879 9.879M1.879 9.879C1 10.757 1 12.172 1 15C1 17.828 1 19.243 1.879 20.121" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" />
    <path d="M20 20L2 10M2.5 20L11 15" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 7C17.6569 7 19 5.65685 19 4C19 2.34315 17.6569 1 16 1C14.3431 1 13 2.34315 13 4C13 5.65685 14.3431 7 16 7Z" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" />
    <path d="M16 12V7" stroke={active ? 'white' : '#BDBDBD'} strokeWidth="1.5" strokeLinecap="round" />
  </svg>)
}
