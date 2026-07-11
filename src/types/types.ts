import { Moment } from 'moment'
import { ECourierAutoTypes } from '../components/passenger-order/delivery/CourierTransportTab'
import { EMoveTypes } from '../components/passenger-order/move/MoveTypeTabs'
import { IBigTruckService } from '../constants/bigTruckServices'
import { IDateTime } from '../tools/dateTime'

export type {
  IArea,
  IWay,
  IWaySegment,
  IWayNode,
  IWayTurnRestriction,
} from './way'

export enum EPointType {
  From,
  To
}

export enum ELogic {
  And,
  Or,
  Nothing
}

export enum ECurrency {
  GHS = 'GHS',
  ILS = 'ILS',
  MAD = 'MAD',
  RUB = 'RUB',
  USD = 'USD'
}

export interface ICity {
  id: string
  country: string
}

export interface ICarClass {
  id: string
  name?: string
  title?: string
  label?: string
  code?: string
  type?: string
  seats: number
  courier_call_rate: number
  courier_fare_per_1_km: number
  booking_location_classes: IBookingLocationClass['id'][] | null
}

export enum EBookingStates {
  Processing = 1,
  Approved,
  Canceled,
  Completed,
  PendingActivation,
  OfferedToDrivers
}

enum EContactClasses {
  Phone = 1,
  Facebook,
  ICQ,
  Skype,
  Viber,
  WhatsApp
}

export enum EBookingLocationKinds {
  City,
  Intercity,
  Location
}

export interface IBookingLocationClass {
  id: string
  kind: EBookingLocationKinds
}

export enum EBookingDriverState {
  Considering = 1,
  Canceled,
  Performer,
  Arrived,
  Started,
  Finished
}

export enum EServices {
  Normal = 1,
  Personal,
  Excursion,
  Companion,
  Voting
}

export enum EPaymentWays {
  Cash = 1,
  Credit,
  Paypal
}

enum ECancelStates {
  System = 1,
  Driver,
  Client
}

export interface IBookingAddresses {
  /** Адрес начальной точки поездки */
  b_start_address?: string,
  /** Адрес цели поездки */
  b_destination_address?: string,
}

export interface IBookingCoordinatesLatitude {
  /** Широта начальной точки поездки */
  b_start_latitude?: number,
  /** Широта цели поездки */
  b_destination_latitude?: number,
}

export interface IBookingCoordinatesLongitude {
  /** Долгота начальной точки поездки */
  b_start_longitude?: number,
  /** Долгота цели поездки */
  b_destination_longitude?: number,
}

export interface IBookingCoordinates extends IBookingCoordinatesLatitude, IBookingCoordinatesLongitude {
}

export interface ICarOptions {
  performers_price: number
  driver_offer?: IDriverOffer
  offer?: IDriverOffer
  offer_event?: string
  driver_offer_mode?: string
  driver_offer_price?: number | string
  driver_offer_eta?: string
  driver_offer_free_seats?: number | string
  driver_offer_comment?: string
  comment?: string
  driver_comment?: string
  eta?: string
  pickup_time?: string
  arrival_time?: string
  time?: string
  freeSeats?: number | string
  free_seats?: number | string
  seats?: number | string
  price?: number | string
}

export interface IDriverOffer {
  id?: string
  orderId?: string
  order_id?: string
  price?: number | string
  driver_price?: number | string
  performers_price?: number | string
  eta?: string
  pickup_time?: string
  arrival_time?: string
  time?: string
  freeSeats?: number | string
  free_seats?: number | string
  seats?: number | string
  comment?: string
  driver_comment?: string
  status?: string
  state?: string
  type?: string
  createdAt?: string | number
  created_at?: string | number
  datetime?: string | number
  date?: string | number
  expiresAt?: string | number
  expires_at?: string | number
  expired_at?: string | number
  expire_datetime?: string | number
}

export enum EDriverResponseModes {
  Performer = 0,
  Candidate = 1,
  ByOrder = 2
}

export enum EBookingCommentTypes {
  Any,
  Plane
}

export interface IBookingComment {
  id: string
  type: EBookingCommentTypes
  responseMode?: EDriverResponseModes
  internal?: boolean
}

