import { Record } from 'immutable'
import { TAction } from '../../types'
import { EStatuses } from '../../types/types'
import { ActionTypes, IOrderState } from './constants'

export const record = Record<IOrderState>({
  client: null, destination: null, start: null,
  order: null,
  status: EStatuses.Loading,
  message: '',
  selectedOrderId: null,
})

export default function reducer(state = new record(), action: TAction) {
  const { type, payload } = action

  switch (type) {
    case ActionTypes.GET_ORDER_START:
      return state
        .set('status', EStatuses.Loading)
    case ActionTypes.GET_ORDER_SUCCESS:
      return state
        .set('status', EStatuses.Success)
        .set('order', payload)
    case ActionTypes.GET_ORDER_FAIL:
      return state
        .set('status', EStatuses.Fail)
        .set('message', payload)
    case ActionTypes.SET_ORDER:
      return state
        .set('order', payload)
    case ActionTypes.SET_SELECTED_ORDER_ID:
      return state
        .set('selectedOrderId', payload)
    default:
      return state
  }
}