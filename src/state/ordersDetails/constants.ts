import { RecordOf, Set, Map } from 'immutable'
import { appName } from '../../constants'
import { ILoadedAddressPoint, IOrder, IUser } from '../../types/types'

export const moduleName = 'ordersDetails'
const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  GET_START_REQUEST: `${prefix}/GET_START_REQUEST`,
  GET_START_SUCCESS: `${prefix}/GET_START_SUCCESS`,
  GET_START_FAIL: `${prefix}/GET_START_FAIL`,

  GET_DESTINATION_REQUEST: `${prefix}/GET_DESTINATION_REQUEST`,
  GET_DESTINATION_SUCCESS: `${prefix}/GET_DESTINATION_SUCCESS`,
  GET_DESTINATION_FAIL: `${prefix}/GET_DESTINATION_FAIL`,

  GET_CLIENT_REQUEST: `${prefix}/GET_CLIENT_REQUEST`,
  GET_CLIENT_SUCCESS: `${prefix}/GET_CLIENT_SUCCESS`,
  GET_CLIENT_FAIL: `${prefix}/GET_CLIENT_FAIL`,

  SET_LISTENERS: `${prefix}/SET_LISTENERS`,
} as const

export interface IOrderDetails {
  start: ILoadedAddressPoint | null
  destination: ILoadedAddressPoint | null
  client: IUser | null
}

export interface IOrdersDetailsState {
  orders: Map<IOrder['b_id'], RecordOf<IOrderDetails>>
  ordersListeners: Set<IOrder['b_id']>
}