export interface IDriver {
  /** Идентификатор водителя */
  u_id: string,
  u_name?: string,
  u_family?: string,
  u_middle?: string,
  user?: Partial<IUser>,
  /** Идентификатор машины */
  c_id: string,
  /** На месте ли машина */
  c_arrive_state: boolean,
  /** Идентификатор статуса водителя, data.booking_driver_states */
  c_state: EBookingDriverState,
  /** Широта водителя */
  c_latitude?: number,
  /** Долгота водителя */
  c_longitude?: number,
  /** Дата получения координат */
  l_datetime?: Moment,
  /** идентификатор способа оплаты */
  c_payment_way?: EPaymentWays,
  /** идентификатор платежной карты */
  c_payment_card?: string,
  /** сумма оплаты водителем за сервис сайта */
  c_payment_sum?: number
  /** дата оплаты */
  c_payment_datetime?: Moment,
  /** причина отмены поездки водителем */
  c_cancel_reason?: string,
  /** оценка поездки */
  c_rating?: string,
  /** дата подачи заявки на исполнение */
  c_becomed_candidate?: Moment,
  /** дата отмены исполнения */
  c_canceled?: Moment,
  /** дата прибытия машины */
  c_arrived?: Moment,
  /** Дата получения координат */
  c_started?: Moment,
  /** дата начала поездки */
  c_completed?: Moment,
  /** дата завершения поезки */
  c_tips?: number
  c_options?: ICarOptions
}

export interface IOptions {
  submitPrice?: string;
  fromShortAddress?: string
  toShortAddress?: string
  courier_auto?: string | ECourierAutoTypes
  from_porch?: string
  from_floor?: string
  from_room?: string
  from_way?: string
  from_mission?: string
  from_tel?: string | null
  from_day?: string
  from_time_from?: string | null
  from_time_to?: string | null
  to_porch?: string
  to_floor?: string
  to_room?: string
  to_way?: string
  to_mission?: string
  to_tel?: string | null
  to_day?: string
  to_time_from?: string | null
  to_time_to?: string | null
  object?: string
  weight?: string
  is_big_size?: boolean
  cost?: number
  is_loading_needs?: boolean
  customer_price?: number
  moveType?: EMoveTypes
  steps?: string
  elevator?: IElevatorState
  furniture?: IFurniture['house'] | IFurniture['room']
  time_is_not_important?: boolean
  fromDateTimeInterval?: IDateTime
  tillDateTimeInterval?: IDateTime
  bigTruckCargo?: string
  size?: number
  bigTruckCargoWeight?: number
  carsCount?: number
  bigTruckCarTypes?: string[]
  bigTruckCarLogic?: ELogic
  bigTruckServices?: IBigTruckService['id'][],
  createdBy?: string,
  pricingModel?: {
    price: number,
    formula: string,
    options: {
        [key: string]: any
    },
    calculationType?: string
  }
}

export enum EOrderProfitRank {
  Low,
  Medium,
  High,
}

export interface IOrderEstimation {
  /** Absolute driver profit in current currency. */
  profit?: number,
  /** Visual rank for cards. */
  profitRank?: EOrderProfitRank,
  /** Empty mileage from current driver position to pickup, km. */
  emptyMileageKm?: number,
  /** Mileage from pickup to destination, km. */
  routeMileageKm?: number,
  /** Relative profit for each empty-kilometer before pickup. */
  profitPerEmptyKm?: number,
  /** Stable value for sorting, prefers relative profit when available. */
  profitSortValue?: number,
}

