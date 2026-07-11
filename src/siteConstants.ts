import { PassengerOrderConfig } from './tools/siteConstants/formConfig'
import { objectFromEntries } from './tools/compat'
import {
  parseAvailableModes,
  parseCities,
  parseCarClasses,
  parseBookingComments,
  parseBookingLocationClasses,
  parseCalculationBenefits,
  parseEntries,
  parseLanguages,
  parseMoneyModes,
} from './tools/parse'
import {
  IPaletteColor,
  TAvailableModes,
  TEntries,
  ILanguage,
  TMoneyModes,
  ICity,
  ICarClass,
  IBookingLocationClass,
  EBookingLocationKinds,
  EDriverResponseModes,
  EBookingCommentTypes,
  IBookingComment,
  IProfitEstimationConfig,
} from './types/types'
import shader from 'shader'

const SITE_CONSTANTS_SECTION = 'site_constants'
const CURRENCIES_SECTION = 'currencies'
const ALL_TABS_AVAILABLE = '1;2;3=1,2,3,4,5,6;4;5;6;7;8;'

export enum EMapMode {
  OSM = 'OSM',
  GOOGLE = 'GOOGLE',
  YANDEX = 'YANDEX',
}

export enum EIconsPalettes {
  Default = 'default',
  GHA = 'GHA',
}

const defaultValues = {
  COURIER_CALL_RATE: 10,
  EXTRA_CHARGE_FOR_NIGHT_TIME: 2,
  COURIER_FARE_PER_1_KM: 2.5,
  START_OF_NIGHT_TIME: '20:00',
  END_OF_NIGHT_TIME: '5:00',
  ENABLE_CUSTOMER_PRICE: false,
  DEFAULT_PHONE_MASK: '+233(___)-___-___',
  MAP_MODE: EMapMode.OSM,
  OG_IMAGE: null,
  TW_IMAGE: null,
  WAITING_INTERVAL: 180,
  CANCEL_ORDER_REASONS: '0-mistakenly_ordered;1-waiting_for_long;2-conflict_with_rider;3-very_expensive',
  DRIVER_CHOICE_CANCEL_REASONS: '0-driver_choice_cancel_reason_long_wait;1-driver_choice_cancel_reason_another_driver;2-driver_choice_cancel_reason_wrong_choice;3-driver_choice_cancel_reason_car_not_suitable;4-driver_choice_cancel_reason_other',
  DRIVER_OFFER_ETA_OPTIONS: '5-driver_offer_eta_5;10-driver_offer_eta_10;15-driver_offer_eta_15;20-driver_offer_eta_20;30-driver_offer_eta_30;45-driver_offer_eta_45;60-driver_offer_eta_60;90-driver_offer_eta_90;120-driver_offer_eta_120;180-driver_offer_eta_180',
  DRIVER_OFFER_COMMENT_OPTIONS: '0-driver_offer_comment_direct;1-driver_offer_comment_fast;2-driver_offer_comment_ac;3-driver_offer_comment_big_trunk;4-driver_offer_comment_nearby;5-driver_offer_comment_careful',
  DRIVER_OFFER_SEAT_OPTIONS: '1-1;2-2;3-3;4-4;5-5;6-6;7-7;8-8',
  LIST_OF_CARGO_VALUATION_AMOUNTS: '50,-600,600',
  LIST_OF_MODES_USED: ALL_TABS_AVAILABLE,
  THE_LANGUAGE_OF_THE_SERVICE: '2',
  PASSENGER_ORDER_CONFIG: new PassengerOrderConfig(),
  DEFAULT_POSITION: '5.5560200,-0.1969000',
  SEARCH_RADIUS: 50,
  COUNTRIES: { GHA: {} },
  DEFAULT_COUNTRY: 'GHA',
  CITIES: {},
  PALETTE: '#A90000;#ffc837',
  ICONS_PALETTE_FOLDER: EIconsPalettes.Default,
  MONEY_MODES: '',
  BIG_TRUCK_TRANSPORT_TYPES: '1-truck;2-wagon',
  BIG_TRUCK_CARGO_TYPES: '1-truck;2-wagon',
  C_OPTIONS_VALID_KEYS: JSON.stringify({}),
  CAR_CLASSES: {},
  DRIVER_RESPONSE_MODE: EDriverResponseModes.Performer,
  BOOKING_COMMENTS: {
    ...objectFromEntries(new Array(7).fill(undefined).map((_, index) => [
      `${index + 1}`,
      { id: `${index + 1}` },
    ])),
    '8': { id: '8', type: EBookingCommentTypes.Plane },
  },
  BOOKING_LOCATION_CLASSES: {},
  CALCULATION_BENEFITS: JSON.stringify({}),
  TEST_USER_ID: '',
  TEST_USER_IDS: '',
  LANGUAGES: {
    1: { iso: 'ru', logo: 'ru', native: 'Русский' },
    2: { iso: 'en', logo: 'gb', native: 'English' },
    3: { iso: 'ar', logo: 'ma', native: 'العربية' },
    4: { iso: 'fr', logo: 'fr', native: 'Français' },
  },
} as const

