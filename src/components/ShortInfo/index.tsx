import React, { useMemo } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { getPhoneNumberError, formatCurrency } from '../../tools/utils'
import { IRootState } from '../../state'
import { clientOrderSelectors } from '../../state/clientOrder'
import { t, TRANSLATION } from '../../localization'
import Icon from '../Icon'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  time: clientOrderSelectors.time(state),
  seats: clientOrderSelectors.seats(state),
  carClass: clientOrderSelectors.carClass(state),
  customerPrice: clientOrderSelectors.customerPrice(state),
  phone: clientOrderSelectors.phone(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
  showActivityDot?: boolean
  activityCount?: number
  activityLabel?: string
  onActivityClick?: () => void
}

function ShortInfo({
  time,
  seats,
  carClass,
  customerPrice,
  phone,
  className,
  showActivityDot = false,
  activityCount,
  activityLabel,
  onActivityClick,
}: IProps) {
  const items: {
    name: React.ComponentProps<typeof Icon>['src']
    value: string | null
    active?: boolean
  }[] = [
    // { name: 'carNearby', value: '7 / 5 min' },
    {
      name: 'alarm',
      value: time === 'now' ? t(TRANSLATION.NOW) : time.format('HH:mm'),
    },
    { name: 'people', value: `${seats}` },
    { name: 'car', value: t(TRANSLATION.CAR_CLASSES[carClass]) },
    {
      name: 'money',
      value: customerPrice !== null ? formatCurrency(customerPrice) : null,
    },
    {
      name: 'call',
      value: '',
      active: useMemo(() =>
        getPhoneNumberError(phone) === null
      , [phone]),
    },
    { name: 'msg', value: '' },
  ]

  return (
    <div
      className={cn(
        'short-info',
        className,
        { 'short-info--clickable': Boolean(onActivityClick) },
      )}
      onClick={onActivityClick}
      role={onActivityClick ? 'button' : undefined}
      tabIndex={onActivityClick ? 0 : undefined}
      onKeyDown={event => {
        if (!onActivityClick)
          return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivityClick()
        }
      }}
    >
      {items.map(({ name, value, active = true }, index) => value !== null &&
        <React.Fragment key={name}>
          <div
            className={cn(
              'short-info__item',
              { 'short-info__item--active': active },
            )}
          >
            <Icon className="short-info__icon" src={name} />
            <span className="short-info__text">{value}</span>
          </div>
          {index < items.length - 1 && <div className="short-info__line" />}
        </React.Fragment>,
      )}
      {showActivityDot && (
        <>
          <div className="short-info__line" />
          <div className="short-info__item short-info__item--activity short-info__item--active">
            <span className="short-info__activity-dot">{activityCount ?? ''}</span>
            {activityLabel && <span className="short-info__text">{activityLabel}</span>}
          </div>
        </>
      )}
    </div>
  )
}

export default connector(ShortInfo)