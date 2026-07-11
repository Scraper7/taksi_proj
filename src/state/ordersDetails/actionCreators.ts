import { TAction } from '../../types'
import { IOrder } from '../../types/types'
import { ActionTypes } from './constants'

export const getOrderStart = (payload: IOrder): TAction =>
  ({ type: ActionTypes.GET_START_REQUEST, payload })
export const getOrderDestination = (payload: IOrder): TAction =>
  ({ type: ActionTypes.GET_DESTINATION_REQUEST, payload })
export const getOrderClient = (payload: IOrder): TAction =>
  ({ type: ActionTypes.GET_CLIENT_REQUEST, payload })