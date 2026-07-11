import _ from 'lodash'
import { findBestMatch } from 'string-similarity'
import moment, { Moment } from 'moment'
import { ISelectOption } from '../types'
import {
  EStatuses,
  IOrder,
  IUser,
  IAddressPoint,
  TBlockObject,
} from '../types/types'
import images from '../constants/images'
import SITE_CONSTANTS, { CURRENCY } from '../siteConstants'
import { t, TRANSLATION } from '../localization'

export function firstItem<T>(value: Iterable<T>): T | undefined {
  for (const item of value)
    return item
}

export function makeFlat(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value && !(value instanceof Array)) {
      const nestedObj = makeFlat(value as Record<string, unknown>)
      for (const [nestedKey, nestedValue] of Object.entries(nestedObj))
        result[`${key}.${nestedKey}`] = nestedValue
    } else if (!(key in result))
      result[key] = value
  }
  return result
}

export function makeNested(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = key.split('.')
    let nestedObj = result
    for (const [index, nestedKey] of path.entries()) {
      if (index === path.length - 1)
        nestedObj[nestedKey] = value
      else if (
        !nestedObj[nestedKey] ||
        typeof nestedObj[nestedKey] !== 'object'
      ) nestedObj[nestedKey] = {}
      nestedObj = nestedObj[nestedKey] as Record<string, unknown>
    }
  }
  return result
}

export function deepGet(obj: unknown, path: string): unknown {
  return path.split('.').reduce((res, key) => (res as any)?.[key], obj)
}

export function cloneFormData(formData: FormData) {
  const result = new FormData()
  for (const [key, value] of formData)
    result.append(key, value)
  return result
}

const hints = [
  'Roman Ridge',
  'Kanda',
  'East Legon',
  'Kaneshie',
  'North Kaneshie',
  'Accra New Town',
  'Nima',
  'Kokomlemle',
  'Tesano',
  'Maamobi',
  'Alajo',
  'Christian Village',
  'Apenkwa',
  'Darkuman',
  'Awoshie',
  'Avenor',
  'Kwashieman',
  'Achimota',
  'Bubiashie',
  'Kotobabi',
  'Abelemkpe',
  'Accra',
  'Ashaiman',
  'La',
  'Tema',
  'Towns',
  'Ada Foah',
  'Adjen Kotoku',
  'Big Ada',
  'Bornikope',
  'Feyito',
  'Madina',
  'Medie',
  'Prampram',
  'Sege',
  'Teshie',
  'Tojeh',
  'Villages',
  'Afienya',
  'Akplabanya',
  'Anyamam',
  'Berekuso',
  'Bortianor',
  'Dawhenya',
  'Doryumu',
  'Goi',
  'Kokrobite',
  'Kpone',
  'Malejor',
  'Manya-Jorpanya',
  'Matsekope',
  'Obame',
  'Oblogo',
  'Oyibi',
  'Salom',
  'Toflokpo',
  'Totope',
  'Tuba',
  'Hamlets',
  'Appolonia',
  'Christiansborg',
  'Juba Villas',
  'Oshiyie',
  'Localities',
  'Arabella Residency',
  'Ayigbe Town',
  'Bankuman',
  'Bojo Beach',
  'New Barrier / Tuba Junction',
  'Nim Tree Circle',
  'Old Barrier/Kokrobite Junction',
  'Suburbs',
  'Abeka',
  'Abelenkpe',
  'Abofu',
  'Abokobi',
  'Abossey Okai',
  'Accra New Town',
  'Achimota',
  'Adabraka',
  'Adentan',
  'Adjiringanor',
  'Airport Residential Area',
  'Akweteyman',
  'Alaji',
  'Alajo',
  'Alogboshie',
  'Amasaman',
  'Ashaley Botwe',
  'Ashongman',
  'Asylum Down',
  'Awoshie',
  'Awudome Estates',
  'Ayigbe Town',
  'Bethlehem',
  'Bukom',
  'Burma Camp',
  'Cantonments',
  'Chorkor',
  'Christian Village',
  'Community 1',
  'Community 10',
  'Community 11',
  'Community 12',
  'Community 17',
  'Community 2',
  'Community 22',
  'Community 25',
  'Community 3',
  'Community 4',
  'Community 5',
  'Community 6',
  'Community 7',
  'Community 8',
  'Community 9',
  'Dansoman',
  'Darkuman',
  'Dome',
  'Dzorwulu',
  'East Airport',
  'East Legon',
  'Freetown',
  'Galiliea',
  'Gbawe',
  'Greda Estate',
  'Green Hill',
  'James Town',
  'kakasunaka No.1',
  'Kanda Estates',
  'Kaneshie',
  'Kisseman',
  'Kokomlemle',
  'Kokompe',
  'Korle Gonno',
  'Korlebu',
  'Kotobabi',
  'Kwabenya',
  'La',
  'Labone',
  'Lantemame',
  'Lapaz',
  'Lartebiokorshie',
  'Little Legon',
  'Maamobi',
  'Mallam',
  'Mallam Borla',
  'Mamprobi',
  'Masalatsi',
  'Mataheko',
  'Mataheko',
  'McCarthy Hill',
  'Mendskrom',
  'Ministries',
  'Mpoase',
  'NanaKrom',
  'Nasalat',
  'New Abelekuma',
  'New Achimota',
  'New Gbawe',
  'New Legon',
  'New Russia',
  'New Weija',
  'Nii Boi Town',
  'Nima',
  'North Dzorwolu',
  'North Industrial Area',
  'North Kaneshie',
  'North Ridge',
  'Nungua',
  'Nyamekye',
  'Nyaniba Estates',
  'Obenyade',
  'Odorkor',
]

