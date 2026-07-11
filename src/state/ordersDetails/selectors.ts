import { createSelector, weakMapMemoize } from 'reselect'
import {
  IOrder,
  IAddressPoint, ILoadedAddressPoint,
} from '../../types/types'
import {
  bookingCoordinatesStartToPoint,
  bookingCoordinatesDestinationToPoint,
} from '../../tools/convert'
import { order } from '../orders/selectors'
import { IRootState } from '../'
import { moduleName, IOrderDetails } from './constants'
import { OrderDetailsRecord } from './reducer'

export const moduleSelector = (state: IRootState) => state[moduleName]

const orderDetails = (state: IRootState, id: IOrder['b_id']): IOrderDetails =>
  moduleSelector(state).orders.get(id, new OrderDetailsRecord())

type Point = ILoadedAddressPoint | IAddressPoint | null

const startPoint = createSelector(
  order,
  order => order && bookingCoordinatesStartToPoint(order),
  { memoize: weakMapMemoize },
)
export const start = (state: IRootState, id: IOrder['b_id']): Point =>
  orderDetails(state, id).start ?? startPoint(state, id) ?? null

const destinationPoint = createSelector(
  order,
  order => order && bookingCoordinatesDestinationToPoint(order),
  { memoize: weakMapMemoize },
)
export const destination = (state: IRootState, id: IOrder['b_id']): Point =>
  orderDetails(state, id).destination ?? destinationPoint(state, id) ?? null

export const client = (state: IRootState, id: IOrder['b_id']) =>
  orderDetails(state, id).client