type TReasonEntry = { id: string, label: string }

class Constants {
  COURIER_CALL_RATE: number
  EXTRA_CHARGE_FOR_NIGHT_TIME: number
  COURIER_FARE_PER_1_KM: number
  START_OF_NIGHT_TIME: string
  END_OF_NIGHT_TIME: string
  ENABLE_CUSTOMER_PRICE: boolean
  DEFAULT_PHONE_MASK: string
  MAP_MODE: EMapMode
  OG_IMAGE: string | null
  TW_IMAGE: string | null
  WAITING_INTERVAL: number
  CANCEL_ORDER_REASONS: TReasonEntry[]
  DRIVER_CHOICE_CANCEL_REASONS: TReasonEntry[]
  DRIVER_OFFER_ETA_OPTIONS: TReasonEntry[]
  DRIVER_OFFER_COMMENT_OPTIONS: TReasonEntry[]
  DRIVER_OFFER_SEAT_OPTIONS: TReasonEntry[]
  LIST_OF_CARGO_VALUATION_AMOUNTS: string
  LIST_OF_MODES_USED: TAvailableModes
  THE_LANGUAGE_OF_THE_SERVICE: string
  PASSENGER_ORDER_CONFIG: PassengerOrderConfig
  DEFAULT_POSITION: [number, number]
  SEARCH_RADIUS: number
  COUNTRIES: Record<string, {}>
  DEFAULT_COUNTRY: string
  CITIES: Record<ICity['id'], ICity>
  PALETTE: {
    primary: IPaletteColor,
    secondary: IPaletteColor,
  }
  ICONS_PALETTE_FOLDER: EIconsPalettes
  MONEY_MODES: TMoneyModes
  BIG_TRUCK_TRANSPORT_TYPES: TEntries
  BIG_TRUCK_CARGO_TYPES: TEntries
  C_OPTIONS_VALID_KEYS: Record<string, boolean>
  CAR_CLASSES: Record<ICarClass['id'], ICarClass>
  DEFAULT_CAR_CLASS: ICarClass['id']
  DRIVER_RESPONSE_MODE: EDriverResponseModes
  BOOKING_COMMENTS: Record<IBookingComment['id'], IBookingComment>
  BOOKING_LOCATION_CLASSES: IBookingLocationClass[]
  DEFAULT_BOOKING_LOCATION_CLASS: IBookingLocationClass['id']
  CALCULATION_BENEFITS: Record<
    string, Record<
      ICarClass['id'], IProfitEstimationConfig
    >
  >
  TEST_USER_ID: string
  TEST_USER_IDS: string[]
  LANGUAGES: ILanguage[]

  constructor() {
    this.PASSENGER_ORDER_CONFIG = new PassengerOrderConfig()
    this.recalculate()
  }

