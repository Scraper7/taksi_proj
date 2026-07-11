import { Moment } from 'moment'
import { ActionTypes, IClientOrderState } from './constants'

export const setCarClass = (payload: IClientOrderState['carClass']) =>
  ({ type: ActionTypes.SET_CAR_CLASS, payload })
export const setSeats = (payload: IClientOrderState['seats']) =>
  ({ type: ActionTypes.SET_SEATS, payload })
export const setFrom = (
  payload: IClientOrderState['from'] | { isCurrent?: boolean },
) => ({ type: ActionTypes.SET_FROM_REQUEST, payload })
export const setTo = (
  payload: IClientOrderState['to'] | { isCurrent?: boolean },
) => ({ type: ActionTypes.SET_TO_REQUEST, payload })
export const setComments = (payload: IClientOrderState['comments']) =>
  ({ type: ActionTypes.SET_COMMENTS, payload })
export const setTime = (payload: Moment | 'now') => ({
  type: ActionTypes.SET_TIME,
  payload: typeof payload === 'string' ? payload : payload.valueOf(),
})
type TSetLocationClassPayload =
  IClientOrderState['locationClass'] |
  {
    id: IClientOrderState['locationClass']
    mode?: IClientOrderState['locationClassSelectionMode']
  }

export const setLocationClass = (payload: TSetLocationClassPayload) => {
  const normalizedPayload = typeof payload === 'string' ?
    { id: payload, mode: 'manual' as const } :
    { id: payload.id, mode: payload.mode ?? ('manual' as const) }

  return {
    type: ActionTypes.SET_LOCATION_CLASS,
    payload: normalizedPayload,
  }
}
export const setPhone = (payload: IClientOrderState['phone']) =>
  ({ type: ActionTypes.SET_PHONE, payload })
export const setCustomerPrice = (payload: IClientOrderState['customerPrice']) =>
  ({ type: ActionTypes.SET_CUSTOMER_PRICE, payload })
export const setPickupPrice = (payload: IClientOrderState['pickupPrice']) =>
  ({ type: ActionTypes.SET_PICKUP_PRICE, payload })
export const reset = () =>
  ({ type: ActionTypes.RESET })
export const setMessage = (payload: IClientOrderState['message']) =>
  ({ type: ActionTypes.SET_MESSAGE, payload })
export const setStatus = (payload: IClientOrderState['status']) =>
  ({ type: ActionTypes.RESET, payload })
export const setSelectedOrder = (payload: IClientOrderState['selectedOrder']) =>
  ({ type: ActionTypes.SET_SELECTED_ORDER, payload })