export interface IOrder
  extends IBookingCoordinates, IBookingAddresses, IOrderEstimation {
  /** Идентификатор поездки */
  b_id: string
  /** Идентификатор клиента */
  u_id: string
  /** Дата прибытия такси */
  b_start_datetime: Moment
  /** Комментарии, отсутствующие в справочнике */
  b_custom_comment?: string
  /** Номер рейса */
  b_flight_number?: string
  /** Терминал */
  b_terminal?: string
  /** Число пассажиров */
  b_passengers_count: number
  /** Число чемоданов */
  b_luggage_count?: number
  /** Текст на табличке */
  b_placard?: string
  /** Идентификатор класса машины */
  b_car_class: string
  /** Идентификатор статуса поезки */
  b_state: EBookingStates
  /** Дата создания поездки */
  b_created: Moment
  /** Подтверждена ли поездка */
  b_confirm_state: boolean
  /** Число машин */
  b_cars_count: number
  /** Дата одобрения поездки */
  b_approved?: Moment
  /** Максимальное время ожидания машины в секундах */
  b_max_waiting?: number
  /** Оценочное время ожидания машины в секундах */
  b_estimate_waiting?: number
  /** Код поездки, известный клиенту для поездок 'Вызов на дороге'(только для клиента) */
  b_driver_code?: string
  /** Дополнительные параметры */
  b_options?: IOptions
  /** Контакты для связи */
  b_contact: EContactClasses[]
  /** Идентификатор типа дальности поездки */
  b_location_class: string
  /** Оценочное расстояние маршрута в метрах */
  b_distance_estimate?: number
  /** Оценочная цена маршрута */
  b_price_estimate?: number
  /** Валюта поездки */
  b_currency: ECurrency
  /** Водители */
  drivers?: IDriver[]
  /** Идентификаторы комментариев к поездкам(data.booking_comments) */
  b_comments?: string[]
  /** Идентификаторы услуг при перевозке */
  b_services: EServices[] | null
  /** Идентификатор способа оплаты */
  b_payment_way?: EPaymentWays
  /** Идентификатор платежной карты */
  b_payment_card?: string
  /** Чаевые, указанные клиентом в процентах, число от 0 до 10 */
  b_tips?: number
  /** Оценка поездки */
  b_rating: number
  /** Максимальная дата подтверждения */
  b_confirmation_limit?: Moment
  /** Дата подтверждения */
  b_confirmation_datetime?: Moment
  /** Сумма оплаты клиентом за сервис сайта */
  b_payment_sum?: number
  /** Дата оплаты */
  b_payment_datetime?: Moment
  /** Причина отмены поездки клиентом */
  b_cancel_reason?: string
  /** Пользователи с идентификаторами статусов отмены поездки */
  b_cancel_states?: {
    [key: string]: ECancelStates[]
  }
  /** Дата отмены поездки */
  b_canceled?: Moment
  /** Дата завершения поездки */
  b_completed?: Moment
  b_max_waiting_list?: {
    [key: string]: {
      /** Интервал времени в секундах */
      additional: string,
      /** Дата добавления */
      created: Moment
    }
  }
  b_attempts?: Array<{
    /** Идентификатор водителя */
    u_id: string,
    /** Дата добавления */
    datetime: Moment
  }>
  /** Является ли поездка голосованием */
  b_voting?: boolean
  /** Остаток жизни voting-заказа в секундах */
  remaining_lifetime_seconds?: number
  /** Дата предложения поездки клиентом поездки */
  b_offer_datetime: Moment
  /** Дата приема поездки на исполнение */
  b_select_datetime: Moment,
  user?: IUser
}

export interface ITrip {
  t_id?: number
  /** Идентификатор водителя */
  u_id?: IUser['u_id']
  t_start_address: string
  t_start_latitude: number
  t_start_longitude: number
  t_destination_address: string
  t_destination_latitude: number
  t_destination_longitude: number
  /** Максимальный возможный сдвиг начала рейса в секундах */
  t_start_datetime_interval?: number
  t_start_datetime: Moment
  t_complete_datetime: Moment
  t_start_real_datetime?: Moment
  t_complete_real_datetime?: Moment
  t_edit_datetime?: Moment
  /** Идентификатор пользователя, изменившего рейс */
  e_u_id?: IUser['u_id']
  t_create_datetime?: Moment
  /** Идентификатор пользователя, создавшего рейс */
  c_u_id?: IUser['u_id']
  t_looking_for_clients?: boolean
  t_canceled?: boolean
  t_options: { [key: string]: any }
  orders: IOrder[]
}

export enum EOrderTypes {
  Active,
  Ready,
  History
}

export interface IPlaceResponse {
  place_id: string,
  licence: string,
  osm_type: string,
  osm_id: string,
  boundingbox: string[],
  lat: string,
  lon: string,
  display_name: string,
  class?: string,
  type?: string,
  importance?: number,
  icon?: string,
  address: IAddressDetails,
  extratags?: {
    capital?: 'yes' | 'no',
    website?: string,
    wikidata?: string,
    wikipedia?: string,
    population?: string
  }
}