// eslint-disable-next-line
export const phoneRegex = /^[\+]?[0-9]{1,3}[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{3,6}$/im
export const minPhoneLength = 10
export const maxPhoneLength = 15
// eslint-disable-next-line
export const emailRegex = /^(([^<>()\[\]\.,;:\s@\"]+(\.[^<>()\[\]\.,;:\s@\"]+)*)|(\".+\"))@(([^<>()[\]\.,;:\s@\"]+\.)+[^<>()[\]\.,;:\s@\"]{2,})$/i

const DISTANCE_COEFFICIENT = 1.5

export const dateFormat = 'YYYY-MM-DD HH:mm:ssZ'
// export const dateShowFormat = 'YYYY-MM-DD HH:mm'
export const dateShowFormat = 'HH:mm DD-MM'
export const dateFormatDate = 'DD-MM'
// export const dateFormatDate = 'YYYY-MM-DD'
export const dateFormatTime = 'HH:mm:ss'
export const dateFormatTimeShort = 'HH:mm'

export enum EPaymentType {
  Customer,
  Calculated,
}

export const cachedOrderDataStateKey = 'cachedOrderDataState'
export const cachedOrderDataValuesKey = 'cachedOrderDataValues'

/**
 * You need to pass order || ((points || distance) && startDatetime && carClass)
 */
export function getPayment(
  order?: IOrder | null,
  points?: [IAddressPoint, IAddressPoint] | null,
  distance?: number,
  startDatetime?: IOrder['b_start_datetime'],
  carClass?: string,
): {
  value: number | string,
  text: string,
  type: EPaymentType,
} {
  if (order?.b_options?.customer_price && SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE)
    return {
      value: order.b_options.customer_price,
      text: '',
      type: EPaymentType.Customer,
    }
  const _distance = distance ??
    calcOrderDistance(points, order) ??
    order?.b_options?.pricingModel?.options?.distance

  let _orderTime = startDatetime,
    _startOfNightTime = moment(SITE_CONSTANTS.START_OF_NIGHT_TIME, 'h:mm'),
    _endOfNightTime = moment(SITE_CONSTANTS.END_OF_NIGHT_TIME, 'h:mm'),
    _midTime = moment('12:00', 'h:mm')
  if (_orderTime?.isAfter(_midTime)) {
    _endOfNightTime = _endOfNightTime.add(1, 'days')
  } else {
    _startOfNightTime = _startOfNightTime.subtract(1, 'days')
  }

  if (carClass === undefined)
    carClass = order?.b_car_class
  const carClassData = carClass ? SITE_CONSTANTS.CAR_CLASSES[carClass] : null
  const callRate = carClassData?.courier_call_rate ??
    SITE_CONSTANTS.COURIER_CALL_RATE
  const farePer1Km = carClassData?.courier_fare_per_1_km ??
    SITE_CONSTANTS.COURIER_FARE_PER_1_KM
  let _value: string | number = callRate + farePer1Km * _distance,
    _text = ''
  if (_orderTime?.isAfter(_startOfNightTime) && _orderTime.isBefore(_endOfNightTime)) {
    _value *= SITE_CONSTANTS.EXTRA_CHARGE_FOR_NIGHT_TIME
    _text = `${SITE_CONSTANTS.EXTRA_CHARGE_FOR_NIGHT_TIME} * \
      ( ${callRate} + ${farePer1Km} * ${_distance}${t(TRANSLATION.KM)} ) = \
      ${_value === 0 ? '-' : _value}`
  } else {
    _text = `${callRate} + ${farePer1Km} * ${_distance}${t(TRANSLATION.KM)} = \
      ${_value === 0 ? '-' : _value}`
  }

  return { value: _value, text: _text, type: EPaymentType.Calculated }
}

export function calcOrderDistance(
  points?: (IAddressPoint | null)[] | null,
  order?: IOrder | null,
) {
  const [from, to] =
    points ||
    [
      {
        latitude: order?.b_start_latitude,
        longitude: order?.b_start_longitude,
      },
      {
        latitude: order?.b_destination_latitude,
        longitude: order?.b_destination_longitude,
      },
    ]
  if (
    from && to &&
    from.latitude && from.longitude &&
    to.latitude && to.longitude
  ) {
    let _distance = distanceBetweenEarthCoordinates(
      from.latitude, from.longitude,
      to.latitude, to.longitude,
    )

    return Math.round((_distance * DISTANCE_COEFFICIENT * 100) / 100)
  } else {
    return 0
  }
}

export const getEmptyPhoneValue = () => {
  return SITE_CONSTANTS.DEFAULT_PHONE_MASK
}

export function getPhoneError(phone?: string | null, required = true) {
  if (!phone)
    return null
  if (phone === getEmptyPhoneValue() || phone === '')
    return required ? t(TRANSLATION.REQUIRED_FIELD) : null
  if (!phone.match(phoneRegex))
    return t(TRANSLATION.PHONE_PATTERN_ERROR)
  return null
}

export function getPhoneNumberError(
  phone: number | null,
  required = true,
): string | null {
  if (
    phone === null ||
    phone < 10 ** (getEmptyPhoneValue().match(/\d/g)?.length ?? 0)
  )
    return required ? t(TRANSLATION.REQUIRED_FIELD) : null
  if (phone < 10 ** (minPhoneLength - 1) || phone >= 10 ** maxPhoneLength)
    return t(TRANSLATION.PHONE_PATTERN_ERROR)
  return null
}

export const getPointError = (point?: IAddressPoint | null) => {
  if (point === null) return null
  if (_.isEqual(point, {})) return t(TRANSLATION.REQUIRED_FIELD)
  return null
}

export const getCurrentLocationError = (point?: IAddressPoint | null) => {
  if (point === null) return null
  if (_.isEqual(point, {})) return t(TRANSLATION.CURRENT_LOCATION_IS_FORBIDDEN)
  return null
}

const degreesToRadians = (degrees: number): number => {
  return degrees * Math.PI / 180
}

export const distanceBetweenEarthCoordinates = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const earthRadiusKm = 6371

  let dLat = degreesToRadians(lat2-lat1),
    dLon = degreesToRadians(lon2-lon1)

  lat1 = degreesToRadians(lat1)
  lat2 = degreesToRadians(lat2)

  let a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2),
    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return earthRadiusKm * c
}

export const getAngle = (from: IAddressPoint, to: IAddressPoint) => {
  if (!to.longitude || !from.longitude || !to.latitude || !from.latitude) return
  return Math.atan2(to.longitude - from.longitude, to.latitude - from.latitude) * 180 / Math.PI
}

/**
 * @param fromDate date to start from. Actual day by default
 */
export const getDayOptions = (fromDate?: Moment | null) => {
  const today = moment('00:00:00', dateFormatTime)
  const tomorrow = moment('00:00:00', dateFormatTime)
  tomorrow.date(tomorrow.date() + 1)

  let date = !fromDate ? moment('00:00:00', dateFormatTime) : fromDate.clone()
  date.hours(0)
  date.minutes(0)
  date.seconds(0)
  // date.days(date.days() + 1)

  let options: ISelectOption<string>[] = []

  if (date <= today)
    options.push({ label: t(TRANSLATION.TODAY), value: today.format(dateFormatDate) })
  if (date <= tomorrow)
    options.push({ label: t(TRANSLATION.TOMORROW), value: tomorrow.format(dateFormatDate) })

  for (let i = 1; i <= 13; i++) {
    date.days(date.days() + 1)

    let formattedDate = date.format(dateFormatDate)
    options.push({ label: formattedDate, value: formattedDate })
  }

  return options
}

/**
 * @param fromDate date to start from. Set null to start from 00:00. Actual time by default
 */
export const getTimeOptions = (fromDate?: Moment | null) => {
  let date = !fromDate ? moment('00:00:00', dateFormatTime) : fromDate.clone()
  date.minutes(
    date.minutes() < 15 ? 0 : (date.minutes() > 45 ? 60 : 30),
  )

  let options: ISelectOption<string | null>[] = [
    { label: t(TRANSLATION.NOT_IMPORTANT), value: '' },
  ]
  if (!fromDate || fromDate <= moment())
    options.unshift({ label: t(TRANSLATION.NOW), value: moment().format(dateFormatTimeShort) })

  date.minutes(date.minutes() + 30)

  const tomorrow = moment('00:00:00', dateFormatTime)
  tomorrow.date(tomorrow.date() + 1)

  while (date <= tomorrow) {
    let formattedDate = date.format(dateFormatTimeShort)
    options.push({ label: formattedDate, value: formattedDate })

    date.minutes(date.minutes() + 30)
  }

  return options
}

export const formatComment = (
  ids: IOrder['b_comments'],
  custom: IOrder['b_custom_comment'],
  userID: IUser['u_id'],
  options: IOrder['b_options'],
) => {
  if (options && options.from_tel)
    return `${t(TRANSLATION.DELIVERY)} "${options.object}"${
      options.weight ?
        ` ${t(TRANSLATION.NUMBER_TILL)} ${options.weight}${t(TRANSLATION.KG)}` :
        ''
    }${
      options.is_loading_needs ?
        `, ${t(TRANSLATION.BOXING_REQUIRED, { toLower: true })}` :
        ''
    }${
      userID ?
        `, ${t(TRANSLATION.CLIENT, { toLower: true })} - ${userID}` :
        ''
    }`

  if (ids)
    return `${
      ids
        .filter(item => parseInt(item) < 99)
        .map(item => stripLeadingEmoji(t(TRANSLATION.BOOKING_COMMENTS[item])))
        .join(', ')
    }${
      custom ?
        `, ${custom}` :
        ''
    }${
      userID ?
        `, ${t(TRANSLATION.CLIENT, { toLower: true })} - ${userID}` :
        ''
    }`

  return `${custom ? `${custom}, ` : ''}${userID ? `${t(TRANSLATION.CLIENT, { toLower: true })} - ${userID}` : ''}`
}

const EMOJI: Record<string, string> = {
  1: images.emoji_1,
  2: images.emoji_2,
  3: images.emoji_3,
  4: images.emoji_4,
  5: images.emoji_5,
  6: images.emoji_6,
  7: images.emoji_7,
  '7.1': images.emoji_7_1,
  8: images.emoji_8,
}

export const formatCommentWithEmoji = (
  ids: IOrder['b_comments'],
) => {
  return ids
    ?.filter(id => parseInt(id) < 99)
    .map(id => ({
      id,
      src: EMOJI[id],
      hint: stripLeadingEmoji(t(TRANSLATION.BOOKING_COMMENTS[id])),
    }))
}

export const stripLeadingEmoji = (text: string) => {
  return String(text ?? '')
    .replace(/^(?:[\s\uFE0F\u200D\u20E3]*(?:[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u21AA\u231A-\u23FF\u24C2\u25AA-\u25FE\u2600-\u27BF\u2934-\u2935\u2B05-\u2B55\u3030\u303D\u3297\u3299]|[\uD83C-\uDBFF][\uDC00-\uDFFF]|[0-9#*]\uFE0F?\u20E3))+\s*/, '')
    .trimStart()
}

export const getHints = (text?: string) => {
  if (!text) return []
  // const words = [...text.matchAll(/[,\s]*([\w-]+)/g)]
  // const last = words[words.length - 1][1]
  const parts = text.split(',')
  const last = parts[parts.length - 1]
  return findBestMatch(last, hints)
    .ratings
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 3)
    .filter(item => item.rating !== 0)
    .map(item => text.replace(last.trim(), item.target))
}

export const shortenAddress = (address: string, splitter?: string) => {
  if (!splitter) {
    return address
  }
  return address.slice(0, address.indexOf(splitter) + splitter.length)
}

export const getStatusClassName = (status: EStatuses) => {
  switch(status) {
    case EStatuses.Fail: return 'fail'
    case EStatuses.Success: return 'success'
    case EStatuses.Loading: return 'loading'
    case EStatuses.Warning: return 'warning'
    default: return 'default'
  }
}

// TODO add api keys
export const getTileServerUrl = () => {
  // switch (SITE_CONSTANTS.MAP_MODE) {
  //   case MAP_MODE.GOOGLE:
  //     return 'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}'
  //   case MAP_MODE.OSM:
  //     return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  //   case MAP_MODE.YANDEX:
  //     return 'https://vec03.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}'
  //   default:
  //     return ''
  // }
  return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
}

export const getAttribution = () => {
  // switch (SITE_CONSTANTS.MAP_MODE) {
  //   case MAP_MODE.OSM:
  //     return 'Map data &copy; <a href="https://www.openstreetmap.org/">
  //OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>,
  //Imagery © <a href="https://www.mapbox.com/">Mapbox</a>'
  //   case MAP_MODE.YANDEX:
  //     return '<a http="yandex.ru" target="_blank">Яндекс</a>'
  //   default:
  //     return ''
  // }
  return 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>'
}

export function addHiddenOrder(orderID?: IOrder['b_id'], userID?: IUser['u_id']) {
  if (!orderID || !userID) return
  const hiddenOrders = JSON.parse(localStorage.getItem('hiddenOrders') || '{}')
  const currentOrders: IOrder['b_id'][] = Array.isArray(hiddenOrders[userID]) ? hiddenOrders[userID] : []
  hiddenOrders[userID] = currentOrders.includes(orderID) ? currentOrders : [...currentOrders, orderID]
  localStorage.setItem('hiddenOrders', JSON.stringify(hiddenOrders))
  window.dispatchEvent(new CustomEvent('hiddenOrdersChanged', { detail: { orderID, userID } }))
}

export const HIGH_ACCURACY_GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
}

export const getCurrentPosition = (
  options?: PositionOptions,
) =>
  new Promise<GeolocationPosition>((res, rej) => {
    navigator.geolocation.getCurrentPosition(
      res,
      rej,
      {
        ...HIGH_ACCURACY_GEOLOCATION_OPTIONS,
        ...options,
        enableHighAccuracy: true,
      },
    )
  })

export const getOrderIcon = (order: IOrder) => {
  if (order.b_comments?.includes('98')) return images.deliveryRed
  if (order.b_comments?.includes('97')) return images.motorcycleRed
  if (order.b_comments?.includes('96')) return images.moveColored
  if (order.b_comments?.includes('95')) return images.bigTruck
  if (order.b_voting) return images.votingRed
  return images.uGroup
}

export const getOrderCount = (order: IOrder) => {
  if (['96', '97', '98', '99'].some(i => order.b_comments?.includes(i))) return ''
  if (order.b_comments?.includes('95')) return order.b_options?.carsCount
  return order.b_passengers_count
}

const tProps = ['html', 'text', 'label', 'placeholder', 'alt']
const iProps = ['src']
const rProps = ['imageProps']
export const mapBlockObject = (rawObject: TBlockObject) => {
  const object: TBlockObject = {}
  for (let key in rawObject) {
    if (tProps.includes(key) && rawObject[key]) {
      object[key] = String(rawObject[key]).replace(
          /t\(([^(^)]*?)\)/g,
          (fullMatch: string, translationParameters: string) => {
            try {
              const [key, options] = translationParameters.split(',')
              return t(TRANSLATION[key as keyof typeof TRANSLATION], options ? JSON.parse(options.trim()) : undefined)
            } catch (error) {
              console.error(error)
              return fullMatch
            }
          },
        )
      continue
    }
    if (iProps.includes(key) && rawObject[key]) {
      object[key] = String(rawObject[key]).replace(
          /i\(([^(^)]*?)\)/g,
          (fullMatch: string, imageKey: keyof typeof images) => images[imageKey],
        )
      continue
    }
    if (rProps.includes(key) && rawObject[key]) {
      object[key] = mapBlockObject(rawObject[key])
      continue
    }
    object[key] = rawObject[key]
  }

  return object
}

export const getBase64 = (file: any) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.readAsDataURL(file)
  reader.onload = () => resolve(reader.result)
  reader.onerror = error => reject(error)
})

export function formatCurrency(
  value: number,
  { signDisplay = 'auto', currencyDisplay = 'symbol' }: {
    signDisplay?: 'auto' | 'always' | 'exceptZero' | 'negative' | 'never',
    currencyDisplay?: 'code' | 'symbol' | 'narrowSymbol' | 'name' | 'none'
  } = {},
) {
  const result = new Intl.NumberFormat(undefined, {
    signDisplay,
    style: 'currency',
    currency: CURRENCY.NAME,
    currencyDisplay: currencyDisplay !== 'none' ? currencyDisplay : 'code',
  }).format(value)
  return currencyDisplay === 'none' ?
    result.replace(CURRENCY.NAME, '') :
    result
}
