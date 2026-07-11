import axios from 'axios'
import { Stringify } from '../types'
import { objectFromEntries } from '../tools/compat'
import {
  EServices,
  EBookingDriverState,
  EOrderTypes,
  EPaymentWays,
  IBookingAddresses,
  IBookingCoordinates,
  IOrder,
  IUser,
} from '../types/types'
import { IResponse } from '../types/api'
import { cloneFormData } from '../tools/utils'
import { convertOrder, reverseConvertOrder } from '../tools/convert'
import {
  addToFormData, apiMethod, IApiMethodArguments, IResponseFields,
} from '../tools/api'
import Config from '../config'
import SITE_CONSTANTS from '../siteConstants'
import { t, TRANSLATION } from '../localization'
import { getDriverDoorNumber, normalizeDriverDoorNumber } from '../tools/driverDoorNumber'
import store from '../state'
import { userSelectors } from '../state/user'
import { EBookingActions } from './constants'
import { getUserCar } from './car'
import {
  isAnyBrowserEmulatorOrder,
  isBrowserEmulatorRunning,
  saveBrowserEmulatorOrderId,
} from '../tools/emulatorMode'
import { setPassengerConfirmedChoice } from '../tools/driverOffer'

function normalizeId(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  return String(value).trim()
}

function normalizeTestUserIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]

  return values.reduce<string[]>((result, item) => {
    String(item ?? '')
      .split(/[,\s;|]+/g)
      .map(normalizeId)
      .filter(Boolean)
      .forEach(id => result.push(id))
    return result
  }, [])
}

function getConfiguredTestUserIds() {
  const data = (window as any).data || {}
  const siteConstants = data.site_constants || {}

  return normalizeTestUserIds([
    SITE_CONSTANTS.TEST_USER_ID,
    ...(SITE_CONSTANTS.TEST_USER_IDS || []),
    siteConstants.test_user_id?.value,
    siteConstants.test_user_ids?.value,
    data.test_user_id,
    data.test_user_ids,
  ])
}


function hasBackendText(error: any, needle: string) {
  const lowerNeedle = needle.toLowerCase()
  const parts = [
    error?.message,
    error?.error,
    error?.reason,
    error?.data?.message,
    error?.data?.error,
    error?.response?.data?.message,
    error?.response?.data?.error,
  ]

  return parts.some(part => String(part || '').toLowerCase().includes(lowerNeedle))
}

function isBOptionsArrayShapeError(error: any) {
  return hasBackendText(error, 'b_options element not array')
}

function isBOptionsBackendError(error: any) {
  return isBOptionsArrayShapeError(error) ||
    hasBackendText(error, 'wrong b_options keys') ||
    hasBackendText(error, 'b_options')
}

function toBackendBOptionsArrayValues(options: any) {
  if (!options || typeof options !== 'object')
    return options

  return Object.keys(options).reduce((acc, key) => {
    const value = options[key]
    if (value === undefined || value === null || value === '')
      return acc

    acc[key] = Array.isArray(value) ? value : [value]
    return acc
  }, {} as Record<string, unknown[]>)
}

function withConvertedBOptionsMode(converted: any, mode: 'normal' | 'array-values' | 'omit') {
  const next = { ...converted }

  if (mode === 'omit') {
    delete next.b_options
    return next
  }

  if (mode === 'array-values' && next.b_options)
    next.b_options = toBackendBOptionsArrayValues(next.b_options)

  return next
}

function makeDrivePostParams(formData: FormData, converted: any, mode: 'normal' | 'array-values' | 'omit' = 'normal') {
  const requestConverted = withConvertedBOptionsMode(converted, mode)
  const params = cloneFormData(formData)
  addToFormData(params, {
    data: JSON.stringify(objectFromEntries(
      [
        'b_start_address',
        'b_start_latitude',
        'b_start_longitude',
        'b_destination_address',
        'b_destination_latitude',
        'b_destination_longitude',
        'b_start_datetime',
        'b_custom_comment',
        'b_flight_number',
        'b_terminal',
        'b_passengers_count',
        'b_luggage_count',
        'b_placard',
        'b_car_class',
        'b_payment_way',
        'b_payment_card',
        'b_cars_count',
        'b_max_waiting',
        'b_options',
        'b_contact',
        'b_comments',
        'b_services',
        'b_location_class',
        'b_currency',
      ].filter(key => key in requestConverted).map(key => [key, requestConverted[key]]),
    )),
  })

  return params
}