  recalculate() {
    this.COURIER_CALL_RATE = getConstantValue('courier_call_rate', defaultValues.COURIER_CALL_RATE)
    this.EXTRA_CHARGE_FOR_NIGHT_TIME = getConstantValue('extra_charge_for_night_time', defaultValues.EXTRA_CHARGE_FOR_NIGHT_TIME)
    this.COURIER_FARE_PER_1_KM = getConstantValue('courier_fare_per_1_km', defaultValues.COURIER_CALL_RATE)
    this.START_OF_NIGHT_TIME = getConstantValue('start_of_night_time', defaultValues.START_OF_NIGHT_TIME)
    this.END_OF_NIGHT_TIME = getConstantValue('the_end_of_the_night_time', defaultValues.END_OF_NIGHT_TIME)
    this.ENABLE_CUSTOMER_PRICE = this.calc_ENABLE_CUSTOMER_PRICE()
    this.DEFAULT_PHONE_MASK = this.calc_DEFAULT_PHONE_MASK()
    this.MAP_MODE = getConstantValue('map_mode', defaultValues.MAP_MODE)
    this.OG_IMAGE = getConstantValue('og_image', defaultValues.OG_IMAGE)
    this.TW_IMAGE = getConstantValue('tw_image', defaultValues.TW_IMAGE)
    this.WAITING_INTERVAL = getConstantValue('waiting_interval', defaultValues.WAITING_INTERVAL)
    this.CANCEL_ORDER_REASONS = getConstantValue(
      'cancel_order_reasons',
      defaultValues.CANCEL_ORDER_REASONS,
      parseReasonEntries,
    )
    this.DRIVER_CHOICE_CANCEL_REASONS = getConstantValue(
      'driver_choice_cancel_reasons',
      defaultValues.DRIVER_CHOICE_CANCEL_REASONS,
      parseReasonEntries,
    )
    this.DRIVER_OFFER_ETA_OPTIONS = getConstantValue(
      'driver_offer_eta_options',
      defaultValues.DRIVER_OFFER_ETA_OPTIONS,
      parseReasonEntries,
    )
    this.DRIVER_OFFER_COMMENT_OPTIONS = getConstantValue(
      'driver_offer_comment_options',
      defaultValues.DRIVER_OFFER_COMMENT_OPTIONS,
      parseReasonEntries,
    )
    this.DRIVER_OFFER_SEAT_OPTIONS = getConstantValue(
      'driver_offer_seat_options',
      defaultValues.DRIVER_OFFER_SEAT_OPTIONS,
      parseReasonEntries,
    )
    this.LIST_OF_CARGO_VALUATION_AMOUNTS = getConstantValue('list_of_cargo_valuation_amounts', defaultValues.LIST_OF_CARGO_VALUATION_AMOUNTS)
    this.LIST_OF_MODES_USED = getConstantValue(
      'list_of_modes_used',
      defaultValues.LIST_OF_MODES_USED,
      (value) => parseAvailableModes(value),
    )
    this.THE_LANGUAGE_OF_THE_SERVICE = getConstantValue('the_language_of_the_service', defaultValues.THE_LANGUAGE_OF_THE_SERVICE)
    this.COUNTRIES = getConstantValue('countries', defaultValues.COUNTRIES)
    this.DEFAULT_COUNTRY = getConstantValue('Country_service', defaultValues.DEFAULT_COUNTRY)
    this.CITIES = parseCities(
      (window as any).data?.cities ?? defaultValues.CITIES,
    )
    this.PALETTE = getConstantValue(
      'palette',
      defaultValues.PALETTE,
      (value) => {
        const mainColors: [string, string] = value.split(';')

        return {
          primary: {
            main: mainColors[0],
            light: shader(mainColors[0], .5),
            dark: shader(mainColors[0], -.5),
          },
          secondary: {
            main: mainColors[1],
            light: shader(mainColors[1], .5),
            dark: shader(mainColors[1], -.5),
          },
        }
      },
    )
    this.DEFAULT_POSITION = getConstantValue(
      'geo_default',
      defaultValues.DEFAULT_POSITION,
      (value) => value.split(',').map(parseFloat),
    )
    this.SEARCH_RADIUS = getConstantValue(
      'radius_geo_name',
      defaultValues.SEARCH_RADIUS,
      parseInt,
    )
    this.PASSENGER_ORDER_CONFIG.apply(getConstantValue('passenger_order_config', ''))
    const countryService = getConstantValue('Country_service', undefined)
    this.ICONS_PALETTE_FOLDER =
      Object.values(EIconsPalettes).includes(countryService) ?
        countryService :
        defaultValues.ICONS_PALETTE_FOLDER
    this.MONEY_MODES = getConstantValue(
      'mode_money',
      defaultValues.MONEY_MODES,
      (value) => parseMoneyModes(value),
    )
    this.BIG_TRUCK_TRANSPORT_TYPES = getConstantValue(
      'type_of_transport',
      defaultValues.BIG_TRUCK_TRANSPORT_TYPES,
      parseEntries,
    )
    this.BIG_TRUCK_CARGO_TYPES = getConstantValue(
      'type_of_cargo',
      defaultValues.BIG_TRUCK_CARGO_TYPES,
      parseEntries,
    )
    this.C_OPTIONS_VALID_KEYS = getConstantValue(
      'c_options_valid_keys',
      defaultValues.C_OPTIONS_VALID_KEYS,
      JSON.parse,
    )
    this.CAR_CLASSES = parseCarClasses(
      (window as any).data?.car_classes ?? defaultValues.CAR_CLASSES,
    )
    this.DRIVER_RESPONSE_MODE = getConstantValue(
      'mode_response',
      defaultValues.DRIVER_RESPONSE_MODE,
      value => +value,
    )
    this.BOOKING_COMMENTS = (window as any).data?.booking_comments ?
      parseBookingComments(
        (window as any).data.booking_comments,
        getConstantValue('mode_response_other', ''),
        defaultValues.BOOKING_COMMENTS,
      ) :
      defaultValues.BOOKING_COMMENTS
    this.BOOKING_LOCATION_CLASSES = parseBookingLocationClasses(
      (window as any).data?.booking_location_classes ??
        defaultValues.BOOKING_LOCATION_CLASSES,
    )
    this.DEFAULT_BOOKING_LOCATION_CLASS =
      this.BOOKING_LOCATION_CLASSES[0]?.id ?? '-1'
    this.DEFAULT_CAR_CLASS = getDefaultCityPetitCarClass(
      this.CAR_CLASSES,
      this.BOOKING_LOCATION_CLASSES,
      this.DEFAULT_BOOKING_LOCATION_CLASS,
    )
    this.CALCULATION_BENEFITS = getConstantValue(
      'calculation_benefits',
      defaultValues.CALCULATION_BENEFITS,
      parseCalculationBenefits,
    )
    this.TEST_USER_ID = getConstantValue('test_user_id', defaultValues.TEST_USER_ID)
    this.TEST_USER_IDS = normalizeTestUserIds([
      this.TEST_USER_ID,
      getConstantValue('test_user_ids', defaultValues.TEST_USER_IDS),
    ])
    this.LANGUAGES = parseLanguages((window as any).data?.langs || defaultValues.LANGUAGES)
  }

