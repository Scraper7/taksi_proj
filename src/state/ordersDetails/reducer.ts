import { Record, Map, Set } from 'immutable'
import { TAction } from '../../types'
import { ActionTypes, IOrderDetails, IOrdersDetailsState } from './constants'

export const OrderDetailsRecord = Record<IOrderDetails>({
  start: null,
  destination: null,
  client: null,
})

const defaultRecord: IOrdersDetailsState = {
  orders: Map(),
  ordersListeners: Set(),
}
export const ReducerRecord = Record<IOrdersDetailsState>(defaultRecord)

export default function(
  state = new ReducerRecord(),
  { type, payload }: TAction,
) {
  switch (type) {

    case ActionTypes.GET_START_SUCCESS:
    case ActionTypes.GET_DESTINATION_SUCCESS:
    case ActionTypes.GET_CLIENT_SUCCESS:
      if (!state.ordersListeners.has(payload.id))
        return state
      const key = ({
        [ActionTypes.GET_START_SUCCESS]: 'start',
        [ActionTypes.GET_DESTINATION_SUCCESS]: 'destination',
        [ActionTypes.GET_CLIENT_SUCCESS]: 'client',
      } as const)[type]
      return state
        .set(
          'orders',
          state.orders
            .set(
              payload.id,
              state.orders.get(payload.id, new OrderDetailsRecord())
                .set(key, payload.value),
            ),
        )

    case ActionTypes.SET_LISTENERS:
      const listeners = Set<any>(payload)
      return state
        .set(
          'orders',
          state.orders
            .deleteAll(state.ordersListeners.subtract(listeners)),
        )
        .set('ordersListeners', listeners)

    default:
      return state

  }
}