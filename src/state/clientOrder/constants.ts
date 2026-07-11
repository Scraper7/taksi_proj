import { appName } from '../../constants'
import {
  ICarClass, IBookingComment, IBookingLocationClass,
  EStatuses, IAddressPoint, IOrder,
} from '../../types/types'
import { IPolygon } from '../../types/polygon'

export const moduleName = 'clientOrder'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  SET_FROM_REQUEST: `${prefix}/SET_FROM_REQUEST`,
  SET_FROM: `${prefix}/SET_FROM`,
  SET_FROM_SUCCESS: `${prefix}/SET_FROM_SUCCESS`,
  SET_FROM_POLYGONS: `${prefix}/SET_FROM_POLYGONS`,

  SET_TO_REQUEST: `${prefix}/SET_TO_REQUEST`,
  SET_TO: `${prefix}/SET_TO`,
  SET_TO_SUCCESS: `${prefix}/SET_TO_SUCCESS`,
  SET_TO_POLYGONS: `${prefix}/SET_TO_POLYGONS`,

  SET_CAR_CLASS: `${prefix}/SET_CAR_CLASS`,
  SET_SEATS: `${prefix}/SET_SEATS_COUNT`,
  SET_COMMENTS: `${prefix}/SET_COMMENT_DATA`,
  SET_TIME: `${prefix}/SET_TIME`,
  SET_LOCATION_CLASS: `${prefix}/SET_LOCATION_CLASS`,
  SET_PHONE: `${prefix}/SET_PHONE`,
  SET_CUSTOMER_PRICE: `${prefix}/SET_PRICE`,
  SET_PICKUP_PRICE: `${prefix}/SET_PICKUP_PRICE`,
  SET_SELECTED_ORDER: `${prefix}/SET_SELECTED_ORDER`,
  SET_STATUS: `${prefix}/SET_STATUS`,
  SET_MESSAGE: `${prefix}/SET_MESSAGE`,
  RESET: `${prefix}/RESET`,
} as const

export interface IClientOrderState {
  from: IAddressPoint | null
  fromPolygons: IPolygon['id'][] | null
  fromLoading: boolean

  to: IAddressPoint | null
  toPolygons: IPolygon['id'][] | null
  toLoading: boolean

  carClass: ICarClass['id']
  seats: number
  comments: {
    custom?: string
    flightNumber?: string
    placard?: string
    ids: IBookingComment['id'][]
  }
  time: number | 'now'
  locationClass: IBookingLocationClass['id']
  locationClassSelectionMode: 'auto' | 'manual'
  phone: number | null
  phoneEdited: boolean
  customerPrice: number | null
  pickupPrice: number | null
  selectedOrder: IOrder['b_id'] | null
  status: EStatuses
  message: string
}