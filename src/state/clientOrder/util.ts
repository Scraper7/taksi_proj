import {
  IAddressPoint,
  ICarClass,
  EBookingLocationKinds, IBookingLocationClass,
} from '../../types/types'
import { IPolygon } from '../../types/polygon'
import SITE_CONSTANTS from '../../siteConstants'

const MAX_CITY_ROUTE_DISTANCE_KM = 30

type TPointLike = Pick<IAddressPoint, 'latitude' | 'longitude'> | null | undefined

function toFiniteCoordinate(value: unknown): number | null {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function getPointCoordinates(point: TPointLike): [number, number] | null {
  const latitude = toFiniteCoordinate(point?.latitude)
  const longitude = toFiniteCoordinate(point?.longitude)

  if (latitude === null || longitude === null)
    return null

  return [latitude, longitude]
}

function distanceBetweenPointsKm(from: [number, number], to: [number, number]) {
  const earthRadiusKm = 6371
  const toRadians = (value: number) => value * Math.PI / 180
  const lat1 = toRadians(from[0])
  const lat2 = toRadians(to[0])
  const deltaLat = toRadians(to[0] - from[0])
  const deltaLng = toRadians(to[1] - from[1])
  const a = Math.pow(Math.sin(deltaLat / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(deltaLng / 2), 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return earthRadiusKm * c
}

export function isLongDistanceRoute(from?: TPointLike, to?: TPointLike): boolean | null {
  const fromCoordinates = getPointCoordinates(from)
  const toCoordinates = getPointCoordinates(to)

  if (!fromCoordinates || !toCoordinates)
    return null

  return distanceBetweenPointsKm(fromCoordinates, toCoordinates) > MAX_CITY_ROUTE_DISTANCE_KM
}

export function polygonsLocationClasses(
  fromPolygons: IPolygon['id'][] | null,
  toPolygons: IPolygon['id'][] | null,
  fromPoint?: TPointLike,
  toPoint?: TPointLike,
): IBookingLocationClass[] {
  const cityRoute = isCityRoute(fromPolygons, toPolygons, fromPoint, toPoint)
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.filter(({ kind }) => {
    if (cityRoute === true)
      return kind === EBookingLocationKinds.City

    if (cityRoute === false)
      return kind !== EBookingLocationKinds.City

    return true
  })
}

export function isCityRoute(
  fromPolygons: IPolygon['id'][] | null,
  toPolygons: IPolygon['id'][] | null,
  fromPoint?: TPointLike,
  toPoint?: TPointLike,
): boolean | null {
  // Polygon API may return the same broad region polygon for two different cities.
  // In that case the old "any shared polygon means city" rule marks intercity as city.
  // A clearly long route must be treated as not-city even if a parent polygon overlaps.
  const longDistanceRoute = isLongDistanceRoute(fromPoint, toPoint)
  if (longDistanceRoute === true)
    return false

  if (!fromPolygons || !toPolygons)
    return null

  if (!fromPolygons.length || !toPolygons.length)
    return false

  const fromPolygonsSet = new Set(fromPolygons.map(String))
  return toPolygons.some(id => fromPolygonsSet.has(String(id)))
}

export function isPetitCarClass(carClass?: Partial<ICarClass> | null) {
  const text = [
    carClass?.id,
    carClass?.name,
    carClass?.title,
    carClass?.label,
    carClass?.code,
    carClass?.type,
  ].map(value => String(value ?? '').trim().toLowerCase()).join(' ')

  return text.includes('petit') ||
    text.includes('петит') ||
    text.includes('econom') ||
    text.includes('эконом') ||
    text === '1'
}

export function carClassSupportsLocationClass(
  carClass: ICarClass | undefined,
  locationClassId: IBookingLocationClass['id'],
) {
  if (!carClass)
    return false

  return carClass.booking_location_classes === null ||
    carClass.booking_location_classes.some(id => String(id) === String(locationClassId))
}

export function carClassAllowedForRoute(
  carClass: ICarClass,
  fromPolygons: IPolygon['id'][] | null,
  toPolygons: IPolygon['id'][] | null,
  fromPoint?: TPointLike,
  toPoint?: TPointLike,
) {
  const cityRoute = isCityRoute(fromPolygons, toPolygons, fromPoint, toPoint)

  // Hard business rule from the customer: Petite/Economy cars must not leave city borders.
  if (cityRoute === false && isPetitCarClass(carClass))
    return false

  return true
}

export function manualLocationClasses(
  carClassId: ICarClass['id'],
  fromPolygons: IPolygon['id'][] | null,
  toPolygons: IPolygon['id'][] | null,
  fromPoint?: TPointLike,
  toPoint?: TPointLike,
): IBookingLocationClass[] {
  void carClassId
  void fromPolygons
  void toPolygons
  void fromPoint
  void toPoint

  // Manual passenger choice must always show every configured trip zone.
  // The route algorithm still marks its automatic recommendation separately;
  // when the passenger taps another zone, the reducer switches the car class if needed.
  return SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
}

export function availableCarClasses(
  availableLocationClasses: IBookingLocationClass[],
  fromPolygons: IPolygon['id'][] | null = null,
  toPolygons: IPolygon['id'][] | null = null,
  fromPoint?: TPointLike,
  toPoint?: TPointLike,
): ICarClass[] {
  const ids = new Set(availableLocationClasses.map(({ id }) => String(id)))
  return Object.values(SITE_CONSTANTS.CAR_CLASSES).filter(cc =>
    carClassAllowedForRoute(cc, fromPolygons, toPolygons, fromPoint, toPoint) &&
    (
      cc.booking_location_classes === null ||
      cc.booking_location_classes.some(id => ids.has(String(id)))
    ),
  )
}

export function maxAvailableSeats(
  availableCarClasses: ICarClass[],
): number {
  let value = 1
  for (const carClass of availableCarClasses)
    if (carClass.seats > value)
      value = carClass.seats
  return value
}