function isBackendTestOrder(order: any, ownerUser?: any) {
  if (isAnyBrowserEmulatorOrder(order))
    return true

  const testUserIds = getConfiguredTestUserIds()
  if (!testUserIds.length)
    return false

  const orderUserId = normalizeId(order?.u_id ?? order?.user_id ?? ownerUser?.u_id)
  const referrerId = normalizeId(
    ownerUser?.referrer_id ??
    ownerUser?.u_referrer_id ??
    order?.referrer_id ??
    order?.u_referrer_id,
  )
  const directTestUserId = normalizeId(
    ownerUser?.test_user_id ??
    order?.test_user_id ??
    order?.b_test_user_id,
  )

  return [orderUserId, referrerId, directTestUserId].some(id => testUserIds.includes(id))
}

async function _postDrive(
  { formData }: IApiMethodArguments,
  data: IOrder,
): Promise<IResponseFields & {
  b_id: IOrder['b_id'],
  b_driver_code: IOrder['b_driver_code']
}> {
  const defaults: Partial<IOrder> = {
    b_payment_way: EPaymentWays.Cash,
  }

  const emulatorTarget = isBrowserEmulatorRunning('drivers')
  const orderData: IOrder = {
    ...defaults,
    ...data,
    // В режиме эмулятора заказ остаётся обычным для backend,
    // а принадлежность к песочнице храним только локально по b_id.
    // Так служебные ключи не попадают в b_options/c_options и не видны в интерфейсе.
    b_options: data.b_options,
    b_services: data.b_voting && !data.b_services?.includes(EServices.Voting) ?
      [...(data.b_services ?? []), EServices.Voting] :
      data.b_services,
  }

  const converted = reverseConvertOrder(orderData)

  const postDriveWithMode = async(mode: 'normal' | 'array-values' | 'omit' = 'normal') => {
    const response = await axios.post(`${Config.API_URL}/drive`, makeDrivePostParams(formData, converted, mode))
    if (response.data.status === 'error')
      throw response.data
    return response
  }

  let response
  try {
    response = await postDriveWithMode('normal')
  } catch (error) {
    if (!isBOptionsArrayShapeError(error))
      throw error

    try {
      response = await postDriveWithMode('array-values')
    } catch (arrayError) {
      if (!isBOptionsBackendError(arrayError))
        throw arrayError

      response = await postDriveWithMode('omit')
    }
  }

  const result = response.data.data
  result.b_id = result.b_id.toString()

  if (emulatorTarget)
    saveBrowserEmulatorOrderId('drivers', result.b_id)

  if (data.b_voting) {
    const params = cloneFormData(formData)
    addToFormData(params, {
      action: EBookingActions.SetConfirmState,
    })
    try {
      await axios.post(`${Config.API_URL}/drive/get/${result.b_id}`, params)
    } catch (error) {
      console.error(error)
    }
  }

  return result
}
export const postDrive = apiMethod<typeof _postDrive>(_postDrive)

