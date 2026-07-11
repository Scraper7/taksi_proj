import moment from 'moment'
import SITE_CONSTANTS from '../../siteConstants'
import { EBookingLocationKinds, IAddressPoint, IBookingLocationClass, ICarClass } from '../../types/types'
import { firstItem } from '../../tools/utils'
import {
  availableCarClasses as getAvailableCarClasses,
  carClassAllowedForRoute,
  carClassSupportsLocationClass,
  maxAvailableSeats,
  polygonsLocationClasses,
} from './util'

export type OrderMode = 'order' | 'vote' | 'offer'
export type TripType = 'CITY' | 'INTERCITY' | 'LOCATION' | 'UNKNOWN'

export interface OrderFormFacts {
  from: IAddressPoint | null
  to: IAddressPoint | null
  fromPolygons: string[] | null
  toPolygons: string[] | null
  fromLoading: boolean
  toLoading: boolean
  locationClass: IBookingLocationClass['id']
  locationClassSelectionMode: 'auto' | 'manual'
  carClass: ICarClass['id']
  seats: number
  time: any
  comments?: unknown
  phone?: number | null
}

export interface RouteFacts {
  hasFrom: boolean
  hasTo: boolean
  isLoading: boolean
  isRouteResolved: boolean
  algorithmLocationClasses: IBookingLocationClass[] | null
  algorithmLocationClass: IBookingLocationClass['id'] | null
  effectiveLocationClass: IBookingLocationClass['id'] | null
  tripType: TripType
}

export interface CarClassResolution {
  availableClasses: ICarClass[] | null
  availableClassIds: ICarClass['id'][]
  selectedClass: ICarClass | null
  validatedSelectedClassId: ICarClass['id'] | null
  fallbackClassId: ICarClass['id'] | null
  maxSeats: number | null
}

export interface OrderModeResolution {
  allowedModes: OrderMode[]
  recommendedMode: OrderMode
  preferOfferMode: boolean
  reasons: string[]
}

export interface ButtonLayoutItem {
  mode: OrderMode
  recommended: boolean
  compact: boolean
}

export interface ButtonLayoutResolution {
  primary: OrderMode[]
  compactModes: OrderMode[]
  emphasizedMode: OrderMode
  items: ButtonLayoutItem[]
}

export interface SubmitValidationResult {
  valid: boolean
  missing: Array<'from' | 'to' | 'phone' | 'carClass'>
}

function getTripTypeByLocationClass(locationClass: IBookingLocationClass | null): TripType {
  if (!locationClass)
    return 'UNKNOWN'

  if (locationClass.kind === EBookingLocationKinds.Intercity)
    return 'INTERCITY'
  if (locationClass.kind === EBookingLocationKinds.Location)
    return 'LOCATION'
  return 'CITY'
}

export function resolveTripType(locationClass: IBookingLocationClass | null): TripType {
  return getTripTypeByLocationClass(locationClass)
}


function isDelayedPickupTime(value: any) {
  if (!value || value === 'now')
    return false

  const pickupTime = moment.isMoment(value) ? value : moment(value)
  return pickupTime.isValid() && pickupTime.diff(moment(), 'minutes') > 15
}

export function resolveRouteFacts(facts: OrderFormFacts): RouteFacts {
  const isLoading = Boolean(facts.fromLoading || facts.toLoading)
  const configuredLocationClasses = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
  const algorithmLocationClasses = isLoading ?
    null :
    (() => {
      const classes = polygonsLocationClasses(facts.fromPolygons, facts.toPolygons, facts.from, facts.to)
      return classes.length ? classes : configuredLocationClasses
    })()

  const algorithmLocationClass = algorithmLocationClasses?.find(({ id }) => String(id) === String(facts.locationClass))?.id ??
    algorithmLocationClasses?.[0]?.id ??
    null

  const effectiveLocationClass = facts.locationClassSelectionMode === 'auto' ?
    algorithmLocationClass :
    facts.locationClass

  const locationClassData = configuredLocationClasses.find(({ id }) => String(id) === String(effectiveLocationClass)) ?? null

  return {
    hasFrom: Boolean(facts.from?.latitude && facts.from?.longitude),
    hasTo: Boolean(facts.to?.latitude && facts.to?.longitude),
    isLoading,
    isRouteResolved: Boolean(!isLoading && facts.from && facts.to),
    algorithmLocationClasses,
    algorithmLocationClass,
    effectiveLocationClass,
    tripType: getTripTypeByLocationClass(locationClassData),
  }
}

