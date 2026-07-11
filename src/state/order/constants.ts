import { EStatuses, IAddressPoint, IUser } from '../../types/types'
import { appName } from '../../constants'
import { IOrder } from '../../types/types'

export const moduleName = 'order'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  GET_ORDER_REQUEST: `${prefix}/GET_ORDER_REQUEST`,
  GET_ORDER_START: `${prefix}/GET_ORDER_START`,
  GET_ORDER_SUCCESS: `${prefix}/GET_ORDER_SUCCESS`,
  GET_ORDER_FAIL: `${prefix}/GET_ORDER_FAIL`,

  SET_ORDER: `${prefix}/SET_ORDER`,
  SET_START: `${prefix}/SET_START`,
  SET_DESTINATION: `${prefix}/SET_DESTINATION`,
  SET_CLIENT: `${prefix}/SET_CLIENT`,

  CLEAR_ORDER: `${prefix}/CLEAR_ORDER`,
  SET_SELECTED_ORDER_ID: `${prefix}/SET_SELECTED_ORDER_ID`,
} as const

export interface IOrderState {
  status: EStatuses,
  message: string,
  order: IOrder | null,
  start: IAddressPoint | null,
  destination: IAddressPoint | null,
  client: IUser | null,
  selectedOrderId: string | null,
}