const _cancelDrive = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  reason?: IOrder['b_cancel_reason'],
) => {
  addToFormData(formData, {
    action: EBookingActions.SetCancelState,
    reason,
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
}
export const cancelDrive = apiMethod<typeof _cancelDrive>(_cancelDrive)

export const getOrders: <TType extends EOrderTypes>(
  type?: TType,
  filter?: TType extends EOrderTypes.Ready ? {
    carClasses?: boolean
    locationClasses?: boolean
  } : undefined
) => Promise<IResponse<'200', {
  booking: IOrder[]
}> | IResponse<'404', {
  detail?: 'used_car_not_found'
}>> = apiMethod(async(
  { formData }: IApiMethodArguments,
  type: EOrderTypes = EOrderTypes.Active,
  filter: {
    carClasses?: boolean
    locationClasses?: boolean
  } = {},
) => {
  const userID = userSelectors.user(store.getState())?.u_id

  addToFormData(formData, {
    array_type: 'list',
  })

  const hiddenOrders = JSON.parse(localStorage.getItem('hiddenOrders') || '{}')
  const userHiddenOrders = hiddenOrders && userID && hiddenOrders[userID]

  const queryParams: string[] = []
  let URLAdditionalPath = ''
  switch (type) {
    case EOrderTypes.Active:
      queryParams.push('fields=00000000u1')
      break
    case EOrderTypes.Ready:
      URLAdditionalPath = '/now'
      break
    case EOrderTypes.History:
      URLAdditionalPath = '/archive'
      break
    default:
      return Promise.reject()
  }
  if (filter.carClasses)
    queryParams.push('filter=b_car_classes')
  if (filter.locationClasses)
    queryParams.push('filter=b_location_classes')
  if (
    getConfiguredTestUserIds().length &&
    !isBrowserEmulatorRunning('drivers') &&
    !isBrowserEmulatorRunning('clients')
  )
    queryParams.push('filter=test_user_id')

  const { data: response } = await axios.post(
    `${Config.API_URL}/drive${URLAdditionalPath}` +
    (queryParams.length > 0 ? `?${queryParams.join('&')}` : ''),
    formData,
  )
  if (response.code === '404' && [
    'used car not found',
    'empty driver location classes',
  ].includes(response.message))
    return { ...response, data: { detail: 'used_car_not_found' } }
  if (response.code !== '200')
    return response

  if (type === EOrderTypes.Active)
    for (const item of response.data.booking)
      item.user = response.data.user[item.u_id]

  return {
    ...response,
    data: {
      ...response.data,
      booking: response.data.booking
        ?.filter((item: IOrder) =>
          !(userHiddenOrders && userHiddenOrders.includes(item.b_id)),
        )
        .filter((item: any) =>
          isBrowserEmulatorRunning('drivers') ||
          isBrowserEmulatorRunning('clients') ||
          !isBackendTestOrder(item, response.data.user?.[item.u_id]),
        )
        .map((item: any) => convertOrder(item))
        .filter((item: IOrder) => item.b_confirm_state)
        .sort((a: IOrder, b: IOrder) =>
          a.b_start_datetime < b.b_start_datetime ? 1 : -1,
        ),
    },
  }
})

const _getOrder = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
): Promise<IOrder | null> => {
  return axios.post(`${Config.API_URL}/drive/get/${id}?fields=00000000u1`, formData)
    .then(res => res.data.data)
    .then(res => (res.booking && res.booking[id] && convertOrder(res.booking[id])) || null)
}
export const getOrder = apiMethod<typeof _getOrder>(_getOrder)

const _editOrder = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  data: IBookingAddresses & Stringify<IBookingCoordinates>,
): Promise<IResponseFields> => {
  addToFormData(formData, {
    action: EBookingActions.Edit,
    data: JSON.stringify(data),
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
}
export const editOrder = apiMethod<typeof _editOrder>(_editOrder)


const CUSTOMER_PRICE_EDIT_KEYS = [
  'b_start_address',
  'b_start_latitude',
  'b_start_longitude',
  'b_destination_address',
  'b_destination_latitude',
  'b_destination_longitude',
  'b_start_datetime',
  'b_custom_comment',
  'b_flight_number',
  'b_terminal',
  'b_passengers_count',
  'b_luggage_count',
  'b_placard',
  'b_car_class',
  'b_payment_way',
  'b_payment_card',
  'b_cars_count',
  'b_max_waiting',
  'b_options',
  'b_contact',
  'b_comments',
  'b_services',
  'b_location_class',
  'b_currency',
]

function normalizeCustomerPrice(value: number | string) {
  const numberValue = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : 0
}

const _updateOrderCustomerPrice = (
  { formData }: IApiMethodArguments,
  order: IOrder,
  price: number | string,
): Promise<IResponseFields> => {
  const nextOrder = {
    ...order,
    b_options: {
      ...(order.b_options || {}),
      customer_price: normalizeCustomerPrice(price),
    },
  }
  const converted = reverseConvertOrder(nextOrder as IOrder)
  if (converted.b_options)
    converted.b_options = toBackendBOptionsArrayValues(converted.b_options)
  const data = objectFromEntries(
    CUSTOMER_PRICE_EDIT_KEYS
      .filter(key => converted[key] !== undefined)
      .map(key => [key, converted[key]]),
  )

  addToFormData(formData, {
    action: EBookingActions.Edit,
    data: JSON.stringify(data),
  })

  return axios.post(`${Config.API_URL}/drive/get/${order.b_id}`, formData)
    .then(res => res.data)
    .then(res => res.status === 'error' ? Promise.reject(res) : res)
}
export const updateOrderCustomerPrice = apiMethod<typeof _updateOrderCustomerPrice>(_updateOrderCustomerPrice)

const _takeOrder = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  options: {
    votingNumber?: string | number
    performers_price: number
  },
  candidate?: boolean,
): Promise<{
  /** Индекс водителя */
  c_index: string,
  /** Текущее число машин поездки с booking_driver_states=3,4,5,6 */
  current_cars_count: string,
  /** Необходимое число машин поездки */
  b_cars_count: string,
  /** Если изменился статус поезки */
  b_state?: '1->2' | null
}> => {
  const userID = userSelectors.user(store.getState())?.u_id
  if (!userID)
    return Promise.reject({ message: t(TRANSLATION.WRONG_USER_ROLE) })

  return getUserCar(userID as string)
    .then(car => {
      if (!car) return Promise.reject({ message: t(TRANSLATION.NOT_LINKED_CAR), error: 'used_car_not_found' })

      const driverDoorNumber = normalizeDriverDoorNumber(options.votingNumber) ||
        getDriverDoorNumber({ c_id: car.c_id }, car)

      addToFormData(formData, {
        action: EBookingActions.SetPerformer,
        performer: candidate ? '0' : '1',
        b_driver_code: driverDoorNumber,
        data: JSON.stringify({
          c_id: car.c_id,
          c_payment_way: EPaymentWays.Cash,
          c_options: { performers_price: options.performers_price },
        }),
      })

      return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
        .then(res => res.data)
        .then(res => res.status === 'error' ? Promise.reject(res) : res)
    })
}
export const takeOrder = apiMethod<typeof _takeOrder>(_takeOrder)


type TDriverOfferPayload = {
  price?: number
  eta?: string
  freeSeats?: number
  comment?: string
}

const DRIVER_OFFER_MODE = 'OFFER'

function cleanDriverOfferComment(comment?: string) {
  return typeof comment === 'string' ? comment.trim() : ''
}

function cleanDriverOfferOptions(options: Record<string, unknown>) {
  const cleaned: Record<string, unknown> = {}

  Object.keys(options).forEach(key => {
    const value = options[key]
    if (value === undefined || value === null || value === '')
      return

    cleaned[key] = value
  })

  return cleaned
}

function buildSafePerformerOptions(price?: number) {
  return cleanDriverOfferOptions({ performers_price: price })
}

function buildDriverOfferOptions(offer: TDriverOfferPayload) {
  // gruzvill backend accepts performers_price reliably. Extra keys like
  // driver_offer_eta/driver_offer_comment may return wrong c_options keys.
  return cleanDriverOfferOptions({ performers_price: offer.price })
}

function buildVotingCandidateOptions(performersPrice?: number, eta?: string) {
  // gruzvill-safe voting candidate: price is enough to show the driver offer.
  return cleanDriverOfferOptions({ performers_price: performersPrice })
}

function getWrongCOptionsKeys(error: any) {
  const parts = [
    error?.message,
    error?.error,
    error?.reason,
    error?.data?.message,
    error?.response?.data?.message,
    error?.response?.data?.error,
  ]

  return parts.some(part => String(part || '').toLowerCase().includes('wrong c_options keys'))
}

function buildDriverOfferPerformerData(carID: string, offer: TDriverOfferPayload, safeOnly = false) {
  const comment = cleanDriverOfferComment(offer.comment)
  const cOptions = safeOnly ? buildSafePerformerOptions(offer.price) : buildDriverOfferOptions(offer)

  // The passenger UI reads driver_offer_eta / driver_offer_comment from c_options.
  // These keys must be allowed in backend c_options_valid_keys for the active config.
  return cleanDriverOfferOptions({
    c_id: carID,
    c_payment_way: EPaymentWays.Cash,
    c_options: cOptions,
    driver_offer_price: offer.price,
    c_pickup_time: offer.eta,
    c_arrival_time: offer.eta,
    c_comment: comment,
  })
}

function buildVotingCandidateData(carID: string, performersPrice?: number, eta?: string, safeOnly = false) {
  return cleanDriverOfferOptions({
    c_id: carID,
    c_payment_way: EPaymentWays.Cash,
    c_options: safeOnly ? buildSafePerformerOptions(performersPrice) : buildVotingCandidateOptions(performersPrice, eta),
    c_pickup_time: eta,
    c_arrival_time: eta,
  })
}

const _sendOrderOffer = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  offer: TDriverOfferPayload,
) => {
  const userID = userSelectors.user(store.getState())?.u_id
  if (!userID)
    return Promise.reject({ message: t(TRANSLATION.WRONG_USER_ROLE) })

  return getUserCar(userID as string)
    .then(car => {
      if (!car) return Promise.reject({ message: t(TRANSLATION.NOT_LINKED_CAR), error: 'used_car_not_found' })

      const postOffer = (safeOnly = false) => {
        const requestFormData = cloneFormData(formData)
        addToFormData(requestFormData, {
          action: EBookingActions.SetPerformer,
          performer: '0',
          c_pickup_time: offer.eta,
          c_arrival_time: offer.eta,
          c_comment: cleanDriverOfferComment(offer.comment),
          data: JSON.stringify(buildDriverOfferPerformerData(car.c_id, offer, safeOnly)),
        })

        return axios.post(`${Config.API_URL}/drive/get/${id}`, requestFormData)
          .then(res => res.data)
          .then(res => res.status === 'error' ? Promise.reject(res) : res)
      }

      return postOffer(false)
    })
}
export const sendOrderOffer = apiMethod<typeof _sendOrderOffer>(_sendOrderOffer)

