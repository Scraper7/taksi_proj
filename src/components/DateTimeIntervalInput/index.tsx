import React from 'react'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'
import Input from '../Input'
import { ECompareVariants } from '../CompareVariants'
import { ETimeTypes, IDateTime } from '../../tools/dateTime'
import cn from 'classnames'
import './styles.scss'

interface IProps {
  value: IDateTime
  onChange: (newValue: IDateTime) => any
  isSimple?: boolean
}

const DateTimeIntervalInput: React.FC<IProps> = ({ value, onChange, isSimple }) => {
  const handleIsDateDisabledChange = () => {
    onChange({ ...value, dateDisabled: !value.dateDisabled })
  }

  const handleIsTimeDisabledChange = () => {
    onChange({ ...value, timeDisabled: !value.timeDisabled })
  }

  const handleIsDateIntervalChange = () => {
    onChange({
      ...value,
      dateType: isDateInterval ? ETimeTypes.Single : ETimeTypes.Interval,
    })
  }

  const handleIsTimeIntervalChange = () => {
    onChange({
      ...value,
      timeType: isTimeInterval ? ETimeTypes.Single : ETimeTypes.Interval,
    })
  }

  const handleDateComparatorChange = (comparator: ECompareVariants) => {
    onChange({
      ...value,
      dateComparator: comparator,
    })
  }

  const handleTimeComparatorChange = (comparator: ECompareVariants) => {
    onChange({
      ...value,
      timeComparator: comparator,
    })
  }

  const handleDateChange = (from?: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      date: from ? e.target.value : value.date,
      dateTill: from ? value.dateTill : e.target.value,
    })
  }

  const handleTimeChange = (from?: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...value,
      time: from ? e.target.value : value.time,
      timeTill: from ? value.timeTill : e.target.value,
    })
  }

  const isDateInterval = value.dateType === ETimeTypes.Interval
  const isTimeInterval = value.timeType === ETimeTypes.Interval

  return (
    <div className={cn('date-time-container',{ 'date-time__fields': (!isDateInterval && !isTimeInterval) || value.dateDisabled || value.timeDisabled })}>
      <div className="date-time__fields date-time__fields--bottom">
        <Input
          label={t(TRANSLATION.DATE_P)}
          inputProps={{
            type: 'date',
            value: value.date,
            onChange: handleDateChange(true),
            disabled: value.dateDisabled,
          }}
          showDisablerCheckbox={!isSimple}
          onDisableChange={handleIsDateDisabledChange}
          sideText={isDateInterval ? t(TRANSLATION.DATE_FROM, { toLower: true }) : undefined}
          sideCheckbox={
            isSimple ?
              undefined :
              {
                value: isDateInterval,
                onClick: handleIsDateIntervalChange,
                component: <img src={images.interval} alt={t(TRANSLATION.INTERVAL)}/>,
              }
          }
          compareVariant={isDateInterval || isSimple ? undefined : value.dateComparator}
          onChangeCompareVariant={handleDateComparatorChange}
          hideInput={value.dateDisabled}
        />
        {isDateInterval && (
          <Input
            inputProps={{
              type: 'date',
              value: value.dateTill,
              onChange: handleDateChange(),
              disabled: value.dateDisabled,
            }}
            hideInput={value.dateDisabled}
            sideText={isDateInterval ? t(TRANSLATION.DATE_TILL, { toLower: true }) : undefined}
          />
        )}
      </div>

      <div className="date-time__fields date-time__fields--bottom">
        <Input
          label={t(TRANSLATION.TIME_P)}
          inputProps={{
            type: 'time',
            value: value.time,
            onChange: handleTimeChange(true),
            disabled: value.timeDisabled,
          }}
          showDisablerCheckbox={!isSimple}
          onDisableChange={handleIsTimeDisabledChange}
          sideText={isTimeInterval ? t(TRANSLATION.DATE_FROM, { toLower: true }) : undefined}
          sideCheckbox={
            isSimple ?
              undefined :
              {
                value: isTimeInterval,
                onClick: handleIsTimeIntervalChange,
                component: <img src={images.interval} alt={t(TRANSLATION.INTERVAL)}/>,
              }
          }
          compareVariant={isTimeInterval || isSimple ? undefined : value.timeComparator}
          onChangeCompareVariant={handleTimeComparatorChange}
          hideInput={value.timeDisabled}
        />
        {isTimeInterval && (
          <Input
            inputProps={{
              type: 'time',
              value: value.timeTill,
              onChange: handleTimeChange(),
              disabled: value.timeDisabled,
            }}
            sideText={isTimeInterval ? t(TRANSLATION.TIME_TILL, { toLower: true }) : undefined}
            hideInput={value.timeDisabled}
          />
        )}
      </div>
    </div>
  )
}

export default DateTimeIntervalInput