  calc_ENABLE_CUSTOMER_PRICE() {
    const _value = getConstantValue('customer_price', 'N')

    return _value === 'Y'
  }

  calc_DEFAULT_PHONE_MASK() {
    return getConstantValue('def_maska_tel', defaultValues.DEFAULT_PHONE_MASK)
  }
}



function parseReasonEntries(value: unknown): TReasonEntry[] {
  const normalizeReason = (item: any, index: number): TReasonEntry | null => {
    if (item === null || item === undefined)
      return null

    if (typeof item === 'object') {
      const id = String(item.id ?? item.key ?? item.value ?? index).trim()
      const label = String(item.label ?? item.text ?? item.title ?? item.name ?? '').trim()
      return label ? { id, label } : null
    }

    const raw = String(item).trim()
    if (!raw)
      return null

    const separatorIndex = raw.search(/[-:=|]/)
    if (separatorIndex > 0) {
      const id = raw.slice(0, separatorIndex).trim()
      const label = raw.slice(separatorIndex + 1).trim()
      return label ? { id, label } : null
    }

    return { id: String(index), label: raw }
  }

  if (Array.isArray(value))
    return value
      .map(normalizeReason)
      .filter(Boolean) as TReasonEntry[]

  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, any>)
      .map(([id, item], index) => normalizeReason(
        typeof item === 'object' && item !== null ? { id, ...item } : { id, label: item },
        index,
      ))
      .filter(Boolean) as TReasonEntry[]

  const raw = String(value ?? '').trim()
  if (!raw)
    return []

  try {
    const parsed = JSON.parse(raw)
    const result = parseReasonEntries(parsed)
    if (result.length)
      return result
  } catch (error) {
    // Plain list format, not JSON.
  }

  return raw
    .split(/\s*;\s*/)
    .map(normalizeReason)
    .filter(Boolean) as TReasonEntry[]
}

function normalizeTestUserIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]

  return values.reduce<string[]>((result, item) => {
    String(item ?? '')
      .split(/[,\s;|]+/g)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => result.push(part))
    return result
  }, [])
}

function normalizeConstantText(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isPetitCarClass(carClass: ICarClass) {
  const text = [
    carClass.id,
    carClass.name,
    carClass.title,
    carClass.label,
    carClass.code,
    carClass.type,
  ].map(normalizeConstantText).join(' ')

  return text.includes('petit') ||
    text.includes('петит') ||
    text.includes('econom') ||
    text.includes('эконом') ||
    text === '1'
}

function getDefaultCityPetitCarClass(
  carClasses: Record<ICarClass['id'], ICarClass>,
  locationClasses: IBookingLocationClass[],
  defaultLocationClass: IBookingLocationClass['id'],
) {
  const cityLocationIds = new Set(locationClasses
    .filter(item => item.kind === EBookingLocationKinds.City)
    .map(item => item.id))
  if (!cityLocationIds.size && defaultLocationClass)
    cityLocationIds.add(defaultLocationClass)

  const classes = Object.values(carClasses)
  const cityClasses = classes.filter(carClass =>
    carClass.booking_location_classes === null ||
    carClass.booking_location_classes.some(id => cityLocationIds.has(id)),
  )
  const pool = cityClasses.length ? cityClasses : classes

  return (
    pool.find(isPetitCarClass) ??
    pool.find(item => String(item.id) === '1') ??
    pool[0]
  )?.id ?? Object.keys(carClasses)?.[0] ?? '-1'
}

class Currency {
  NAME: string
  SIGN: string

  constructor() {
    this.NAME = 'RUB'
    this.SIGN = '₽'
  }

  recalculated() {
    this.NAME = getConstantValue('currency_of_the_service', 'RUB')

    let _currency = this.getCurrency(this.NAME)
    this.SIGN = _currency ? _currency.abbr : '₽'
  }

  getCurrency(key: string) {
    const _data = (window as any).data

    return _data && _data[CURRENCIES_SECTION] && _data[CURRENCIES_SECTION][key] ? _data[CURRENCIES_SECTION][key] : null
  }
}

export const CURRENCY = new Currency()

export const getConstantValue = <T = any>(key: string | number, defaultValue: T, converter?: (value: any) => any) => {
  const _data = (window as any).data

  let value = (
    _data &&
    _data[SITE_CONSTANTS_SECTION] &&
    _data[SITE_CONSTANTS_SECTION][key] &&
    _data[SITE_CONSTANTS_SECTION][key].value
  ) || defaultValue

  if (converter) value = converter(value)
  return value
}

const SITE_CONSTANTS = new Constants()
export default SITE_CONSTANTS
export function getApiConstants(): {
  langs: {
    [key: string]: {
      iso: string,
      [key: string]: string
    }
  },
  [key: string]: any
  } {
  return (window as any).data
}
