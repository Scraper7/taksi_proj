import { createSelector } from 'reselect'
import { moduleName } from './constants'
import { IRootState } from '../'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const order = createSelector(moduleSelector, state => state.order)
export const start = createSelector(moduleSelector, state => state.start)
export const destination = createSelector(moduleSelector, state => state.destination)
export const status = createSelector(moduleSelector, state => state.status)
export const message = createSelector(moduleSelector, state => state.message)
export const client = createSelector(moduleSelector, state => state.client)
export const selectedOrderId = createSelector(
  moduleSelector,
  state => state.get('selectedOrderId'),
)