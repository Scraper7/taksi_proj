import { TAction } from '../../types/index'
import { IOrder } from '../../types/types'
import { ActionTypes } from './constants'

export const getOrder = (payload: IOrder['b_id']): TAction => {
  return { type: ActionTypes.GET_ORDER_REQUEST, payload }
}

export const setOrder = (payload: IOrder | null): TAction => {
  return { type: ActionTypes.SET_ORDER, payload }
}

export const clearOrder = (): TAction => {
  return { type: ActionTypes.CLEAR_ORDER }
}

export const setSelectedOrderId = (id: string) => {
  return { type: ActionTypes.SET_SELECTED_ORDER_ID, payload: id }
}