export interface IAddressDetails {
  continent?: string,
  country?: string,
  country_code?: string,
  region?: string,
  state?: string,
  state_district?: string,
  county?: string,
  municipality?: string,
  city?: string,
  town?: string,
  village?: string,
  city_district?: string,
  district?: string,
  borough?: string,
  suburb?: string,
  subdivision?: string,
  hamlet?: string,
  croft?: string,
  isolated_dwelling?: string,
  neighbourhood?: string,
  allotments?: string,
  quarter?: string,
  city_block?: string,
  residental?: string,
  farm?: string,
  farmyard?: string,
  industrial?: string,
  commercial?: string,
  retail?: string,
  road?: string,
  house_number?: string,
  house_name?: string,
  emergency?: string,
  historic?: string,
  military?: string,
  natural?: string,
  landuse?: string,
  place?: string,
  railway?: string,
  man_made?: string,
  aerialway?: string,
  boundary?: string,
  amenity?: string,
  aeroway?: string,
  club?: string,
  craft?: string,
  leisure?: string,
  office?: string,
  mountain_pass?: string,
  shop?: string,
  tourism?: string,
  bridge?: string,
  tunnel?: string,
  waterway?: string,
}

export interface ICar {
  /** Идентификатор машины */
  c_id: string,
  /** Идентификатор модели машины(data.car_models) */
  cm_id: string,
  /** Список идентификаторов пользователей через запятую */
  u_id: string,
  /** Идентификатор пользователя за рулем */
  u_d_id: string
  /** Число мест в машине */
  seats: number,
  /** Автомобильный номер */
  registration_plate: string,
  /** Идентификатор цвета машины(data.car_colors) */
  color: string,
  /** Ссылка на фото */
  photo: string,
  /** json данные для дальнейшей обработки */
  details?: any,
  /** Идентификатор класса машины */
  cc_id: ICarClass['id']
}

export enum EUserRoles {
  Client = 1,
  Driver,
  Administrator,
  Agent
}

export enum EWorkTypes {
  Self,
  Company
}

export enum EUserCheckStates {
  Required = 1,
  Active,
  Rejected,
  Blocked
}

export interface IReply {
  id: string
  date: Moment
  customerName: string
  payment: number
  content: string
}

export interface IUser {
  /** Идентификатор пользователя */
  u_id: string
  /** Имя пользователя */
  u_name: string
  /** Фамилия пользователя */
  u_family: string
  /** Отчество пользователя */
  u_middle?: string
  /** Емейл пользователя */
  u_email: string
  /** Телефон пользователя */
  u_phone?: string
  /** Идентификатор роли пользователя */
  u_role: EUserRoles
  /** Идентификатор верификации пользователя */
  u_check_state: EUserCheckStates
  u_ban: {
    /** Число активных банов на авторизацию */
    auth?: number
    /** Число активных банов на создание или получения поездки */
    order?: number
    /** Число активных банов на создание темы в блоге */
    blog_topic?: number
    /** Число активных банов на создание сообщения в чужой теме */
    blog_post?: number
  }
  /** Активен ли пользователь */
  u_active: boolean
  /** Ссылка на фото */
  u_photo?: string
  /** День рождения пользователя в виде год-месяц-день */
  u_birthday?: Moment
  /** Проверен ли номер телефона */
  u_phone_checked: boolean
  /** Идентификатор языка, выбранного пользователем(data.langs) */
  u_lang?: string
  /** iso4217 код валюты, выбранной пользователем */
  u_currency?: ECurrency
  /** Идентификатор города пользователя(data.cities) */
  u_city?: string
  /** Чаевые пользователя по умолчанию */
  u_tips: number
  /** Знание иностранных языков */
  u_lang_skills?: string
  /** Пользователь о себе */
  u_description?: string
  /** Идентификатор навигации, выбранной пользователем(data.gps_softwares) */
  u_gps_software?: string
  /** Выполняет ли поездку вне сервиса */
  out_drive?: boolean
  /** Адрес цели поездки вне сервиса */
  out_address?: string
  /** Широта цели поездки вне сервиса */
  out_latitude?: number
  /** Долгота цели поездки вне сервиса */
  out_longitude?: number
  /** Оценочная дата завершения поездки вне сервиса */
  out_est_datetime?: Moment
  /** Адрес начала поездки вне сервиса */
  out_s_address?: string
  /** Широта начала поездки вне сервиса */
  out_s_latitude?: number
  /** Долгота начала поездки вне сервиса */
  out_s_longitude?: number
  /** Число пассажиров в поездке вне сервиса */
  out_passengers?: number
  /** Число чемоданов в поездке вне сервиса */
  out_luggage?: number
  u_details?: {
    city?: string
    /** Самозанятый / Компания */
    work_type?: EWorkTypes
    /** Улица */
    street?: string
    /** Штат */
    state?: string
    /** ZIP код */
    zip?: string
    /** Номер карты */
    card?: string
    passport_photo?: number[]
    driver_license_photo?: number[]
    license_photo?: number[],
    subscribe?: boolean,
    carMark?: string,
    carModel?: string,
  }
  //
  u_registration: Moment
  u_replies?: IReply[]
  u_choosen?: number
  ref_code?: string
  role: EUserRoles
  token?: string
  u_hash?: string
  uploads?: any[]
}