export function resolveAvailableClasses(facts: OrderFormFacts, routeFacts = resolveRouteFacts(facts)): CarClassResolution {
  if (routeFacts.isLoading) {
    return {
      availableClasses: null,
      availableClassIds: [],
      selectedClass: null,
      validatedSelectedClassId: null,
      fallbackClassId: null,
      maxSeats: null,
    }
  }

  const selectedLocationClassData = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.find(({ id }) =>
    String(id) === String(routeFacts.effectiveLocationClass),
  )
  const locationClasses = selectedLocationClassData ? [selectedLocationClassData] : SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
  const availableClasses = getAvailableCarClasses(
    locationClasses,
    facts.fromPolygons,
    facts.toPolygons,
    facts.from,
    facts.to,
  )
  const selectedClass = SITE_CONSTANTS.CAR_CLASSES[facts.carClass] ?? null
  const selectedClassAllowed = Boolean(
    selectedClass &&
    routeFacts.effectiveLocationClass &&
    carClassSupportsLocationClass(selectedClass, routeFacts.effectiveLocationClass) &&
    carClassAllowedForRoute(selectedClass, facts.fromPolygons, facts.toPolygons, facts.from, facts.to),
  )
  const fallbackClassId = firstItem(new Set(availableClasses.map(({ id }) => id))) ?? SITE_CONSTANTS.DEFAULT_CAR_CLASS

  return {
    availableClasses,
    availableClassIds: availableClasses.map(({ id }) => id),
    selectedClass,
    validatedSelectedClassId: selectedClassAllowed ? facts.carClass : null,
    fallbackClassId,
    maxSeats: maxAvailableSeats(availableClasses),
  }
}

export function resolveOrderModes(
  facts: OrderFormFacts,
  routeFacts = resolveRouteFacts(facts),
  classResolution = resolveAvailableClasses(facts, routeFacts),
): OrderModeResolution {
  const preferOfferMode = routeFacts.tripType === 'INTERCITY' || isDelayedPickupTime(facts.time)
  const reasons: string[] = []

  if (routeFacts.tripType === 'INTERCITY')
    reasons.push('intercity')
  if (isDelayedPickupTime(facts.time))
    reasons.push('delayed_pickup')
  if (!classResolution.validatedSelectedClassId && classResolution.fallbackClassId)
    reasons.push('class_fallback')

  return {
    allowedModes: ['vote', 'offer', 'order'],
    recommendedMode: preferOfferMode ? 'offer' : 'vote',
    preferOfferMode,
    reasons,
  }
}

export function resolveButtonLayout(orderModeResolution: OrderModeResolution): ButtonLayoutResolution {
  const preferOfferMode = orderModeResolution.preferOfferMode
  const items: ButtonLayoutItem[] = preferOfferMode ? [
    { mode: 'offer', recommended: true, compact: false },
    { mode: 'vote', recommended: false, compact: true },
    { mode: 'order', recommended: true, compact: false },
  ] : [
    { mode: 'vote', recommended: true, compact: false },
    { mode: 'offer', recommended: false, compact: true },
    { mode: 'order', recommended: true, compact: false },
  ]

  return {
    primary: items.filter(item => !item.compact).map(item => item.mode),
    compactModes: items.filter(item => item.compact).map(item => item.mode),
    emphasizedMode: orderModeResolution.recommendedMode,
    items,
  }
}

export function resolveSubmitValidation(
  facts: OrderFormFacts,
  routeFacts = resolveRouteFacts(facts),
  classResolution = resolveAvailableClasses(facts, routeFacts),
): SubmitValidationResult {
  const missing: SubmitValidationResult['missing'] = []

  if (!routeFacts.hasFrom)
    missing.push('from')
  if (!routeFacts.hasTo)
    missing.push('to')
  if (!facts.phone)
    missing.push('phone')
  if (!classResolution.validatedSelectedClassId && !classResolution.fallbackClassId)
    missing.push('carClass')

  return {
    valid: missing.length === 0,
    missing,
  }
}

export function resolveOrderFormLayout(facts: OrderFormFacts) {
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
}