const _participateVotingOrder = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  performersPrice?: number,
  eta?: string,
) => {
  const userID = userSelectors.user(store.getState())?.u_id
  if (!userID)
    return Promise.reject({ message: t(TRANSLATION.WRONG_USER_ROLE) })

  return getUserCar(userID as string)
    .then(car => {
      if (!car) return Promise.reject({ message: t(TRANSLATION.NOT_LINKED_CAR), error: 'used_car_not_found' })

      const postVoting = (safeOnly = false) => {
        const requestFormData = cloneFormData(formData)
        addToFormData(requestFormData, {
          action: EBookingActions.SetPerformer,
          performer: '0',
          c_pickup_time: eta,
          c_arrival_time: eta,
          data: JSON.stringify(buildVotingCandidateData(car.c_id, performersPrice, eta, safeOnly)),
        })

        return axios.post(`${Config.API_URL}/drive/get/${id}`, requestFormData)
          .then(res => res.data)
          .then(res => res.status === 'error' ? Promise.reject(res) : res)
      }

      return postVoting(false)
    })
}
export const participateVotingOrder = apiMethod<typeof _participateVotingOrder>(_participateVotingOrder)

const _cancelVotingParticipation = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
) => {
  addToFormData(formData, {
    action: EBookingActions.SetCancelState,
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
    .then(res => res.status === 'error' ? Promise.reject(res) : res)
}
export const cancelVotingParticipation = apiMethod<typeof _cancelVotingParticipation>(_cancelVotingParticipation)

export const arrivedVotingOrder = async(id: IOrder['b_id']) => ({
  code: '200' as const,
  data: { id },
})

export const confirmVotingCode = async(
  id: IOrder['b_id'],
  code: number | string,
) => ({
  code: '200' as const,
  data: { id, code },
})


function notifyLocalDriverEmulatorChoice(orderId: IOrder['b_id'], userId?: IUser['u_id']) {
  if (!orderId || !userId || typeof window === 'undefined')
    return

  // Browser-only hook for the embedded emulator. No localhost/server is needed on Vercel.
  window.dispatchEvent(new CustomEvent('driver-emulator-choice', {
    detail: { orderId: String(orderId), userId: String(userId) },
  }))
}

const _chooseCandidate = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  user?: IUser['u_id'],
): Promise<any> => {
  const userID = userSelectors.user(store.getState())?.u_id
  if (!userID) return Promise.reject({ message: t(TRANSLATION.WRONG_USER_ROLE) })

  addToFormData(formData, {
    action: EBookingActions.SetPerformer,
    performer: '1',
    u_id: user,
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
    .then(res => res.status === 'error' ? Promise.reject(res) : res)
    .then(res => {
      setPassengerConfirmedChoice(id, user)
      notifyLocalDriverEmulatorChoice(id, user)
      return res
    })
}
export const chooseCandidate = apiMethod<typeof _chooseCandidate>(_chooseCandidate)

const _releaseCandidateChoice = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  user?: IUser['u_id'],
): Promise<any> => {
  const userID = userSelectors.user(store.getState())?.u_id
  if (!userID) return Promise.reject({ message: t(TRANSLATION.WRONG_USER_ROLE) })

  addToFormData(formData, {
    action: EBookingActions.SetPerformer,
    performer: '0',
    u_id: user,
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
    .then(res => res.status === 'error' ? Promise.reject(res) : res)
}
export const releaseCandidateChoice = apiMethod<typeof _releaseCandidateChoice>(_releaseCandidateChoice)

const _setOrderState = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  state: EBookingDriverState,
  driverCode?: number | string,
) => {
  let action
  switch (state) {
    case EBookingDriverState.Arrived:
      action = EBookingActions.SetArriveState
      break
    case EBookingDriverState.Started:
      action = EBookingActions.SetStartState
      break
    case EBookingDriverState.Finished:
      action = EBookingActions.SetCompleteState
      break
    default:
      return Promise.reject()
  }

  addToFormData(formData, {
    action,
    ...(state === EBookingDriverState.Started && driverCode !== undefined ? {
      b_driver_code: driverCode,
    } : {}),
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
    .then(res => res.status === 'error' ? Promise.reject(res) : res)
}
export const setOrderState = apiMethod<typeof _setOrderState>(_setOrderState)

const _setOrderRating = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  value: number,
) => {
  addToFormData(formData, {
    action: EBookingActions.SetRate,
    value,
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
}
/**
 * @param value rating from 1 till 5
 */
export const setOrderRating = apiMethod<typeof _setOrderRating>(_setOrderRating)

const _setWaitingTime = (
  { formData }: IApiMethodArguments,
  id: IOrder['b_id'],
  previous: number,
  additional: number = 180,
) => {
  addToFormData(formData, {
    action: EBookingActions.SetWaitingTime,
    previous,
    additional,
  })

  return axios.post(`${Config.API_URL}/drive/get/${id}`, formData)
    .then(res => res.data)
}
/**
 * Adds time to wait
 * @param previous actual waiting time
 */
export const setWaitingTime = apiMethod<typeof _setWaitingTime>(_setWaitingTime)