export interface ITokens {
  token: string,
  u_hash: string
}

export interface IStaticMarker {
  latitude: number,
  longitude: number,
  popup?: string,
  tooltip?: string
}

export interface IAddressPoint {
  address?: string,
  date?: string,
  time?: string
  shortAddress?: string,
  latitude?: number,
  longitude?: number
  isAddressResolving?: boolean
  resolveAddress?: boolean
}

export interface ILoadedAddressPoint extends IAddressPoint {
  address: string
  latitude: number
  longitude: number
  details: IAddressDetails
}

export enum EStatuses {
  Default,
  Loading,
  Success,
  Fail,
  Whatsapp,
  Warning,
}

export interface IRouteInfo {
  /** KM */
  distance: number,
  /** Summary */
  time: {
    hours: number,
    minutes: number
  },
  /** Latitude, longitude */
  points: Array<[number, number]>
}

export enum ESuggestionType {
  PointUserTop,
  PointUnofficial,
  PointOfficial
}

export interface ISuggestion {
  type?: ESuggestionType,
  point?: IAddressPoint
  /** Метры */
  distance?: number,
}

export enum EColorTypes {
  Default,
  Accent
}

export type TAvailableModes = { [key: string]: { subs?: string[] } }
export type TMoneyModes = { [key: string]: boolean | { [key: string]: boolean } }

export type TEntries = { key: string, value: string }[]

export interface ILanguage {
  id: number
  iso: string
  logo: string
  native: string

  [language: string]: string | number
}

export interface IRoom {
  id: number
  label: string
}

export enum EFileType {
  Image,
  Video
}

export interface IFile {
  type: EFileType,
  src: string
}

export type TRoomFurniture = { [id: number]: number }

export interface IFurniture {
  house: {
    [roomID: string]: TRoomFurniture
  }
  room: TRoomFurniture
}

export type TColor = string

export interface IPaletteColor {
  main: TColor
  light: TColor
  dark: TColor
}

export type TMoveFiles = { [id: number]: IFile[] }

export type TElevatorState = { [id: string]: number }

export interface IElevatorState {
  elevator?: boolean
  steps: TElevatorState
}

export type TBlockObject = { [key: string]: any }

export interface IRegisterResponse {
  u_id: number,
  string: string,
  token?: string,
  u_hash?: string
}

export type IFileUpload = {
  base64: string,
  name?: string,
  u_id?: string,
  private?: 0 | 1
}


export type TFilesMap = {
  passport_photo: any
  driver_license_photo: any
  license_photo: any
}

export interface IRequiredFields {
  [key: string]: boolean
}

export interface IProfitEstimationFactors {
  fuel_cost: number
  rate: number
  base_fare: number
  min_fare: number
}

export interface IProfitEstimationTimeModification
  extends Partial<IProfitEstimationFactors> {
  start: Moment
  end: Moment
}

export interface IProfitEstimationConfig extends IProfitEstimationFactors {
  time_modifications: IProfitEstimationTimeModification[]
}
