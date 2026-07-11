import { RecordOf, List as ImmutableList, Map as ImmutableMap } from 'immutable'
import { appName } from '../../constants'
import { IOrder } from '../../types/types'

export const moduleName = 'orders'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  WATCH_ACTIVE_ORDERS: `${prefix}/WATCH_ACTIVE_ORDERS`,
  UNWATCH_ACTIVE_ORDERS: `${prefix}/UNWATCH_ACTIVE_ORDERS`,
  GET_ACTIVE_ORDERS_REQUEST: `${prefix}/GET_ACTIVE_ORDERS_REQUEST`,
  GET_ACTIVE_ORDERS_SUCCESS: `${prefix}/GET_ACTIVE_ORDERS_SUCCESS`,
  GET_ACTIVE_ORDERS_FAIL: `${prefix}/GET_ACTIVE_ORDERS_FAIL`,

  WATCH_READY_ORDERS: `${prefix}/WATCH_READY_ORDERS`,
  UNWATCH_READY_ORDERS: `${prefix}/UNWATCH_READY_ORDERS`,
  GET_READY_ORDERS_REQUEST: `${prefix}/GET_READY_ORDERS_REQUEST`,
  GET_READY_ORDERS_SUCCESS: `${prefix}/GET_READY_ORDERS_SUCCESS`,
  GET_READY_ORDERS_FAIL: `${prefix}/GET_READY_ORDERS_FAIL`,

  WATCH_HISTORY_ORDERS: `${prefix}/WATCH_HISTORY_ORDERS`,
  UNWATCH_HISTORY_ORDERS: `${prefix}/UNWATCH_HISTORY_ORDERS`,
  GET_HISTORY_ORDERS_REQUEST: `${prefix}/GET_HISTORY_ORDERS_REQUEST`,
  GET_HISTORY_ORDERS_SUCCESS: `${prefix}/GET_HISTORY_ORDERS_SUCCESS`,
  GET_HISTORY_ORDERS_FAIL: `${prefix}/GET_HISTORY_ORDERS_FAIL`,

  WATCH_ORDER: `${prefix}/WATCH_ORDER`,
  UNWATCH_ORDER: `${prefix}/UNWATCH_ORDER`,
  GET_ORDER_REQUEST: `${prefix}/GET_ORDER_REQUEST`,
  GET_ORDER_SUCCESS: `${prefix}/GET_ORDER_SUCCESS`,
  GET_ORDER_NOT_FOUND: `${prefix}/GET_ORDER_NOT_FOUND`,
  GET_ORDER_FAIL: `${prefix}/GET_ORDER_FAIL`,
  CREATE_SUCCESS: `${prefix}/CREATE_SUCCESS`,
  MUTATION_START: `${prefix}/MUTATION_START`,
  MUTATION_FAIL: `${prefix}/MUTATION_FAIL`,
  UPDATE_SUCCESS: `${prefix}/UPDATE_SUCCESS`,

  CLEAR: `${prefix}/CLEAR`,
} as const

export interface IOrderState {
  value: IOrder | null
  partial: IOrder | null
  listeners: number
  mutations: number
  stale: boolean
}

export interface IOrdersState {
  orders: ImmutableMap<IOrder['b_id'], RecordOf<IOrderState>>
  activeOrders: ImmutableList<IOrder['b_id']> | null
  readyOrders: ImmutableList<IOrder['b_id']> | null
  historyOrders: ImmutableList<IOrder['b_id']> | null
}