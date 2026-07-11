import { createSelector } from 'reselect'
import moment from 'moment'
import { ICarClass, IBookingLocationClass } from '../../types/types'
import { getPhoneNumberError } from '../../tools/utils'
import { IRootState } from '..'
import { userSelectors } from '../user'
import * as util from './util'
import { resolveRouteFacts, resolveAvailableClasses, resolveOrderModes, resolveButtonLayout, resolveSubmitValidation, OrderFormFacts } from './orderFormResolvers'
import { moduleName } from './constants'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const carClass = createSelector(moduleSelector, state => state.carClass)
export const seats = createSelector(moduleSelector, state => state.seats)
export const from = createSelector(moduleSelector, state => state.from)
export const to = createSelector(moduleSelector, state => state.to)
export const comments = createSelector(moduleSelector, state => state.comments)
const rawTime = createSelector(moduleSelector, state => state.time)
export const time = createSelector(
  rawTime,
  time => typeof time === 'string' ? time : moment(time),
)
export const locationClass =
  createSelector(moduleSelector, state => state.locationClass)
export const locationClassSelectionMode =
  createSelector(moduleSelector, state => state.locationClassSelectionMode)
export const phone = createSelector(
  [moduleSelector, userSelectors.user],
  (state, user): number | null =>
    !state.phoneEdited && getPhoneNumberError(state.phone) ?
      user?.u_phone ? +user.u_phone : null :
      state.phone,
)
export const customerPrice =
  createSelector(moduleSelector, state => state.customerPrice)
export const pickupPrice =
  createSelector(moduleSelector, state => state.pickupPrice)
export const selectedOrder =
  createSelector(moduleSelector, state => state.selectedOrder)
export const status = createSelector(moduleSelector, state => state.status)
export const message = createSelector(moduleSelector, state => state.message)

const fromLoading = createSelector(moduleSelector, state => state.fromLoading)
const toLoading = createSelector(moduleSelector, state => state.toLoading)
const fromPolygons = createSelector(moduleSelector, state => state.fromPolygons)
const toPolygons = createSelector(moduleSelector, state => state.toPolygons)
const orderFormFacts = createSelector(
  [fromLoading, toLoading, fromPolygons, toPolygons, from, to, locationClass, locationClassSelectionMode, carClass, seats, time, phone],
  (
    fromLoading, toLoading,
    fromPolygons, toPolygons, fromPoint, toPoint, selectedLocationClass, selectedLocationClassMode, selectedCarClass, selectedSeats, selectedTime, selectedPhone,
  ): OrderFormFacts => ({
    from: fromPoint,
    to: toPoint,
    fromPolygons,
    toPolygons,
    fromLoading,
    toLoading,
    locationClass: selectedLocationClass,
    locationClassSelectionMode: selectedLocationClassMode,
    carClass: selectedCarClass,
    seats: selectedSeats,
    time: selectedTime,
    phone: selectedPhone,
  }),
)

export const orderFormLayout = createSelector(
  orderFormFacts,
  facts => {
    const routeFacts = resolveRouteFacts(facts)
    const classResolution = resolveAvailableClasses(facts, routeFacts)
    const orderModeResolution = resolveOrderModes(facts, routeFacts, classResolution)
    const buttonLayout = resolveButtonLayout(orderModeResolution)
    const validation = resolveSubmitValidation(facts, routeFacts, classResolution)

    return {
      routeFacts,
      classResolution,
      orderModeResolution,
      buttonLayout,
      validation,
    }
  },
)

export const algorithmLocationClasses = createSelector(
  orderFormLayout,
  ({ routeFacts }): IBookingLocationClass[] | null => routeFacts.algorithmLocationClasses,
)
export const algorithmLocationClass = createSelector(
  orderFormLayout,
  ({ routeFacts }): IBookingLocationClass['id'] | null => routeFacts.algorithmLocationClass,
)
export const availableLocationClasses = createSelector(
  [fromLoading, toLoading, carClass, fromPolygons, toPolygons, from, to],
  (
    fromLoading, toLoading,
    selectedCarClass, fromPolygons, toPolygons, fromPoint, toPoint,
  ): IBookingLocationClass[] | null => fromLoading || toLoading ?
    null :
    util.manualLocationClasses(selectedCarClass, fromPolygons, toPolygons, fromPoint, toPoint),
)
export const availableCarClasses = createSelector(
  orderFormLayout,
  ({ classResolution }): ICarClass[] | null => classResolution.availableClasses,
)
export const maxAvailableSeats = createSelector(
  availableCarClasses,
  (carClasses): number | null => carClasses &&
    util.maxAvailableSeats(carClasses),
)