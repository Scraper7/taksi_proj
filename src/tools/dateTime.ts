import { ECompareVariants } from '../components/CompareVariants'
import { replaceAllString } from './compat'

// [>=<](date input format)T[>=<](time input format)
// (date input format)-(date input format)T(time input format)-(time input format)

export enum ETimeTypes {
  Interval,
  Single
}

export interface IDateTime {
  dateType: ETimeTypes
  date?: string
  dateTill?: string
  dateComparator?: ECompareVariants
  dateDisabled?: boolean
  timeType: ETimeTypes
  time?: string
  timeTill?: string
  timeComparator?: ECompareVariants
  timeDisabled?: boolean
}

const comparatorMap = {
  [ECompareVariants.Equal]: '=',
  [ECompareVariants.Less]: '<',
  [ECompareVariants.Greater]: '>',
  '=': ECompareVariants.Equal,
  '<': ECompareVariants.Less,
  '>': ECompareVariants.Greater,
}

export const parseDateTime = (dateTime: string) => {
  const result = {} as Partial<IDateTime>
  const [date, time] = dateTime.split('T')

  if (date) {
    const [dateFrom, dateTill] = date.split('-')
    if (dateTill) {
      result.dateType = ETimeTypes.Interval
      result.date = dateFrom
      result.dateTill = dateTill
    } else {
      result.dateComparator = comparatorMap[dateFrom[0] as keyof typeof comparatorMap] as ECompareVariants
      result.date = dateFrom
    }
  }

  if (time) {
    const [timeFrom, timeTill] = time.split('-')
    if (timeTill) {
      result.timeType = ETimeTypes.Interval
      result.time = timeFrom
      result.timeTill = timeTill
    } else {
      result.timeComparator = comparatorMap[timeFrom[0] as keyof typeof comparatorMap] as ECompareVariants
      result.time = timeFrom
    }
  }

  return result as IDateTime
}

export const stringifyDateTime = (dateTime: IDateTime) => {
  let result = ''

  if (!dateTime.dateDisabled) {
    if (dateTime.dateType === ETimeTypes.Interval && dateTime.date && dateTime.dateTill) {
      result += `${replaceAllString(dateTime.date, '-', '.')} - ${replaceAllString(dateTime.dateTill, '-', '.')}`
    } else if (dateTime.dateType === ETimeTypes.Single && dateTime.date && dateTime.dateComparator !== undefined) {
      result += `${comparatorMap[dateTime.dateComparator]}${replaceAllString(dateTime.date, '-', '.')}`
    } else {
      console.error('Date error at stringifyDateTime', dateTime)
    }
  }

  if (!dateTime.timeDisabled) {
    if (dateTime.timeType === ETimeTypes.Interval && dateTime.time && dateTime.timeTill) {
      result += ` ${dateTime.time} - ${dateTime.timeTill}`
    } else if (dateTime.timeType === ETimeTypes.Single && dateTime.time && dateTime.timeComparator !== undefined) {
      result += ` ${comparatorMap[dateTime.timeComparator]}${dateTime.time}`
    } else {
      console.error('Time error at stringifyDateTime', dateTime)
    }
  }

  return result
}