import React, { useState, useEffect, useMemo, useRef } from 'react'
import cn from 'classnames'
import L from 'leaflet'
import {
  MapContainer, TileLayer,
  Marker, CircleMarker, Popup, Tooltip, Polyline,
  useMap,
} from 'react-leaflet'
import SmoothRotatingMarker from '../SmoothRotatingMarker'
import { connect, ConnectedProps } from 'react-redux'
import {
  EBookingDriverState,
  IAddressPoint,
  IDriver,
  IOrder,
  IRouteInfo,
  IStaticMarker,
} from '../../types/types'
import {
  distanceBetweenEarthCoordinates,
  getAttribution,
  getTileServerUrl,
} from '../../tools/utils'
import { useInterval } from '../../tools/hooks'
import SITE_CONSTANTS from '../../siteConstants'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import { IRootState } from '../../state'
import { modalsSelectors } from '../../state/modals'
import { EMapModalTypes } from '../../state/modals/constants'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { areasSelectors } from '../../state/areas'
import { IWayGraph } from '../../tools/maps'
import { orderSelectors } from '../../state/order'
import { getPassengerConfirmedChoice, getPassengerConfirmedChoiceStartedAt, getPassengerPickupEta, getPassengerRejectedChoices, isChoiceOrder, isOfferOrder, isVotingOrder, isVisibleChoiceDriverState, setPassengerPickupEta } from '../../tools/driverOffer'
import { BROWSER_EMULATOR_DRIVER_LOCATION_EVENT, getEmulatedDriverLocation, isEmulatedDriver } from '../../tools/emulatorMode'
import { setFrontendLogSnapshot, summarizeDriver, summarizeOrder, summarizePoint, summarizeRouteInfo, writeFrontendLog } from '../../tools/frontendLog'
import { writeFlowEvent } from '../../tools/flowLog'
import './styles.scss'

const STATIC_ACTIVE_MARKER_ICON = new L.Icon({
  iconUrl: images.activeMarker,
  iconSize: [24, 34],
  iconAnchor: [12, 34],
  popupAnchor: [0, -35],
})

const FROM_MARKER_ICON = new L.Icon({
  iconUrl: images.markerFrom,
  iconSize: [35, 41],
  iconAnchor: [18, 41],
  popupAnchor: [0, -35],
})

const TO_MARKER_ICON = new L.Icon({
  iconUrl: images.markerTo,
  iconSize: [36, 41],
  iconAnchor: [18, 41],
  popupAnchor: [0, -35],
})


function formatPickupRouteDuration(routeInfo?: IRouteInfo | null) {
  if (!routeInfo) return ''

  const parts = [
    !!routeInfo.time.hours && `${routeInfo.time.hours} ч`,
    !!routeInfo.time.minutes && `${routeInfo.time.minutes} мин`,
  ].filter(Boolean)

  return parts.length ? parts.join(' ') : 'меньше минуты'
}

const KNOWN_LEAFLET_CLEANUP_ERRORS = [
  'Map container is being reused by another instance',
  'Map container not found',
  "Cannot read properties of undefined (reading '_leaflet_pos')",
  "Cannot read property '_leaflet_pos' of undefined",
  "Cannot read properties of null (reading '_leaflet_pos')",
  "Cannot read property '_leaflet_pos' of null",
  "Cannot read properties of undefined (reading '_leaflet_events')",
  "Cannot read property '_leaflet_events' of undefined",
  "Cannot read properties of null (reading '_leaflet_events')",
  "Cannot read property '_leaflet_events' of null",
  "Cannot read properties of undefined (reading 'appendChild')",
  "Cannot read property 'appendChild' of undefined",
  "Cannot read properties of null (reading 'appendChild')",
  "Cannot read property 'appendChild' of null",
  "Cannot read properties of undefined (reading 'parentNode')",
  "Cannot read property 'parentNode' of undefined",
  "Cannot read properties of null (reading 'parentNode')",
  "Cannot read property 'parentNode' of null",
]

function isKnownLeafletCleanupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return KNOWN_LEAFLET_CLEANUP_ERRORS.some(item => message.includes(item))
}

function patchLeafletRemove() {
  const prototype = L.Map?.prototype as any
  if (!prototype || prototype.__passengerSafeRemovePatched)
    return

  const originalRemove = prototype.remove
  prototype.remove = function passengerSafeRemove(...args: any[]) {
    const container = this?._container

    try {
      return originalRemove.apply(this, args)
    } catch (error) {
      if (!isKnownLeafletCleanupError(error))
        throw error

      try {
        this.off()
      } catch (_) {}

      if (container) {
        try {
          delete container._leaflet_id
        } catch (_) {}
      }

      return this
    } finally {
      if (container && !container.isConnected) {
        try {
          delete container._leaflet_id
        } catch (_) {}
      }
    }
  }
  prototype.__passengerSafeRemovePatched = true
}

function isLeafletMapConnected(map?: L.Map | null) {
  try {
    const container = map?.getContainer?.()
    return Boolean(container && container.isConnected)
  } catch (_) {
    return false
  }
}

function isLeafletRuntimeReady(map?: L.Map | null) {
  try {
    const panes = (map as any)?._panes
    return Boolean(
      isLeafletMapConnected(map) &&
      panes?.mapPane &&
      panes?.tilePane &&
      panes?.overlayPane &&
      panes?.markerPane &&
      panes?.popupPane,
    )
  } catch (_) {
    return false
  }
}


function cleanupStaleMarkerDom(marker: any) {
  const icon = marker?._icon
  const shadow = marker?._shadow

  try {
    if (icon && icon.parentNode)
      icon.parentNode.removeChild(icon)
  } catch (_) {}

  try {
    if (shadow && shadow.parentNode)
      shadow.parentNode.removeChild(shadow)
  } catch (_) {}

  try {
    marker._icon = null
    marker._shadow = null
  } catch (_) {}
}

function patchLeafletDomLifecycle() {
  const domEvent = (L.DomEvent as any)
  if (domEvent && !domEvent.__gruzvillSafeOffPatched) {
    const originalOff = domEvent.off
    if (typeof originalOff === 'function') {
      domEvent.off = function gruzvillSafeDomOff(...args: any[]) {
        const target = args[0]
        if (!target)
          return this

        try {
          return originalOff.apply(this, args)
        } catch (error) {
          if (!isKnownLeafletCleanupError(error))
            throw error

          return this
        }
      }
      domEvent.__gruzvillSafeOffPatched = true
    }
  }

  const domUtil = (L.DomUtil as any)
  if (domUtil && !domUtil.__gruzvillSafeRemovePatched) {
    const originalRemove = domUtil.remove
    if (typeof originalRemove === 'function') {
      domUtil.remove = function gruzvillSafeDomRemove(element: any) {
        if (!element || !element.parentNode)
          return undefined

        try {
          return originalRemove.call(this, element)
        } catch (error) {
          if (!isKnownLeafletCleanupError(error))
            throw error

          return undefined
        }
      }
      domUtil.__gruzvillSafeRemovePatched = true
    }
  }
}

function patchLeafletSafeRemoveLayer() {
  const mapPrototype = (L.Map as any)?.prototype
  if (mapPrototype && !mapPrototype.__gruzvillSafeRemoveLayerPatched) {
    const originalRemoveLayer = mapPrototype.removeLayer
    if (typeof originalRemoveLayer === 'function') {
      mapPrototype.removeLayer = function gruzvillSafeRemoveLayer(layer: any) {
        if (!layer)
          return this

        try {
          return originalRemoveLayer.call(this, layer)
        } catch (error) {
          if (!isKnownLeafletCleanupError(error))
            throw error

          try {
            const layerId = (L.Util as any).stamp(layer)
            if (this?._layers)
              delete this._layers[layerId]
          } catch (_) {}

          return this
        }
      }
      mapPrototype.__gruzvillSafeRemoveLayerPatched = true
    }
  }

  const markerPrototype = (L.Marker as any)?.prototype
  if (markerPrototype && !markerPrototype.__gruzvillSafeOnRemovePatched) {
    const originalOnRemove = markerPrototype.onRemove
    if (typeof originalOnRemove === 'function') {
      markerPrototype.onRemove = function gruzvillSafeMarkerOnRemove(map: any) {
        try {
          if (!map || !isLeafletMapConnected(map)) {
            cleanupStaleMarkerDom(this)
            return this
          }

          return originalOnRemove.call(this, map)
        } catch (error) {
          if (!isKnownLeafletCleanupError(error))
            throw error

          cleanupStaleMarkerDom(this)
          return this
        }
      }
      markerPrototype.__gruzvillSafeOnRemovePatched = true
    }
  }
}

function patchLeafletLayerLifecycle() {
  const prototype = (L.Layer as any)?.prototype
  if (!prototype || prototype.__passengerSafeLayerAddPatched)
    return

  const originalLayerAdd = prototype._layerAdd
  if (typeof originalLayerAdd !== 'function')
    return

  prototype._layerAdd = function passengerSafeLayerAdd(event: any) {
    const map = event?.target || this?._map

    // When the bottom panel expands/collapses React can unmount the Leaflet host
    // while a layer is still queued in map.whenReady(). In that short race Leaflet
    // tries to append a marker/popup into a pane that no longer exists and throws
    // appendChild undefined. Skip only that stale add; the next render adds layers
    // to the current map instance normally.
    if (!isLeafletRuntimeReady(map))
      return this

    try {
      return originalLayerAdd.call(this, event)
    } catch (error) {
      if (!isKnownLeafletCleanupError(error))
        throw error

      return this
    }
  }

  prototype.__passengerSafeLayerAddPatched = true
}

function safeLeafletAction(action: () => void) {
  try {
    action()
  } catch (error) {
    if (!isKnownLeafletCleanupError(error))
      throw error
  }
}

patchLeafletRemove()
patchLeafletDomLifecycle()
patchLeafletSafeRemoveLayer()
patchLeafletLayerLifecycle()

const defaultZoom = 15
const ACCEPTABLE_GEOLOCATION_ACCURACY_METERS = 200
const PASSENGER_GEOLOCATION_POLL_INTERVAL_MS = 5000
const SAVED_GEOLOCATION_KEY = 'gruzvill_last_browser_geolocation'

const STABLE_SELECTED_ORDER_ROUTE_CACHE_LIMIT = 30
const MIN_VISIBLE_CANDIDATE_DISTANCE_FROM_PICKUP_METERS = 420
const MAX_VISIBLE_CANDIDATE_DISTANCE_FROM_PICKUP_METERS = 1250
// Android/Chrome visibly flickers when we keep reusing a route that no longer
// starts near the current driver position. Keep the route stable only while the
// driver remains close to the cached road polyline; otherwise build a fresh one.
const MAX_DRIVER_ROUTE_CACHE_DISTANCE_TO_LINE_KM = 0.12
const MAX_DRIVER_ROUTE_RENDER_DISTANCE_TO_LINE_KM = 0.18
// After the client has selected a driver, keep that driver's road line and marker
// attached to the same route longer. Android Chrome flickers when the selected
// marker gets a new icon/route from tiny GPS/backend corrections every second.
const SELECTED_DRIVER_ROUTE_CACHE_DISTANCE_TO_LINE_KM = 0.8
const SELECTED_DRIVER_ROUTE_RENDER_DISTANCE_TO_LINE_KM = 0.8
const MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM = 80
const SHORT_ROUTE_DIRECT_DISTANCE_KM = 0.15
const SAME_POINT_ROUTE_DISTANCE_KM = 0.015
const DRIVER_ROUTE_COLORS = [
  '#2563EB',
  '#16A34A',
  '#F59E0B',
  '#7C3AED',
  '#0891B2',
  '#65A30D',
  '#0F766E',
  '#9333EA',
]
const stableSelectedOrderRouteCache = new window.Map<string, IRouteInfo>()

function getDriverColorByIndex(index: number) {
  return DRIVER_ROUTE_COLORS[Math.abs(index) % DRIVER_ROUTE_COLORS.length]
}

function getDriverColor(driver: Pick<IDriver, 'u_id' | 'c_id'> | null | undefined, drivers: IDriver[]) {
  const driverKey = String(driver?.u_id ?? driver?.c_id ?? '')
  const orderedKeys = Array.from(new Set(
    drivers
      .map(item => String(item.u_id ?? item.c_id ?? ''))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  ))
  const index = Math.max(0, orderedKeys.indexOf(driverKey))
  return getDriverColorByIndex(index)
}

function rememberStableSelectedOrderRoute(key: string, route: IRouteInfo) {
  if (!key || !isUsableRouteInfo(route)) return
  stableSelectedOrderRouteCache.set(key, route)
  while (stableSelectedOrderRouteCache.size > STABLE_SELECTED_ORDER_ROUTE_CACHE_LIMIT) {
    const firstKey = stableSelectedOrderRouteCache.keys().next().value
    if (!firstKey) break
    stableSelectedOrderRouteCache.delete(firstKey)
  }
}

function getStableSelectedOrderRouteKey(orderId: any, from?: IAddressPoint | null, to?: IAddressPoint | null) {
  if (!orderId || !from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude)
    return ''

  return [
    orderId,
    Number(from.latitude).toFixed(5),
    Number(from.longitude).toFixed(5),
    Number(to.latitude).toFixed(5),
    Number(to.longitude).toFixed(5),
  ].join('|')
}

function hashStringToNumber(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function makeStablePointAroundPickup(pickup: [number, number], seed: string): [number, number] {
  const hash = hashStringToNumber(seed || 'driver')
  const angle = (hash % 360) * Math.PI / 180
  const distanceMeters = MIN_VISIBLE_CANDIDATE_DISTANCE_FROM_PICKUP_METERS +
    (hash % Math.max(1, MAX_VISIBLE_CANDIDATE_DISTANCE_FROM_PICKUP_METERS - MIN_VISIBLE_CANDIDATE_DISTANCE_FROM_PICKUP_METERS))
  const latitudeOffset = (Math.cos(angle) * distanceMeters) / 111320
  const longitudeScale = Math.max(.2, Math.cos(pickup[0] * Math.PI / 180))
  const longitudeOffset = (Math.sin(angle) * distanceMeters) / (111320 * longitudeScale)

  return [
    Number((pickup[0] + latitudeOffset).toFixed(6)),
    Number((pickup[1] + longitudeOffset).toFixed(6)),
  ]
}

function makeVisibleCandidateDriver(driver: IDriver, order: IOrder | null, confirmedChoiceId: string | null): IDriver {
  if (!order || !isChoiceOrder(order) || confirmedChoiceId)
    return driver

  if (!order.b_start_latitude || !order.b_start_longitude || !driver.c_latitude || !driver.c_longitude)
    return driver

  const pickup: [number, number] = [order.b_start_latitude, order.b_start_longitude]
  const current: [number, number] = [driver.c_latitude, driver.c_longitude]
  const distanceToPickupKm = distanceBetweenEarthCoordinates(current[0], current[1], pickup[0], pickup[1])
  const distanceToPickupMeters = distanceToPickupKm * 1000
  const isClearlyStaleBackendPoint = distanceToPickupKm > MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM

  // На разных устройствах у пассажира может не быть локального localStorage эмулятора,
  // а backend иногда отдаёт старые координаты тестового водителя из другого города/страны.
  // Такие точки нельзя пускать в построение маршрута: получаются линии на тысячи км и
  // машина/маркер визуально расходятся. До выбора показываем стабильную точку рядом с заказом.
  if (!isEmulatedDriver(driver) && !isClearlyStaleBackendPoint)
    return driver

  if (!isClearlyStaleBackendPoint && distanceToPickupMeters >= MIN_VISIBLE_CANDIDATE_DISTANCE_FROM_PICKUP_METERS)
    return driver

  const seed = [order.b_id, driver.u_id, driver.c_id, driver.u_name, isClearlyStaleBackendPoint ? 'stale' : 'near'].filter(Boolean).join(':')
  const stablePoint = makeStablePointAroundPickup(pickup, seed)

  if (isClearlyStaleBackendPoint) {
    writeFrontendLog('map.driverRoute.staleCandidateLocationRebased', {
      orderId: order.b_id,
      driver: summarizeDriver(driver),
      distanceToPickupKm: Number(distanceToPickupKm.toFixed(2)),
      fallback: stablePoint,
    })
  }

  return {
    ...driver,
    c_latitude: stablePoint[0],
    c_longitude: stablePoint[1],
  }
}

function makeSafeSelectedEmulatedDriver(driver: IDriver, order: IOrder | null, confirmedChoiceId: string | null): IDriver {
  if (!order || !isChoiceOrder(order) || !confirmedChoiceId || String(driver.u_id) !== String(confirmedChoiceId))
    return driver

  if (!order.b_start_latitude || !order.b_start_longitude || !driver.c_latitude || !driver.c_longitude)
    return driver

  const pickup: [number, number] = [order.b_start_latitude, order.b_start_longitude]
  const current: [number, number] = [driver.c_latitude, driver.c_longitude]
  const distanceToPickupKm = distanceBetweenEarthCoordinates(current[0], current[1], pickup[0], pickup[1])

  if (!isEmulatedDriver(driver) && distanceToPickupKm < 500)
    return driver

  if (distanceToPickupKm < 80)
    return driver

  const seed = [order.b_id, driver.u_id, driver.c_id, 'selected'].filter(Boolean).join(':')
  const stablePoint = makeStablePointAroundPickup(pickup, seed)

  writeFrontendLog('map.driverRoute.emulatorStaleBackendLocationIgnored', {
    orderId: order.b_id,
    driver: summarizeDriver(driver),
    distanceToPickupKm: Number(distanceToPickupKm.toFixed(2)),
    fallback: stablePoint,
  })

  return {
    ...driver,
    c_latitude: stablePoint[0],
    c_longitude: stablePoint[1],
  }
}


function saveLastBrowserGeolocation(point: { latitude: number, longitude: number }) {
  try {
    window.localStorage.setItem(SAVED_GEOLOCATION_KEY, JSON.stringify(point))
  } catch {
    // ignore storage errors
  }
}

function getSavedMapCenter(): [number, number] | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_GEOLOCATION_KEY) || 'null')
    const latitude = Number(parsed?.latitude)
    const longitude = Number(parsed?.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : null
  } catch {
    return null
  }
}

function trimRoutePointsToPosition(points: Array<[number, number]> | undefined | null, position?: [number, number] | null) {
  if (!points?.length) return []
  if (!position || points.length < 2) return points

  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const distance = distanceBetweenEarthCoordinates(position[0], position[1], point[0], point[1])
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })

  // Do not draw a direct line from a noisy/off-road backend point to the route.
  // The car marker is projected to the road polyline, so the visible route must
  // also start from the nearest route point. Otherwise the line gets weird short
  // side segments and looks like it is rebuilt on every tick.
  return points.slice(Math.min(nearestIndex, points.length - 1))
}

function getDistanceToRouteKm(points: Array<[number, number]> | undefined | null, position?: [number, number] | null) {
  return getRouteDistanceAnalysisKm(points, position).distanceToRouteKm
}

function getRouteDistanceAnalysisKm(points: Array<[number, number]> | undefined | null, position?: [number, number] | null) {
  if (!points?.length || !position)
    return {
      distanceToRouteKm: Number.POSITIVE_INFINITY,
      nearestPoint: null as [number, number] | null,
      segmentIndex: null as number | null,
      progress: null as number | null,
      routeStartDistanceKm: Number.POSITIVE_INFINITY,
      routeEndDistanceKm: Number.POSITIVE_INFINITY,
      routePointsCount: points?.length || 0,
    }

  const routeStartDistanceKm = distanceBetweenEarthCoordinates(position[0], position[1], points[0][0], points[0][1])
  const routeEnd = points[points.length - 1]
  const routeEndDistanceKm = distanceBetweenEarthCoordinates(position[0], position[1], routeEnd[0], routeEnd[1])

  if (points.length < 2)
    return {
      distanceToRouteKm: routeStartDistanceKm,
      nearestPoint: points[0],
      segmentIndex: 0,
      progress: 0,
      routeStartDistanceKm,
      routeEndDistanceKm,
      routePointsCount: points.length,
    }

  const progress = getNearestRouteProgress(points, position)
  const distanceToRouteKm = distanceBetweenEarthCoordinates(
    position[0],
    position[1],
    progress.projectedPoint[0],
    progress.projectedPoint[1],
  )

  return {
    distanceToRouteKm,
    nearestPoint: progress.projectedPoint,
    segmentIndex: progress.segmentIndex,
    progress: progress.progress,
    routeStartDistanceKm,
    routeEndDistanceKm,
    routePointsCount: points.length,
  }
}

function summarizeRouteDistanceAnalysis(analysis: ReturnType<typeof getRouteDistanceAnalysisKm>) {
  return {
    distanceToRouteKm: Number.isFinite(analysis.distanceToRouteKm) ?
      Number(analysis.distanceToRouteKm.toFixed(3)) :
      null,
    nearestPoint: analysis.nearestPoint,
    segmentIndex: analysis.segmentIndex,
    progress: analysis.progress === null ? null : Number(analysis.progress.toFixed(3)),
    routeStartDistanceKm: Number.isFinite(analysis.routeStartDistanceKm) ?
      Number(analysis.routeStartDistanceKm.toFixed(3)) :
      null,
    routeEndDistanceKm: Number.isFinite(analysis.routeEndDistanceKm) ?
      Number(analysis.routeEndDistanceKm.toFixed(3)) :
      null,
    routePointsCount: analysis.routePointsCount,
  }
}

function getBearingDegrees(from: [number, number], to: [number, number]) {
  const fromLat = from[0] * Math.PI / 180
  const toLat = to[0] * Math.PI / 180
  const deltaLng = (to[1] - from[1]) * Math.PI / 180
  const y = Math.sin(deltaLng) * Math.cos(toLat)
  const x = Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLng)
  const bearing = Math.atan2(y, x) * 180 / Math.PI
  return (bearing + 360) % 360
}

function getDriverLocationSource(driver: IDriver) {
  return isEmulatedDriver(driver) ? 'browser-emulator' : 'polling'
}

function getRouteDistanceKm(points: Array<[number, number]> | undefined | null) {
  if (!points || points.length < 2)
    return 0

  return points.slice(1).reduce((sum, point, index) => {
    const previous = points[index]
    return sum + distanceBetweenEarthCoordinates(previous[0], previous[1], point[0], point[1])
  }, 0)
}

function routeTimeToMinutes(routeInfo?: IRouteInfo | null) {
  if (!routeInfo)
    return 0

  const hours = Number(routeInfo.time?.hours) || 0
  const minutes = Number(routeInfo.time?.minutes) || 0
  return Math.max(0, hours * 60 + minutes)
}

function parsePickupEtaMinutes(value?: string | null) {
  if (!value)
    return 0

  const text = String(value).toLowerCase()
  const numbers = text.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? []
  if (!numbers.length)
    return 0

  const first = numbers[0]
  if (/час|hour|ч\b/.test(text))
    return Math.max(1, first * 60 + (numbers[1] || 0))

  return Math.max(1, first)
}

function getPickupVisualDurationMs(order: IOrder, driver: IDriver, routeInfo: IRouteInfo) {
  const etaMinutes = parsePickupEtaMinutes(getPassengerPickupEta(order.b_id, driver))
  const routeMinutes = Math.max(1, routeTimeToMinutes(routeInfo))
  const minutes = etaMinutes ? Math.min(routeMinutes, etaMinutes) : routeMinutes

  // Passenger sees the car approaching live. Keep it in sync with the ETA and
  // never stretch a short test pickup to four minutes while the emulator already
  // reaches the client much earlier.
  return Math.max(25000, Math.min(120000, minutes * 60 * 1000))
}

function minutesToRouteTime(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0)
    return { hours: 0, minutes: 0 }

  const rounded = Math.max(1, Math.round(totalMinutes))
  return {
    hours: Math.floor(rounded / 60),
    minutes: rounded % 60,
  }
}

function getNearestRouteProgress(points: Array<[number, number]>, position: [number, number]) {
  let bestSegmentIndex = 0
  let bestProgress = 0
  let bestDistance = Number.POSITIVE_INFINITY
  let bestProjectedPoint: [number, number] = points[0]

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const averageLatitudeRad = ((start[0] + end[0]) / 2) * Math.PI / 180
    const kmPerLatitudeDegree = 111.32
    const kmPerLongitudeDegree = Math.max(0.01, 111.32 * Math.cos(averageLatitudeRad))
    const startX = start[1] * kmPerLongitudeDegree
    const startY = start[0] * kmPerLatitudeDegree
    const endX = end[1] * kmPerLongitudeDegree
    const endY = end[0] * kmPerLatitudeDegree
    const positionX = position[1] * kmPerLongitudeDegree
    const positionY = position[0] * kmPerLatitudeDegree
    const vectorX = endX - startX
    const vectorY = endY - startY
    const lengthSquared = vectorX * vectorX + vectorY * vectorY
    const progress = lengthSquared > 0 ?
      Math.min(1, Math.max(0, ((positionX - startX) * vectorX + (positionY - startY) * vectorY) / lengthSquared)) :
      0
    const projectedPoint: [number, number] = [
      start[0] + (end[0] - start[0]) * progress,
      start[1] + (end[1] - start[1]) * progress,
    ]
    const distance = distanceBetweenEarthCoordinates(position[0], position[1], projectedPoint[0], projectedPoint[1])

    if (distance < bestDistance) {
      bestDistance = distance
      bestSegmentIndex = index
      bestProgress = progress
      bestProjectedPoint = projectedPoint
    }
  }

  return {
    segmentIndex: bestSegmentIndex,
    progress: bestProgress,
    projectedPoint: bestProjectedPoint,
  }
}

function getRemainingDistanceFromProgress(points: Array<[number, number]>, segmentIndex: number, progress: number) {
  if (points.length < 2 || segmentIndex >= points.length - 1)
    return 0

  const segmentStart = points[segmentIndex]
  const segmentEnd = points[segmentIndex + 1]
  const segmentDistance = distanceBetweenEarthCoordinates(segmentStart[0], segmentStart[1], segmentEnd[0], segmentEnd[1])
  let distance = segmentDistance * Math.max(0, Math.min(1, 1 - progress))

  for (let index = segmentIndex + 1; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    distance += distanceBetweenEarthCoordinates(start[0], start[1], end[0], end[1])
  }

  return distance
}

function makeRemainingRouteInfo(routeInfo: IRouteInfo | null | undefined, position?: [number, number] | null): IRouteInfo | null {
  if (!routeInfo?.points?.length || !position || routeInfo.points.length < 2)
    return routeInfo || null

  const progress = getNearestRouteProgress(routeInfo.points, position)
  const remainingDistance = getRemainingDistanceFromProgress(routeInfo.points, progress.segmentIndex, progress.progress)
  if (remainingDistance < 0.03)
    return {
      distance: 0,
      time: { hours: 0, minutes: 0 },
      points: [],
    }

  const remainingPoints: Array<[number, number]> = [
    progress.projectedPoint,
    ...routeInfo.points.slice(progress.segmentIndex + 1),
  ]
  const sourceDistance = Number(routeInfo.distance) > 0 ? Number(routeInfo.distance) : getRouteDistanceKm(routeInfo.points)
  const sourceMinutes = routeTimeToMinutes(routeInfo)
  const remainingMinutes = sourceDistance > 0 && sourceMinutes > 0 ?
    sourceMinutes * Math.min(1, Math.max(0, remainingDistance / sourceDistance)) :
    0

  return {
    distance: parseFloat(remainingDistance.toFixed(2)),
    time: minutesToRouteTime(remainingMinutes),
    points: remainingPoints,
  }
}

function getRoutePointAtProgress(points: Array<[number, number]> | undefined | null, progress: number): [number, number] | null {
  if (!points?.length)
    return null

  if (points.length === 1)
    return points[0]

  const safeProgress = Math.max(0, Math.min(1, progress))
  const totalDistance = getRouteDistanceKm(points)
  if (!totalDistance)
    return points[0]

  const targetDistance = totalDistance * safeProgress
  let coveredDistance = 0

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    const segmentDistance = distanceBetweenEarthCoordinates(start[0], start[1], end[0], end[1])

    if (coveredDistance + segmentDistance >= targetDistance) {
      const segmentProgress = segmentDistance > 0 ? (targetDistance - coveredDistance) / segmentDistance : 0
      return [
        start[0] + (end[0] - start[0]) * segmentProgress,
        start[1] + (end[1] - start[1]) * segmentProgress,
      ]
    }

    coveredDistance += segmentDistance
  }

  return points[points.length - 1]
}

function getChoiceVisualDriverPosition(
  driver: IDriver,
  routeInfo: IRouteInfo | null | undefined,
  order: IOrder | null,
  confirmedChoiceId: string | null,
  now: number,
): [number, number] | null {
  if (!order || !isChoiceOrder(order) || !confirmedChoiceId || String(driver.u_id) !== String(confirmedChoiceId))
    return null

  if (!routeInfo?.points?.length || ![
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
  ].includes(driver.c_state))
    return null

  const startedAt = getPassengerConfirmedChoiceStartedAt(order.b_id, confirmedChoiceId)
  if (!startedAt)
    return null

  const elapsedMs = Math.max(0, now - startedAt)
  const durationMs = getPickupVisualDurationMs(order, driver, routeInfo)
  const progress = Math.min(.985, elapsedMs / durationMs)

  return getRoutePointAtProgress(routeInfo.points, progress)
}

const mapStateToProps = (state: IRootState) => ({
  type: modalsSelectors.mapModalType(state),
  defaultCenter: modalsSelectors.mapModalDefaultCenter(state),
  modalFrom: modalsSelectors.mapModalFrom(state),
  modalTo: modalsSelectors.mapModalTo(state),
  modalHighlight: modalsSelectors.mapModalHighlight(state),
  clientFrom: clientOrderSelectors.from(state),
  clientTo: clientOrderSelectors.to(state),
  detailedOrderStart: orderSelectors.start(state),
  detailedOrderDestination: orderSelectors.destination(state),
  takePassengerFrom: modalsSelectors.takePassengerModalFrom(state),
  takePassengerTo: modalsSelectors.takePassengerModalTo(state),
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  wayGraph: areasSelectors.wayGraph(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {
  isOpen?: boolean;
  disableButtons?: boolean;
  isModal?: boolean;
  onClose?: () => void
  containerClassName?: string
  setCenter?: (coordinates: [lat: number, lng: number]) => void
  forceFreeMode?: boolean
}

function Map({
  isOpen = true,
  defaultCenter,
  isModal,
  containerClassName,
  selectedOrder,
  forceFreeMode,
  ...props
}: IProps) {
  const effectiveSelectedOrder = forceFreeMode ? null : selectedOrder
  const mapKey = useMemo(() => [
    SITE_CONSTANTS.MAP_MODE,
    isModal ? 'modal' : 'page',
  ].join('__'), [isModal])

  return (
    <div
      className={cn('map-container', containerClassName, { 'map-container--active': isOpen, 'map-container--modal': isModal })}
    >
      <div key={mapKey} className="map-container__leaflet-host">
        <MapErrorBoundary resetKey={mapKey}>
          <MapContainer
            key={mapKey}
            center={defaultCenter || getSavedMapCenter() || SITE_CONSTANTS.DEFAULT_POSITION}
            zoom={defaultZoom}
            className='map'
            attributionControl={false}
            doubleClickZoom={false}
            boxZoom={false}
            zoomControl={false}
            preferCanvas
          >
            <MapContent
              {...{ isOpen, defaultCenter, isModal, containerClassName }}
              selectedOrder={effectiveSelectedOrder}
              {...props}
            />
          </MapContainer>
        </MapErrorBoundary>
      </div>
    </div>
  )
}

function MapContent({
  isOpen = true,
  type,
  defaultCenter,
  clientFrom,
  clientTo,
  modalFrom,
  modalTo,
  modalHighlight,
  detailedOrderStart,
  detailedOrderDestination,
  takePassengerFrom,
  takePassengerTo,
  activeOrders,
  selectedOrder,
  wayGraph,
  disableButtons,
  isModal,
  onClose,
  containerClassName,
  setCenter = () => {},
}: IProps) {

  const map = useMap()

  const [staticMarkers, setStaticMarkers] = useState<IStaticMarker[]>([])
  const [userCoordinates, setUserCoordinates] =
    useState<IAddressPoint | null>(null)
  const [userCoordinatesAccuracy, setUserCoordinatesAccuracy] =
    useState<number | null>(null)
  const [routeInfo, setRouteInfo] = useState<IRouteInfo | null>(null)
  const [driverRouteInfoById, setDriverRouteInfoById] =
    useState<Record<string, IRouteInfo | null>>({})
  const lastOrderRouteInfoRef = useRef<IRouteInfo | null>(null)
  const lastDriverRouteInfoByIdRef = useRef<Record<string, IRouteInfo | null>>({})
  const lastDriverRouteMetaByIdRef = useRef<Record<string, { from: [number, number], to: [number, number], state: EBookingDriverState }>>({})
  const lastDriverStateFlowByIdRef = useRef<Record<string, EBookingDriverState>>({})
  const lastDriverGeofenceKeyByIdRef = useRef<Record<string, string>>({})
  const lastDriverMatchingKeyByIdRef = useRef<Record<string, string>>({})
  const lastActivePolylinesLogKeyRef = useRef('')
  const lastActivePolylinesByIdRef = useRef<Record<string, any>>({})
  const lastDriverLocationLogByIdRef = useRef<Record<string, {
    latitude: number
    longitude: number
    timestamp: number
    state: EBookingDriverState
    orderId: string | null
  }>>({})
  const lastVisibleSelectedOrderDriversRef = useRef<IDriver[]>([])
  const lastSelectedOrderIdRef = useRef<string | null>(null)
  const [passengerChoiceVersion, setPassengerChoiceVersion] = useState(0)
  const [emulatorLocationVersion, setEmulatorLocationVersion] = useState(0)
  const [choiceVisualMoveTick, setChoiceVisualMoveTick] = useState(0)
  const [showRouteInfo, setShowRouteInfo] = useState(false)
  const passengerGeoRequestPendingRef = useRef(false)
  const lastPassengerGeoRequestAtRef = useRef(0)

  useEffect(() => {
    const handlePassengerChoice = () => setPassengerChoiceVersion(version => version + 1)
    window.addEventListener('passengerConfirmedDriverChoice', handlePassengerChoice)
    window.addEventListener('passengerCanceledDriverChoice', handlePassengerChoice)
    window.addEventListener('passengerRejectedChoicesChanged', handlePassengerChoice)
    window.addEventListener('storage', handlePassengerChoice)
    return () => {
      window.removeEventListener('passengerConfirmedDriverChoice', handlePassengerChoice)
      window.removeEventListener('passengerCanceledDriverChoice', handlePassengerChoice)
      window.removeEventListener('passengerRejectedChoicesChanged', handlePassengerChoice)
      window.removeEventListener('storage', handlePassengerChoice)
    }
  }, [])

  useEffect(() => {
    const handleEmulatorLocationChange = () => setEmulatorLocationVersion(version => version + 1)
    window.addEventListener(BROWSER_EMULATOR_DRIVER_LOCATION_EVENT, handleEmulatorLocationChange)
    window.addEventListener('storage', handleEmulatorLocationChange)
    return () => {
      window.removeEventListener(BROWSER_EMULATOR_DRIVER_LOCATION_EVENT, handleEmulatorLocationChange)
      window.removeEventListener('storage', handleEmulatorLocationChange)
    }
  }, [])
  const selectedActiveOrder = useMemo(
    () => activeOrders?.find(order => order.b_id === selectedOrder) ?? null,
    [activeOrders, selectedOrder],
  )
  // Do not memoize only by b_id: the passenger can choose a driver while the same order
  // stays selected. Re-read local storage on each render so other candidates/routes disappear
  // immediately after the real click on “Выбрать”.
  const confirmedChoiceId = passengerChoiceVersion >= 0 ? getPassengerConfirmedChoice(selectedActiveOrder?.b_id) : null
  const rejectedChoiceIds = passengerChoiceVersion >= 0 ? getPassengerRejectedChoices(selectedActiveOrder?.b_id) : []
  const rejectedChoiceIdSet = useMemo(() => new Set(rejectedChoiceIds.map(String)), [rejectedChoiceIds.join('|')])

  useInterval(() => {
    if (document.hidden || !selectedActiveOrder || !isChoiceOrder(selectedActiveOrder) || !confirmedChoiceId)
      return

    setChoiceVisualMoveTick(value => value + 1)
  }, 1000)

  const hasAssignedSelectedOrderDriver = useMemo(() => {
    const drivers = (selectedActiveOrder?.drivers ?? []).filter(driver =>
      !rejectedChoiceIdSet.has(String(driver.u_id)) &&
      !rejectedChoiceIdSet.has(String(driver.c_id ?? '')),
    )

    if (isChoiceOrder(selectedActiveOrder)) {
      if (confirmedChoiceId) {
        return drivers.some(driver =>
          String(driver.u_id) === String(confirmedChoiceId) &&
          [
            EBookingDriverState.Performer,
            EBookingDriverState.Arrived,
            EBookingDriverState.Started,
          ].includes(driver.c_state),
        )
      }

      return false
    }

    return drivers.some(driver => [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
    ].includes(driver.c_state))
  }, [selectedActiveOrder, confirmedChoiceId, rejectedChoiceIds.join('|'), emulatorLocationVersion])

  const selectedOrderDrivers = useMemo(() => {
    const drivers = selectedActiveOrder?.drivers ?? []
    const driversWithCoordinates = drivers
      .map(driver => {
        let visibleDriver = driver

        const emulatorLocation = getEmulatedDriverLocation(driver)
        if (emulatorLocation) {
          visibleDriver = {
            ...driver,
            c_latitude: emulatorLocation.latitude,
            c_longitude: emulatorLocation.longitude,
          }
        }

        return makeSafeSelectedEmulatedDriver(
          makeVisibleCandidateDriver(visibleDriver, selectedActiveOrder, confirmedChoiceId),
          selectedActiveOrder,
          confirmedChoiceId,
        )
      })
      .filter(driver =>
        !!driver.c_latitude && !!driver.c_longitude &&
        !rejectedChoiceIdSet.has(String(driver.u_id)) &&
        !rejectedChoiceIdSet.has(String(driver.c_id ?? '')),
      )

    if (!isChoiceOrder(selectedActiveOrder))
      return driversWithCoordinates.filter(driver => driver.c_state > EBookingDriverState.Canceled)

    if (confirmedChoiceId) {
      return driversWithCoordinates.filter(driver =>
        String(driver.u_id) === String(confirmedChoiceId) &&
        [
          EBookingDriverState.Considering,
          EBookingDriverState.Performer,
          EBookingDriverState.Arrived,
          EBookingDriverState.Started,
        ].includes(driver.c_state),
      )
    }

    return driversWithCoordinates.filter(driver => isVisibleChoiceDriverState(driver.c_state))
  }, [selectedActiveOrder, confirmedChoiceId, rejectedChoiceIds.join('|'), emulatorLocationVersion])
  if (selectedOrderDrivers.length) {
    lastVisibleSelectedOrderDriversRef.current = selectedOrderDrivers
  } else if (!selectedActiveOrder || rejectedChoiceIdSet.size) {
    lastVisibleSelectedOrderDriversRef.current = []
  }

  const displayedSelectedOrderDrivers = selectedOrderDrivers.length ?
    selectedOrderDrivers :
    (selectedActiveOrder && !rejectedChoiceIdSet.size ? lastVisibleSelectedOrderDriversRef.current : [])

  useEffect(() => {
    if (!selectedActiveOrder || !displayedSelectedOrderDrivers.length) {
      lastDriverLocationLogByIdRef.current = {}
      return
    }

    const now = Date.now()
    const visibleDriverIds = new Set<string>()
    displayedSelectedOrderDrivers.forEach(driver => {
      if (!driver.c_latitude || !driver.c_longitude || !driver.u_id)
        return

      const driverId = String(driver.u_id)
      visibleDriverIds.add(driverId)
      const previous = lastDriverLocationLogByIdRef.current[driverId]
      const orderId = selectedActiveOrder.b_id ? String(selectedActiveOrder.b_id) : null
      const currentPoint: [number, number] = [driver.c_latitude, driver.c_longitude]
      const previousPoint: [number, number] | null = previous ?
        [previous.latitude, previous.longitude] :
        null
      const distanceFromPreviousKm = previousPoint ?
        distanceBetweenEarthCoordinates(previousPoint[0], previousPoint[1], currentPoint[0], currentPoint[1]) :
        null
      const secondsFromPrevious = previous ?
        Math.max(0, (now - previous.timestamp) / 1000) :
        null
      const speedKmh = distanceFromPreviousKm !== null && secondsFromPrevious && secondsFromPrevious > 0 ?
        distanceFromPreviousKm / secondsFromPrevious * 3600 :
        null
      const heading = previousPoint && distanceFromPreviousKm !== null && distanceFromPreviousKm > 0.001 ?
        getBearingDegrees(previousPoint, currentPoint) :
        null
      const shouldLog = !previous ||
        previous.orderId !== orderId ||
        previous.state !== driver.c_state ||
        (distanceFromPreviousKm !== null && distanceFromPreviousKm >= 0.005) ||
        (secondsFromPrevious !== null && secondsFromPrevious >= 10)

      if (!shouldLog)
        return

      writeFlowEvent('DRIVER_LOCATION_UPDATE', {
        orderId: selectedActiveOrder.b_id,
        driverId: driver.u_id,
        screen: 'PassengerMap',
        uiState: 'DriverLocationUpdate',
        data: {
          latitude: Number(driver.c_latitude.toFixed(6)),
          longitude: Number(driver.c_longitude.toFixed(6)),
          previousLatitude: previousPoint ? Number(previousPoint[0].toFixed(6)) : null,
          previousLongitude: previousPoint ? Number(previousPoint[1].toFixed(6)) : null,
          distanceFromPreviousKm: distanceFromPreviousKm === null ? null : Number(distanceFromPreviousKm.toFixed(3)),
          secondsFromPrevious: secondsFromPrevious === null ? null : Number(secondsFromPrevious.toFixed(1)),
          speedKmh: speedKmh === null ? null : Number(speedKmh.toFixed(1)),
          heading: heading === null ? null : Number(heading.toFixed(0)),
          accuracy: null,
          source: getDriverLocationSource(driver),
          driverState: driver.c_state,
          driver: summarizeDriver(driver),
        },
      })

      lastDriverLocationLogByIdRef.current[driverId] = {
        latitude: driver.c_latitude,
        longitude: driver.c_longitude,
        timestamp: now,
        state: driver.c_state,
        orderId,
      }
    })

    Object.keys(lastDriverLocationLogByIdRef.current).forEach(driverId => {
      if (!visibleDriverIds.has(driverId))
        delete lastDriverLocationLogByIdRef.current[driverId]
    })
  }, [
    selectedActiveOrder?.b_id,
    displayedSelectedOrderDrivers.map(driver =>
      `${driver.u_id}:${driver.c_state}:${driver.c_latitude}:${driver.c_longitude}`,
    ).join('|'),
  ])

  const shouldShowCenterMarker =
    type === EMapModalTypes.TakePassenger ||
    (type === EMapModalTypes.Client && !selectedActiveOrder)
  const shouldShowFromMarker = type !== EMapModalTypes.VotingNavigation

  let from: IAddressPoint | null = null,
    to: IAddressPoint | null = null
  switch (type) {
    case EMapModalTypes.Client:
      from = selectedActiveOrder?.b_start_latitude && selectedActiveOrder.b_start_longitude ? {
        latitude: selectedActiveOrder.b_start_latitude,
        longitude: selectedActiveOrder.b_start_longitude,
        address: selectedActiveOrder.b_start_address,
      } : clientFrom
      to = selectedActiveOrder?.b_destination_latitude && selectedActiveOrder.b_destination_longitude ? {
        latitude: selectedActiveOrder.b_destination_latitude,
        longitude: selectedActiveOrder.b_destination_longitude,
        address: selectedActiveOrder.b_destination_address,
      } : clientTo
      break
    case EMapModalTypes.OrderDetails:
      from = modalFrom || detailedOrderStart
      to = modalTo || detailedOrderDestination
      break
    case EMapModalTypes.VotingNavigation:
      from = modalFrom || userCoordinates || null
      to = modalTo || detailedOrderStart || null
      break
    case EMapModalTypes.TakePassenger:
      from = takePassengerFrom || null
      to = takePassengerTo || null
      break
    default:
      console.error('Wrong map type:', type)
      break
  }

  const routeKey = [
    from?.latitude,
    from?.longitude,
    to?.latitude,
    to?.longitude,
  ].join('|')

  useEffect(() => {
    setFrontendLogSnapshot('map', {
      type,
      isOpen,
      isModal,
      selectedOrder,
      selectedActiveOrder: summarizeOrder(selectedActiveOrder),
      confirmedChoiceId,
      rejectedChoiceIds,
      from: summarizePoint(from),
      to: summarizePoint(to),
      routeKey,
      routeInfo: summarizeRouteInfo(routeInfo),
      drivers: displayedSelectedOrderDrivers.map(summarizeDriver),
      driverRoutes: Object.keys(driverRouteInfoById || {}).reduce((acc, driverId) => {
        acc[driverId] = summarizeRouteInfo(driverRouteInfoById[driverId])
        return acc
      }, {} as Record<string, any>),
    })
  }, [
    type,
    isOpen,
    isModal,
    selectedOrder,
    selectedActiveOrder?.b_id,
    confirmedChoiceId,
    rejectedChoiceIds.join('|'),
    routeKey,
    routeInfo?.points?.length,
    displayedSelectedOrderDrivers.map(driver => `${driver.u_id}:${driver.c_state}:${driver.c_latitude}:${driver.c_longitude}`).join('|'),
    Object.keys(driverRouteInfoById || {}).map(driverId => `${driverId}:${driverRouteInfoById[driverId]?.points?.length || 0}`).join('|'),
  ])

  useEffect(() => {
    if (isOpen) {
      API.getWashTrips()
        .then(items => items.filter(item =>
          // @ts-ignore
          item.t_start_latitude && item.t_start_latitude === item.t_destination_latitude &&
          // @ts-ignore
          item.t_start_datetime?.format && item.t_complete_datetime?.format &&
          // @ts-ignore
          item.t_complete_datetime.isAfter(Date.now()),
        ))
        .then(items => {
          // @ts-ignore
          const markers = items.map(item => ({
            // @ts-ignore
            latitude: item.t_start_latitude,
            // @ts-ignore
            longitude: item.t_start_longitude,
            // @ts-ignore
            popup: `${item.t_start_datetime.format('DD.MM HH:mm')} - ${item.t_complete_datetime.format('DD.MM HH:mm')}`,
            // @ts-ignore
            tooltip: item.t_complete_datetime.format('DD.MM HH:mm'),
          }))
          setStaticMarkers(markers)
        })
    }
  }, [isOpen])

  useEffect(() => {
    if (!map) return undefined

    let cancelled = false

    const handleLocationFound = (e: L.LocationEvent) => {
      if (cancelled) return

      const point = {
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
      }
      setUserCoordinates(point)
      saveLastBrowserGeolocation(point)
      setUserCoordinatesAccuracy(e.accuracy)
      if (!defaultCenter && isLeafletMapConnected(map))
        safeLeafletAction(() => map.setView(e.latlng))
    }

    const handleLocationError = (_e: L.ErrorEvent) => {
      // Геолокация может быть запрещена браузером. Не валим экран и не спамим консоль.
    }

    map.once('locationfound', handleLocationFound)
    map.once('locationerror', handleLocationError)
    map.locate({
      timeout: Infinity,
      enableHighAccuracy: true,
    })

    return () => {
      cancelled = true
      safeLeafletAction(() => {
        map.off('locationfound', handleLocationFound)
        map.off('locationerror', handleLocationError)
        map.stopLocate()
      })
    }
  }, [map, defaultCenter])

  useInterval(() => {
    if (document.hidden || passengerGeoRequestPendingRef.current) return

    const now = Date.now()
    if (now - lastPassengerGeoRequestAtRef.current < PASSENGER_GEOLOCATION_POLL_INTERVAL_MS) return
    lastPassengerGeoRequestAtRef.current = now
    passengerGeoRequestPendingRef.current = true

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        passengerGeoRequestPendingRef.current = false
        const point = {
          latitude: coords.latitude,
          longitude: coords.longitude,
        }
        setUserCoordinates(point)
        saveLastBrowserGeolocation(point)
        setUserCoordinatesAccuracy(coords.accuracy)
      },
      _error => {
        passengerGeoRequestPendingRef.current = false
      },
      { enableHighAccuracy: true },
    )
  }, PASSENGER_GEOLOCATION_POLL_INTERVAL_MS)

  useEffect(() => {
    if (defaultCenter && isLeafletMapConnected(map))
      safeLeafletAction(() => map.panTo(defaultCenter))
  }, [defaultCenter, map])

  useEffect(() => {
    if (!isLeafletMapConnected(map))
      return undefined

    const frame = window.requestAnimationFrame(() => {
      if (isLeafletMapConnected(map))
        safeLeafletAction(() => map.invalidateSize())
    })
    const timers = [80, 240].map(delay =>
      window.setTimeout(() => {
        if (isLeafletMapConnected(map))
          safeLeafletAction(() => map.invalidateSize())
      }, delay),
    )
    return () => {
      window.cancelAnimationFrame(frame)
      timers.forEach(timer => window.clearTimeout(timer))
    }
  }, [isOpen, map, containerClassName, selectedOrder, selectedActiveOrder?.b_id])

  useEffect(() => {
    function syncCenter() {
      if (!isLeafletRuntimeReady(map))
        return

      safeLeafletAction(() => {
        const { lat, lng } = map.getCenter()
        setCenter([lat, lng])
      })
    }

    syncCenter()
    safeLeafletAction(() => map.on('moveend', syncCenter))
    return () => {
      safeLeafletAction(() => map.off('moveend', syncCenter))
    }
  }, [map, setCenter])

  useEffect(() => {
    const nextOrderId = selectedActiveOrder?.b_id ? String(selectedActiveOrder.b_id) : null
    if (!nextOrderId || lastSelectedOrderIdRef.current === nextOrderId)
      return

    writeFrontendLog('map.selectedOrder.changed', {
      previousOrderId: lastSelectedOrderIdRef.current,
      nextOrderId,
      selectedOrder,
      order: summarizeOrder(selectedActiveOrder),
    })

    lastSelectedOrderIdRef.current = nextOrderId
    lastOrderRouteInfoRef.current = null
    lastDriverRouteInfoByIdRef.current = {}
    lastDriverRouteMetaByIdRef.current = {}
    lastVisibleSelectedOrderDriversRef.current = []
    lastActivePolylinesLogKeyRef.current = ''
    lastActivePolylinesByIdRef.current = {}
    lastDriverLocationLogByIdRef.current = {}
    setRouteInfo(null)
    setDriverRouteInfoById({})
  }, [selectedActiveOrder?.b_id])

  useEffect(() => {
    const stableRouteCacheKey = getStableSelectedOrderRouteKey(
      selectedOrder || selectedActiveOrder?.b_id,
      from,
      to,
    )

    if (!from?.latitude || !from?.longitude || !to?.latitude || !to?.longitude) {
      writeFrontendLog('map.mainRoute.missingCoordinates', {
        selectedOrder,
        orderId: selectedActiveOrder?.b_id,
        from: summarizePoint(from),
        to: summarizePoint(to),
        hasLastRoute: Boolean(lastOrderRouteInfoRef.current?.points?.length),
      })
      setShowRouteInfo(false)
      // During live passenger order polling the selected order may briefly come without full
      // coordinates. Do not remove the already drawn line in that moment, otherwise the passenger
      // sees the route blink/disappear exactly when the driver changes state.
      if (selectedOrder && lastOrderRouteInfoRef.current?.points?.length) {
        setRouteInfo(lastOrderRouteInfoRef.current)
      } else if (!selectedOrder) {
        lastOrderRouteInfoRef.current = null
        setRouteInfo(null)
      }
      return
    }

    const cachedStableRoute = stableRouteCacheKey ? stableSelectedOrderRouteCache.get(stableRouteCacheKey) : null
    if (selectedOrder && cachedStableRoute?.points?.length) {
      writeFrontendLog('map.mainRoute.useStableCache', {
        selectedOrder,
        orderId: selectedActiveOrder?.b_id,
        stableRouteCacheKey,
        route: summarizeRouteInfo(cachedStableRoute),
      })
      lastOrderRouteInfoRef.current = cachedStableRoute
      setRouteInfo(cachedStableRoute)
      setShowRouteInfo(false)
      return
    }

    const shouldKeepStableSelectedOrderRoute = Boolean(
      selectedOrder &&
      lastOrderRouteInfoRef.current?.points?.length,
    )

    if (shouldKeepStableSelectedOrderRoute) {
      writeFrontendLog('map.mainRoute.keepLastRoute', {
        selectedOrder,
        orderId: selectedActiveOrder?.b_id,
        routeKey,
        route: summarizeRouteInfo(lastOrderRouteInfoRef.current),
      })
      setRouteInfo(lastOrderRouteInfoRef.current)
      setShowRouteInfo(false)
      return
    }

    let changed = false

    writeFrontendLog('map.mainRoute.request', {
      selectedOrder,
      orderId: selectedActiveOrder?.b_id,
      routeKey,
      from: summarizePoint(from),
      to: summarizePoint(to),
      hasWayGraph: Boolean(wayGraph),
    })
    writeFlowEvent('ROUTE_MAIN_REQUESTED', {
      orderId: selectedActiveOrder?.b_id,
      screen: 'PassengerMap',
      uiState: selectedOrder ? 'SelectedOrderRouteBuild' : 'DraftRouteBuild',
      data: {
        selectedOrder,
        routeKey,
        from: summarizePoint(from),
        to: summarizePoint(to),
        hasWayGraph: Boolean(wayGraph),
      },
    })

    makeRoutePointsSafe(from, to, wayGraph, 'main-order', {
      orderId: selectedActiveOrder?.b_id,
      screen: 'PassengerMap',
      uiState: selectedOrder ? 'SelectedOrderRouteBuild' : 'DraftRouteBuild',
      data: {
        selectedOrder,
        routeKey,
      },
    })
      .then((info) => {
        if (changed)
          return

        if (info) {
          writeFrontendLog('map.mainRoute.success', {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            routeKey,
            route: summarizeRouteInfo(info),
          })
          writeFlowEvent('ROUTE_MAIN_READY', {
            orderId: selectedActiveOrder?.b_id,
            screen: 'PassengerMap',
            uiState: selectedOrder ? 'SelectedOrderRouteReady' : 'DraftRouteReady',
            data: {
              selectedOrder,
              routeKey,
              route: summarizeRouteInfo(info),
            },
          })
          lastOrderRouteInfoRef.current = info
          if (stableRouteCacheKey)
            rememberStableSelectedOrderRoute(stableRouteCacheKey, info)
          setRouteInfo(info)
        } else if (lastOrderRouteInfoRef.current) {
          setRouteInfo(lastOrderRouteInfoRef.current)
        }
        setShowRouteInfo(!selectedOrder)
        window.setTimeout(() => {
          if (!changed)
            setShowRouteInfo(false)
        }, 5000)
      })
      .catch((error) => {
        writeFrontendLog('map.mainRoute.failed', {
          selectedOrder,
          orderId: selectedActiveOrder?.b_id,
          routeKey,
          message: error instanceof Error ? error.message : String(error),
          fallbackRoute: summarizeRouteInfo(lastOrderRouteInfoRef.current),
        })
        if (!changed && lastOrderRouteInfoRef.current)
          setRouteInfo(lastOrderRouteInfoRef.current)
      })

    return () => {
      changed = true
    }
  }, [routeKey, wayGraph, selectedActiveOrder?.b_id, selectedOrder])

  useEffect(() => {
    if (!selectedActiveOrder) {
      writeFrontendLog('map.driverRoutes.noSelectedActiveOrder', {
        selectedOrder,
        keepLastRoutes: Boolean(selectedOrder),
      })
      if (!selectedOrder) {
        lastDriverRouteInfoByIdRef.current = {}
        lastDriverStateFlowByIdRef.current = {}
        lastDriverGeofenceKeyByIdRef.current = {}
        lastDriverMatchingKeyByIdRef.current = {}
        setDriverRouteInfoById({})
      } else {
        setDriverRouteInfoById(lastDriverRouteInfoByIdRef.current)
      }
      return
    }

    if (!displayedSelectedOrderDrivers.length) {
      writeFrontendLog('map.driverRoutes.noDisplayedDrivers', {
        selectedOrder,
        orderId: selectedActiveOrder?.b_id,
        rejectedChoiceIds,
        confirmedChoiceId,
        isChoice: isChoiceOrder(selectedActiveOrder),
        cachedRoutesCount: Object.keys(lastDriverRouteInfoByIdRef.current || {}).length,
      })
      if (rejectedChoiceIdSet.size || (isChoiceOrder(selectedActiveOrder) && !confirmedChoiceId)) {
        lastDriverRouteInfoByIdRef.current = {}
        lastDriverRouteMetaByIdRef.current = {}
        lastDriverStateFlowByIdRef.current = {}
        lastDriverGeofenceKeyByIdRef.current = {}
        lastDriverMatchingKeyByIdRef.current = {}
        setDriverRouteInfoById({})
        return
      }

      // Keep the last passenger-visible driver route while polling refreshes driver data.
      // It prevents the "driver -> client / destination" line and marker from disappearing between states.
      setDriverRouteInfoById(lastDriverRouteInfoByIdRef.current)
      return
    }

    let changed = false

    writeFlowEvent('MAP_UPDATE_TRIGGERED', {
      orderId: selectedActiveOrder?.b_id,
      screen: 'PassengerMap',
      uiState: 'DriverRoutesUpdate',
      data: {
        reason: 'driver_position_or_state_changed',
        selectedOrder,
        driversCount: displayedSelectedOrderDrivers.length,
        confirmedChoiceId,
        rejectedChoiceIdsCount: rejectedChoiceIds.length,
      },
    })

    const targetForDriver = (driverState: EBookingDriverState): IAddressPoint | null => {
      if (
        driverState === EBookingDriverState.Started &&
        selectedActiveOrder.b_destination_latitude &&
        selectedActiveOrder.b_destination_longitude
      ) {
        return {
          latitude: selectedActiveOrder.b_destination_latitude,
          longitude: selectedActiveOrder.b_destination_longitude,
          address: selectedActiveOrder.b_destination_address,
        }
      }

      if (selectedActiveOrder.b_start_latitude && selectedActiveOrder.b_start_longitude) {
        return {
          latitude: selectedActiveOrder.b_start_latitude,
          longitude: selectedActiveOrder.b_start_longitude,
          address: selectedActiveOrder.b_start_address,
        }
      }

      return null
    }

    Promise.all(
      displayedSelectedOrderDrivers.map(async(driver) => {
        const to = targetForDriver(driver.c_state)
        const driverId = String(driver.u_id)
        if (!to || !driver.c_latitude || !driver.c_longitude) {
          const matchingKey = `${selectedActiveOrder?.b_id || ''}:${driverId}:${driver.c_state}:rejected:missing_data`
          if (lastDriverMatchingKeyByIdRef.current[driverId] !== matchingKey) {
            lastDriverMatchingKeyByIdRef.current[driverId] = matchingKey
            writeFlowEvent('ORDER_MATCHING_EVALUATED', {
              orderId: selectedActiveOrder?.b_id,
              driverId: driver.u_id,
              screen: 'PassengerMap',
              uiState: 'DriverRouteMatching',
              data: {
                result: 'rejected',
                reason: 'missing_driver_or_target_coordinates',
                driver: summarizeDriver(driver),
                target: summarizePoint(to),
              },
            })
          }
          writeFrontendLog('map.driverRoute.skipMissingData', {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            driver: summarizeDriver(driver),
            target: summarizePoint(to),
          })
          return [driver.u_id, null] as const
        }

        const fromPoint: [number, number] = [driver.c_latitude, driver.c_longitude]
        const toPoint: [number, number] = [to.latitude!, to.longitude!]
        const directDistanceToTargetKm = distanceBetweenEarthCoordinates(fromPoint[0], fromPoint[1], toPoint[0], toPoint[1])
        const matchingResult = isChoiceOrder(selectedActiveOrder) && directDistanceToTargetKm > MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM ?
          'rejected' :
          'accepted'
        const matchingReason = matchingResult === 'rejected' ?
          'driver_too_far_from_target' :
          'visible_driver_with_target'
        const matchingDistanceBucket = Math.round(directDistanceToTargetKm * 10) / 10
        const matchingKey = `${selectedActiveOrder?.b_id || ''}:${driverId}:${driver.c_state}:${matchingResult}:${matchingDistanceBucket}`
        if (lastDriverMatchingKeyByIdRef.current[driverId] !== matchingKey) {
          lastDriverMatchingKeyByIdRef.current[driverId] = matchingKey
          writeFlowEvent('ORDER_MATCHING_EVALUATED', {
            orderId: selectedActiveOrder?.b_id,
            driverId: driver.u_id,
            screen: 'PassengerMap',
            uiState: 'DriverRouteMatching',
            data: {
              result: matchingResult,
              reason: matchingReason,
              driver: summarizeDriver(driver),
              driverState: driver.c_state,
              distanceToTargetKm: Number(directDistanceToTargetKm.toFixed(3)),
              maxChoiceDistanceKm: MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM,
              target: summarizePoint(to),
            },
          })
        }
        const previousMeta = lastDriverRouteMetaByIdRef.current[driverId]
        const previousRoute = lastDriverRouteInfoByIdRef.current[driverId]
        const previousDriverState = lastDriverStateFlowByIdRef.current[driverId]

        if (previousDriverState !== undefined && previousDriverState !== driver.c_state) {
          writeFlowEvent('DRIVER_STATE_CHANGED', {
            orderId: selectedActiveOrder?.b_id,
            driverId: driver.u_id,
            screen: 'PassengerMap',
            uiState: 'DriverStateChanged',
            data: {
              fromState: previousDriverState,
              toState: driver.c_state,
              reason: driver.c_state === EBookingDriverState.Arrived ?
                'gps_enter_pickup_radius' :
                'poll_diff_applied',
              driver: summarizeDriver(driver),
              distanceToTargetKm: Number(directDistanceToTargetKm.toFixed(3)),
            },
          })
        }
        lastDriverStateFlowByIdRef.current[driverId] = driver.c_state

        if (directDistanceToTargetKm <= SHORT_ROUTE_DIRECT_DISTANCE_KM) {
          const geofenceZone = driver.c_state === EBookingDriverState.Started ? 'destination' : 'pickup'
          const geofenceKey = `${selectedActiveOrder?.b_id || ''}:${geofenceZone}:${driver.c_state}`
          if (lastDriverGeofenceKeyByIdRef.current[driverId] !== geofenceKey) {
            lastDriverGeofenceKeyByIdRef.current[driverId] = geofenceKey
            writeFlowEvent('GEOFENCE_ENTERED', {
              orderId: selectedActiveOrder?.b_id,
              driverId: driver.u_id,
              screen: 'PassengerMap',
              uiState: 'DriverNearTarget',
              data: {
                zone: geofenceZone,
                radiusMeters: Math.round(SHORT_ROUTE_DIRECT_DISTANCE_KM * 1000),
                distanceMeters: Math.round(directDistanceToTargetKm * 1000),
                driverState: driver.c_state,
                driver: summarizeDriver(driver),
              },
            })
          }
        } else {
          const previousGeofenceKey = lastDriverGeofenceKeyByIdRef.current[driverId]
          if (previousGeofenceKey) {
            const [, previousZone = 'unknown'] = previousGeofenceKey.split(':')
            writeFlowEvent('GEOFENCE_EXITED', {
              orderId: selectedActiveOrder?.b_id,
              driverId: driver.u_id,
              screen: 'PassengerMap',
              uiState: 'DriverLeftTargetZone',
              data: {
                zone: previousZone,
                radiusMeters: Math.round(SHORT_ROUTE_DIRECT_DISTANCE_KM * 1000),
                distanceMeters: Math.round(directDistanceToTargetKm * 1000),
                driverState: driver.c_state,
                driver: summarizeDriver(driver),
              },
            })
          }
          delete lastDriverGeofenceKeyByIdRef.current[driverId]
        }

        if (isChoiceOrder(selectedActiveOrder) && directDistanceToTargetKm > MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM) {
          writeFrontendLog('map.driverRoute.skipTooFar', {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            driver: summarizeDriver(driver),
            state: driver.c_state,
            distanceToTargetKm: Number(directDistanceToTargetKm.toFixed(2)),
            fromPoint,
            toPoint,
          })
          delete lastDriverRouteInfoByIdRef.current[driverId]
          delete lastDriverRouteMetaByIdRef.current[driverId]
          return [driver.u_id, null] as const
        }

        if (
          previousRoute?.points?.length &&
          previousMeta &&
          previousMeta.state === driver.c_state &&
          distanceBetweenEarthCoordinates(previousMeta.to[0], previousMeta.to[1], toPoint[0], toPoint[1]) < 0.03
        ) {
          const routeDistanceAnalysis = getRouteDistanceAnalysisKm(previousRoute.points, fromPoint)
          const distanceToSavedRoute = routeDistanceAnalysis.distanceToRouteKm

          // The route is requested once for the current target/status and then trimmed
          // visually from the current car position. Reroute only when the car is really
          // far from the cached polyline. Always log nearest route point so a bad cache
          // decision can be diagnosed from the exported file.
          const isSelectedChoiceDriverRoute = Boolean(
            isChoiceOrder(selectedActiveOrder) &&
            confirmedChoiceId &&
            String(driverId) === String(confirmedChoiceId),
          )
          const maxCacheDistanceToLineKm = isSelectedChoiceDriverRoute ?
            SELECTED_DRIVER_ROUTE_CACHE_DISTANCE_TO_LINE_KM :
            MAX_DRIVER_ROUTE_CACHE_DISTANCE_TO_LINE_KM
          const remainingRoute = makeRemainingRouteInfo(previousRoute, fromPoint) || previousRoute
          const cacheDecisionData = {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            driver: summarizeDriver(driver),
            state: driver.c_state,
            currentDriverPoint: fromPoint,
            targetPoint: toPoint,
            routeStartPoint: previousRoute.points[0],
            routeEndPoint: previousRoute.points[previousRoute.points.length - 1],
            distanceToSavedRouteKm: Number.isFinite(distanceToSavedRoute) ?
              Number(distanceToSavedRoute.toFixed(3)) :
              null,
            maxCacheDistanceKm: maxCacheDistanceToLineKm,
            cachePolicy: isSelectedChoiceDriverRoute ? 'selected-choice-driver-stable' : 'candidate-driver-strict',
            cachePolicyReason: isSelectedChoiceDriverRoute ?
              'selected_driver_marker_stability' :
              'candidate_route_should_follow_position_closer',
            routeDistanceAnalysis: summarizeRouteDistanceAnalysis(routeDistanceAnalysis),
            route: summarizeRouteInfo(previousRoute),
            remainingRoute: summarizeRouteInfo(remainingRoute),
          }

          if ((Number(previousRoute.distance) || 0) <= MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM && distanceToSavedRoute < maxCacheDistanceToLineKm) {
            writeFrontendLog('map.driverRoute.reuseCachedRoute', {
              ...cacheDecisionData,
              reuseReason: 'driver_close_to_cached_polyline',
            })
            setPassengerPickupEta(selectedActiveOrder.b_id, driver, formatPickupRouteDuration(remainingRoute))
            return [driver.u_id, remainingRoute] as const
          }

          writeFrontendLog('map.driverRoute.cacheInvalidated', {
            ...cacheDecisionData,
            invalidateReason: !Number.isFinite(distanceToSavedRoute) ?
              'distance_to_cached_route_unavailable' :
              'driver_too_far_from_cached_polyline',
          })
        }

        try {
          writeFrontendLog('map.driverRoute.request', {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            driver: summarizeDriver(driver),
            state: driver.c_state,
            from: summarizePoint({ latitude: driver.c_latitude, longitude: driver.c_longitude }),
            to: summarizePoint(to),
            hasPreviousRoute: Boolean(previousRoute?.points?.length),
            previousMeta,
          })
          writeFlowEvent('ROUTE_DRIVER_REQUESTED', {
            orderId: selectedActiveOrder?.b_id,
            driverId: driver.u_id,
            screen: 'PassengerMap',
            uiState: driver.c_state === EBookingDriverState.Performer ? 'SelectedDriverRouteBuild' : 'CandidateRouteBuild',
            data: {
              selectedOrder,
              driver: summarizeDriver(driver),
              state: driver.c_state,
              from: summarizePoint({ latitude: driver.c_latitude, longitude: driver.c_longitude }),
              to: summarizePoint(to),
              hasPreviousRoute: Boolean(previousRoute?.points?.length),
              previousMeta,
            },
          })
          const route = await makeRoutePointsSafe(
            { latitude: driver.c_latitude, longitude: driver.c_longitude },
            to,
            wayGraph,
            `driver-${driverId}`,
            {
              orderId: selectedActiveOrder?.b_id,
              driverId: driver.u_id,
              screen: 'PassengerMap',
              uiState: driver.c_state === EBookingDriverState.Performer ? 'SelectedDriverRouteBuild' : 'CandidateRouteBuild',
              data: {
                selectedOrder,
                driverState: driver.c_state,
                distanceToTargetKm: Number(directDistanceToTargetKm.toFixed(3)),
              },
            },
          )
          if (route && (Number(route.distance) || 0) > MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM) {
            writeFrontendLog('map.driverRoute.tooFarRejected', {
              selectedOrder,
              orderId: selectedActiveOrder?.b_id,
              driver: summarizeDriver(driver),
              route: summarizeRouteInfo(route),
            })
            delete lastDriverRouteInfoByIdRef.current[driverId]
            delete lastDriverRouteMetaByIdRef.current[driverId]
            return [driver.u_id, null] as const
          }

          if (route) {
            writeFrontendLog('map.driverRoute.success', {
              selectedOrder,
              orderId: selectedActiveOrder?.b_id,
              driver: summarizeDriver(driver),
              route: summarizeRouteInfo(route),
            })
            writeFlowEvent('ROUTE_DRIVER_READY', {
              orderId: selectedActiveOrder?.b_id,
              driverId: driver.u_id,
              screen: 'PassengerMap',
              uiState: driver.c_state === EBookingDriverState.Performer ? 'SelectedDriverRouteReady' : 'CandidateRouteReady',
              data: {
                selectedOrder,
                driver: summarizeDriver(driver),
                route: summarizeRouteInfo(route),
              },
            })
            lastDriverRouteMetaByIdRef.current[driverId] = { from: fromPoint, to: toPoint, state: driver.c_state }
            setPassengerPickupEta(selectedActiveOrder.b_id, driver, formatPickupRouteDuration(route))
          }
          return [driver.u_id, route] as const
        } catch (error) {
          writeFrontendLog('map.driverRoute.failed', {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            driver: summarizeDriver(driver),
            message: error instanceof Error ? error.message : String(error),
            fallbackRoute: summarizeRouteInfo(previousRoute),
          })
          const remainingRoute = makeRemainingRouteInfo(previousRoute, fromPoint)
          if (remainingRoute)
            setPassengerPickupEta(selectedActiveOrder.b_id, driver, formatPickupRouteDuration(remainingRoute))
          return [driver.u_id, previousRoute || null] as const
        }
      }),
    ).then(items => {
      if (changed) return

      setDriverRouteInfoById(prev => {
        const visibleDriverIds = new Set(displayedSelectedOrderDrivers.map(driver => String(driver.u_id)))
        const next: Record<string, IRouteInfo | null> = {}

        for (const [driverId, route] of items) {
          const key = String(driverId)
          if (!visibleDriverIds.has(key))
            continue

          if (route)
            next[key] = route
          else if (prev[key])
            next[key] = prev[key]
        }

        const prevKeys = Object.keys(prev).sort()
        const nextKeys = Object.keys(next).sort()
        const removedRouteKeys = prevKeys.filter(key => !nextKeys.includes(key))
        removedRouteKeys.forEach(driverId => {
          writeFlowEvent('DRIVER_ROUTE_REMOVED', {
            orderId: selectedActiveOrder?.b_id,
            driverId,
            screen: 'PassengerMap',
            uiState: 'DriverRoutesUpdate',
            data: {
              reason: visibleDriverIds.has(driverId) ? 'route_not_available' : 'driver_not_visible',
              previousRoute: summarizeRouteInfo(prev[driverId]),
              visibleDriverIds: Array.from(visibleDriverIds),
            },
          })
        })
        const hasChanged = prevKeys.length !== nextKeys.length || nextKeys.some(key => prev[key] !== next[key])

        if (!hasChanged) {
          writeFrontendLog('map.driverRoutes.unchanged', {
            selectedOrder,
            orderId: selectedActiveOrder?.b_id,
            routesCount: Object.keys(prev).length,
          })
          lastDriverRouteInfoByIdRef.current = prev
          return prev
        }

        lastDriverRouteInfoByIdRef.current = next
        lastDriverRouteMetaByIdRef.current = Object.keys(lastDriverRouteMetaByIdRef.current || {}).reduce((acc, driverId) => {
          const meta = lastDriverRouteMetaByIdRef.current[driverId]
          if (visibleDriverIds.has(String(driverId)) && next[driverId] && meta)
            acc[driverId] = meta
          return acc
        }, {} as Record<string, { from: [number, number], to: [number, number], state: EBookingDriverState }>)
        writeFrontendLog('map.driverRoutes.updated', {
          selectedOrder,
          orderId: selectedActiveOrder?.b_id,
          routes: Object.keys(next).reduce((acc, driverId) => {
            acc[driverId] = summarizeRouteInfo(next[driverId])
            return acc
          }, {} as Record<string, any>),
        })
        return next
      })
    })

    return () => {
      changed = true
    }
  }, [
    selectedActiveOrder?.b_id,
    selectedActiveOrder?.b_start_latitude,
    selectedActiveOrder?.b_start_longitude,
    selectedActiveOrder?.b_destination_latitude,
    selectedActiveOrder?.b_destination_longitude,
    displayedSelectedOrderDrivers.map(driver =>
      `${driver.u_id}:${driver.c_state}:${driver.c_latitude}:${driver.c_longitude}`,
    ).join('|'),
    selectedOrder,
    wayGraph,
    confirmedChoiceId,
    rejectedChoiceIds.join('|'),
  ])

  const formatRouteDuration = formatPickupRouteDuration
  const duration = formatRouteDuration(routeInfo)
  const isPickupEtaDriver = (driver: IDriver) => {
    const state = driver.c_state
    const isGoingToPickup = [
      EBookingDriverState.Performer,
      EBookingDriverState.Considering,
    ].includes(state)

    if (!isGoingToPickup)
      return false

    if (!isChoiceOrder(selectedActiveOrder))
      return true

    if (!confirmedChoiceId)
      return false

    return String(driver.u_id) === String(confirmedChoiceId)
  }
  const getDriverRouteEtaInfo = (driver?: IDriver | null) => {
    if (!driver?.u_id)
      return null

    const fullRoute = driverRouteInfoById[driver.u_id]
    if (!fullRoute)
      return null

    const driverPosition: [number, number] | null = driver.c_latitude && driver.c_longitude ?
      [driver.c_latitude, driver.c_longitude] :
      null

    return makeRemainingRouteInfo(fullRoute, driverPosition) || fullRoute
  }
  const pickupEtaDriver = displayedSelectedOrderDrivers.find(isPickupEtaDriver)
  const pickupEtaDuration = pickupEtaDriver ? formatRouteDuration(getDriverRouteEtaInfo(pickupEtaDriver)) : ''
  const driverColorSourceDrivers = selectedActiveOrder?.drivers?.length ? selectedActiveOrder.drivers : displayedSelectedOrderDrivers
  const selectedOrderDriverIds = new Set(displayedSelectedOrderDrivers.map(driver => String(driver.u_id)))
  const hideCandidateRoutesAfterChoice = Boolean(isChoiceOrder(selectedActiveOrder) && confirmedChoiceId)
  const cachedDriverRoutes: Array<[string, IRouteInfo]> = (isChoiceOrder(selectedActiveOrder) || hasAssignedSelectedOrderDriver || hideCandidateRoutesAfterChoice) ? [] : Object.entries(driverRouteInfoById).filter(([driverId, info]) =>
    !!info?.points?.length &&
    !selectedOrderDriverIds.has(String(driverId)) &&
    !rejectedChoiceIdSet.has(String(driverId)),
  ) as Array<[string, IRouteInfo]>
  const isSelectedOrderTripStarted = Boolean(
    selectedOrder &&
    displayedSelectedOrderDrivers.some(driver => driver.c_state === EBookingDriverState.Started),
  )
  const shouldRenderMainOrderRoute = Boolean(routeInfo?.points?.length && !isSelectedOrderTripStarted)

  useEffect(() => {
    const activePolylines: Array<Record<string, any>> = []

    if (shouldRenderMainOrderRoute && routeInfo?.points?.length) {
      activePolylines.push({
        polylineId: `main-${selectedActiveOrder?.b_id || 'draft'}`,
        routeType: selectedOrder ? 'order-main-pickup-to-destination' : 'draft-main-route',
        orderId: selectedActiveOrder?.b_id ?? null,
        orderState: selectedActiveOrder?.b_state ?? null,
        driverState: null,
        route: summarizeRouteInfo(routeInfo),
      })
    }

    cachedDriverRoutes.forEach(([driverId, info]) => {
      activePolylines.push({
        polylineId: `cached-driver-${driverId}`,
        routeType: 'cached-driver-route',
        orderId: selectedActiveOrder?.b_id ?? null,
        orderState: selectedActiveOrder?.b_state ?? null,
        driverId,
        driverState: null,
        route: summarizeRouteInfo(info),
      })
    })

    displayedSelectedOrderDrivers.forEach(driver => {
      const rawDriverRouteInfo = driverRouteInfoById[driver.u_id]
      const driverRouteInfo = rawDriverRouteInfo && (Number(rawDriverRouteInfo.distance) || 0) <= MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM ? rawDriverRouteInfo : null
      const visualDriverPosition = getChoiceVisualDriverPosition(
        driver,
        driverRouteInfo,
        selectedActiveOrder,
        confirmedChoiceId,
        Date.now() + choiceVisualMoveTick,
      )
      const driverPosition: [number, number] = visualDriverPosition || [driver.c_latitude!, driver.c_longitude!]
      const driverDistanceToRouteKm = getDistanceToRouteKm(driverRouteInfo?.points, driverPosition)
      const isSelectedChoiceDriver = Boolean(
        isChoiceOrder(selectedActiveOrder) &&
        confirmedChoiceId &&
        String(driver.u_id) === String(confirmedChoiceId),
      )
      const maxRenderDistanceToLineKm = isSelectedChoiceDriver ?
        SELECTED_DRIVER_ROUTE_RENDER_DISTANCE_TO_LINE_KM :
        MAX_DRIVER_ROUTE_RENDER_DISTANCE_TO_LINE_KM
      const isDriverRouteCloseEnough = driverDistanceToRouteKm <= maxRenderDistanceToLineKm

      if (driverRouteInfo?.points?.length && isDriverRouteCloseEnough) {
        activePolylines.push({
          polylineId: `driver-${driver.u_id}`,
          routeType: driver.c_state === EBookingDriverState.Started ?
            'driver-current-trip-to-destination' :
            'driver-pickup-to-client',
          orderId: selectedActiveOrder?.b_id ?? null,
          orderState: selectedActiveOrder?.b_state ?? null,
          driverId: driver.u_id,
          driverState: driver.c_state,
          route: summarizeRouteInfo(driverRouteInfo),
          distanceToRouteKm: Number.isFinite(driverDistanceToRouteKm) ?
            Number(driverDistanceToRouteKm.toFixed(3)) :
            null,
        })
      }
    })

    const activePolylinesKey = JSON.stringify(activePolylines.map(item => ({
      polylineId: item.polylineId,
      routeType: item.routeType,
      orderState: item.orderState,
      driverId: item.driverId ?? null,
      driverState: item.driverState ?? null,
      distance: (item.route as any)?.distance ?? null,
      pointsCount: (item.route as any)?.pointsCount ?? null,
    })))

    const nextActivePolylinesById = activePolylines.reduce((acc, item) => {
      acc[String(item.polylineId)] = item
      return acc
    }, {} as Record<string, any>)
    const previousActivePolylinesById = lastActivePolylinesByIdRef.current || {}
    const addedPolylines = Object.keys(nextActivePolylinesById)
      .filter(polylineId => !previousActivePolylinesById[polylineId])
      .map(polylineId => nextActivePolylinesById[polylineId])
    const removedPolylines = Object.keys(previousActivePolylinesById)
      .filter(polylineId => !nextActivePolylinesById[polylineId])
      .map(polylineId => previousActivePolylinesById[polylineId])

    addedPolylines.forEach(polyline => {
      writeFrontendLog('map.polyline.added', {
        selectedOrder,
        orderId: selectedActiveOrder?.b_id,
        orderState: selectedActiveOrder?.b_state ?? null,
        polyline,
      })
      writeFlowEvent('MAP_POLYLINE_ADDED', {
        orderId: selectedActiveOrder?.b_id,
        driverId: polyline.driverId ?? null,
        screen: 'PassengerMap',
        uiState: 'ActivePolylines',
        data: {
          reason: 'polyline_became_visible',
          ...polyline,
        },
      })
    })

    removedPolylines.forEach(polyline => {
      writeFrontendLog('map.polyline.removed', {
        selectedOrder,
        orderId: selectedActiveOrder?.b_id,
        orderState: selectedActiveOrder?.b_state ?? null,
        polyline,
      })
      writeFlowEvent('MAP_POLYLINE_REMOVED', {
        orderId: selectedActiveOrder?.b_id,
        driverId: polyline.driverId ?? null,
        screen: 'PassengerMap',
        uiState: 'ActivePolylines',
        data: {
          reason: isSelectedOrderTripStarted && polyline.routeType === 'order-main-pickup-to-destination' ?
            'trip_started_hide_main_pickup_destination_polyline' :
            'polyline_became_hidden',
          ...polyline,
        },
      })
    })

    if (activePolylinesKey === lastActivePolylinesLogKeyRef.current)
      return

    lastActivePolylinesByIdRef.current = nextActivePolylinesById
    lastActivePolylinesLogKeyRef.current = activePolylinesKey
    writeFrontendLog('map.activePolylines.updated', {
      selectedOrder,
      orderId: selectedActiveOrder?.b_id,
      orderState: selectedActiveOrder?.b_state ?? null,
      tripStarted: isSelectedOrderTripStarted,
      cleanupReason: isSelectedOrderTripStarted ?
        'trip_started_hide_main_pickup_destination_polyline' :
        'normal_route_render',
      activePolylines,
    })
  }, [
    shouldRenderMainOrderRoute,
    routeInfo,
    selectedOrder,
    selectedActiveOrder?.b_id,
    selectedActiveOrder?.b_state,
    isSelectedOrderTripStarted,
    cachedDriverRoutes.map(([driverId, info]) => `${driverId}:${info.distance}:${info.points?.length}`).join('|'),
    displayedSelectedOrderDrivers.map(driver =>
      `${driver.u_id}:${driver.c_id}:${driver.c_state}:${driver.c_latitude}:${driver.c_longitude}`,
    ).join('|'),
    Object.keys(driverRouteInfoById).sort().map(driverId => {
      const info = driverRouteInfoById[driverId]
      return `${driverId}:${info?.distance}:${info?.points?.length}`
    }).join('|'),
    confirmedChoiceId,
    choiceVisualMoveTick,
  ])

  const centerOnUser = () => {
    const latitude = userCoordinates?.latitude
    const longitude = userCoordinates?.longitude

    if (typeof latitude !== 'number' || typeof longitude !== 'number')
      return
    if (isLeafletMapConnected(map))
      safeLeafletAction(() => map.setView([latitude, longitude], Math.max(map.getZoom(), 16)))
  }

  return (
    <>
      <TileLayer
        attribution={getAttribution()}
        url={getTileServerUrl()}
        updateWhenIdle
        updateWhenZooming={false}
        keepBuffer={2}
      />
      {!!userCoordinates?.latitude && !!userCoordinates.longitude &&
        <button
          type="button"
          className={cn('map-container__locate-button', {
            'map-container__locate-button--passenger': containerClassName?.includes('passenger__form-map-container'),
            'map-container__locate-button--live-order': containerClassName?.includes('passenger__form-map-container--live-order'),
          })}
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            centerOnUser()
          }}
          aria-label={t(TRANSLATION.SHOW_MY_LOCATION)}
        >
          <img src={images.mapLocationButton} alt="" />
        </button>
      }
      {
        showRouteInfo && (
          <div
            className="map-container__route"
          >

            <b>{t(TRANSLATION.DISTANCE)}</b> {routeInfo?.distance}km<br />
            <b>{t(TRANSLATION.EXPECTED_DURATION)}</b>&nbsp;
            {duration}
          </div>
        )
      }
      {pickupEtaDuration && (
        <div className="map-container__driver-eta">
          <b>{t(TRANSLATION.CLIENT_PICKUP_ETA)}</b>
          <span>{pickupEtaDuration}</span>
        </div>
      )}
      {
        shouldRenderMainOrderRoute && routeInfo && (
          <Polyline
            key={`main-route-${selectedActiveOrder?.b_id || 'draft'}-${isSelectedOrderTripStarted ? 'hidden' : 'visible'}`}
            positions={routeInfo.points}
            pathOptions={{
              color: '#FF3B30',
              weight: 4,
              opacity: .9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )
      }
      {!!userCoordinates?.latitude &&
        !!userCoordinates?.longitude &&
        <CircleMarker
          className="map-container__user-marker"
          radius={6}
          weight={3}
          pathOptions={{
            color: '#FFFFFF',
            fillColor: '#1E88FF',
            fillOpacity: 1,
          }}
          center={[userCoordinates.latitude, userCoordinates.longitude]}
        />
      }
      {staticMarkers.map((marker, index) => (
        <Marker
          key={`static-${marker.latitude}-${marker.longitude}-${index}`}
          position={[marker.latitude, marker.longitude]}
          icon={STATIC_ACTIVE_MARKER_ICON}
        >
          {!!marker.tooltip &&
            <Tooltip direction="top" offset={[0, -40]} opacity={1} permanent>{marker.tooltip}</Tooltip>
          }
          {!!marker.popup && <Popup>{marker.popup}</Popup>}
        </Marker>
      ))}
      {cachedDriverRoutes.map(([driverId, driverRouteInfo]) => {
        const driver = displayedSelectedOrderDrivers.find(item => String(item.u_id) === String(driverId))
        const driverColor = getDriverColor(driver || { u_id: driverId, c_id: driverId }, driverColorSourceDrivers)

        return (
        <Polyline
          key={`cached-driver-route-${driverId}`}
          positions={driverRouteInfo!.points}
          pathOptions={{
            color: driverColor,
            weight: 4,
            opacity: .9,
          }}
        />
        )
      })}
      {displayedSelectedOrderDrivers.map((driver) => {
        const rawDriverRouteInfo = driverRouteInfoById[driver.u_id]
        const driverRouteInfo = rawDriverRouteInfo && (Number(rawDriverRouteInfo.distance) || 0) <= MAX_CHOICE_DRIVER_ROUTE_DISTANCE_KM ? rawDriverRouteInfo : null
        const driverColor = getDriverColor(driver, driverColorSourceDrivers)
        const visualDriverPosition = getChoiceVisualDriverPosition(
          driver,
          driverRouteInfo,
          selectedActiveOrder,
          confirmedChoiceId,
          Date.now() + choiceVisualMoveTick,
        )
        const driverPosition: [number, number] = visualDriverPosition || [driver.c_latitude!, driver.c_longitude!]
        const driverDistanceToRouteKm = getDistanceToRouteKm(driverRouteInfo?.points, driverPosition)
        const isSelectedChoiceDriver = Boolean(
          isChoiceOrder(selectedActiveOrder) &&
          confirmedChoiceId &&
          String(driver.u_id) === String(confirmedChoiceId),
        )
        const maxRenderDistanceToLineKm = isSelectedChoiceDriver ?
          SELECTED_DRIVER_ROUTE_RENDER_DISTANCE_TO_LINE_KM :
          MAX_DRIVER_ROUTE_RENDER_DISTANCE_TO_LINE_KM
        const isDriverRouteCloseEnough = driverDistanceToRouteKm <= maxRenderDistanceToLineKm
        // Keep the road polyline itself stable. On Android Leaflet visibly blinked when
        // we sliced the same cached route from a new GPS point on every polling tick.
        const displayedDriverRoutePoints = isDriverRouteCloseEnough ? (driverRouteInfo?.points || []) : []
        const routeDurationInfo = isDriverRouteCloseEnough ? (makeRemainingRouteInfo(driverRouteInfo, driverPosition) || driverRouteInfo) : null
        const routeDuration = formatRouteDuration(routeDurationInfo)

        return (
          <React.Fragment key={`driver-${driver.u_id}`}>
            {!!displayedDriverRoutePoints.length && (
              <Polyline
                positions={displayedDriverRoutePoints}
                pathOptions={{
                  color: driverColor,
                  weight: 4,
                  opacity: .92,
                }}
              />
            )}
            <SmoothRotatingMarker
              position={driverPosition}
              iconUrl={getDriverMarkerIcon(selectedActiveOrder)}
              className="client-driver-marker smooth-rotating-marker"
              iconAnchor={[20, 20]}
              popupAnchor={[0, -22]}
              speedKmh={110}
              accentColor={driverColor}
              path={isDriverRouteCloseEnough ? driverRouteInfo?.points : undefined}
            >
              <Popup>
                {getDriverDisplayName(driver)}<br />
                {t(TRANSLATION.BOOKING_DRIVER_STATES[driver.c_state])}
                {routeDuration && <><br />{t(TRANSLATION.DRIVER_ROUTE_TIME)}: {routeDuration}</>}
              </Popup>
            </SmoothRotatingMarker>
          </React.Fragment>
        )
      })}
      {shouldShowFromMarker && !isSelectedOrderTripStarted && !!from?.latitude && !!from?.longitude &&
        <Marker
          position={[from.latitude, from.longitude]}
          icon={FROM_MARKER_ICON}
        >
          <Popup>{t(TRANSLATION.FROM)}{!!from.address && `: ${from.shortAddress || from.address}`}</Popup>
        </Marker>
      }
      {modalHighlight === 'from' && !!from?.latitude && !!from.longitude &&
        <CircleMarker
          center={[from.latitude, from.longitude]}
          radius={24}
          weight={4}
          pathOptions={{
            color: '#FF9900',
            fillColor: '#FF9900',
            fillOpacity: .12,
          }}
        />
      }
      {!!to?.latitude && !!to?.longitude &&
        <Marker
          position={[to.latitude, to.longitude]}
          icon={TO_MARKER_ICON}
        >
          <Popup>{t(TRANSLATION.TO)}{!!to.address && `: ${to.shortAddress || to.address}`}</Popup>
        </Marker>
      }
      {modalHighlight === 'to' && !!to?.latitude && !!to.longitude &&
        <CircleMarker
          center={[to.latitude, to.longitude]}
          radius={24}
          weight={4}
          pathOptions={{
            color: '#00B100',
            fillColor: '#00B100',
            fillOpacity: .12,
          }}
        />
      }
      {shouldShowCenterMarker && <img
        src="https://unpkg.com/leaflet@1.6.0/dist/images/marker-icon-2x.png"
        className="map-container__center-marker"
        alt="Центр"
        tabIndex={0}
      />}
      {/* {!disableButtons && <div className={cn('modal-buttons',{'z-indexed': isModal})}>
        {!!setFrom && (
          <Button
            className='modal-button'
            type="button"
            text={t(TRANSLATION.FROM)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleFromClick()}}
          />
        )}
        {!!setTo && (
          <Button
            className='modal-button'
            text={t(TRANSLATION.TO)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              handleToClick()
            }}
          />
        )}
        {!!(from?.latitude && from?.longitude) && !!(to?.latitude && to?.longitude) && (
          <Button
            className='modal-button'
            text={t(TRANSLATION.BUILD_THE_ROUTE)}
            onClick={handleRouteClick}
          />
        )}
        <Button
          className='modal-button'
          skipHandler={true}
          text={t(TRANSLATION.CLOSE)}
          onClick={() => {
            if (onClose) return onClose()
            setMapModal({ ...defaultMapModal })
          }}
        />
      </div>} */}
    </>
  )
}


class MapErrorBoundary extends React.Component<{
  resetKey: string
  children: React.ReactNode
}, {
  hasError: boolean
  resetKey: string
}> {
  state = {
    hasError: false,
    resetKey: this.props.resetKey,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { resetKey: string },
  ) {
    if (props.resetKey !== state.resetKey)
      return { hasError: false, resetKey: props.resetKey }

    return null
  }

  componentDidCatch(error: unknown) {
    if (!isKnownLeafletCleanupError(error))
      console.error(error)
  }

  render() {
    if (this.state.hasError)
      return <div className="map map--fallback" />

    return this.props.children
  }
}

export default connector(Map)

function isVotingDriverVisible(state: EBookingDriverState) {
  return [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
  ].includes(state)
}

function getDriverMarkerIcon(order: IOrder | null) {
  if (isVotingOrder(order))
    return images.mapArrowVoting || images.mapArrow
  if (isOfferOrder(order))
    return images.mapArrowHome || images.mapArrow
  return images.mapArrow
}

function getDriverDisplayName(driver: any) {
  return [
    driver?.u_name,
    driver?.u_family,
    driver?.user?.u_name,
    driver?.user?.u_family,
  ].find(Boolean) || (driver?.u_id ? `Водитель #${driver.u_id}` : 'Водитель')
}

async function makeRoutePointsSafe(
  from: IAddressPoint,
  to: IAddressPoint,
  wayGraph?: IWayGraph,
  logContext = 'route',
  flowContext: any = {},
): Promise<IRouteInfo> {
  const directDistanceKm = getDirectRouteDistanceKm(from, to)

  const writeRouteSelected = (source: string, route: IRouteInfo, reason = 'valid_route') => {
    writeFlowEvent('ROUTE_SOURCE_SELECTED', {
      ...flowContext,
      data: {
        ...(flowContext?.data || {}),
        context: logContext,
        source,
        reason,
        directDistanceKm: directDistanceKm === null ? null : Number(directDistanceKm.toFixed(3)),
        route: summarizeRouteInfo(route),
      },
    })
  }

  const writeRouteRejected = (
    source: string,
    route: IRouteInfo | null | undefined,
    reason?: string,
    message?: string,
  ) => {
    writeFlowEvent('ROUTE_REJECTED', {
      ...flowContext,
      data: {
        ...(flowContext?.data || {}),
        context: logContext,
        source,
        reason: reason || getRouteRejectReason(route, directDistanceKm),
        directDistanceKm: directDistanceKm === null ? null : Number(directDistanceKm.toFixed(3)),
        message: message || null,
        route: summarizeRouteInfo(route),
      },
    })
  }

  if (directDistanceKm !== null && directDistanceKm <= SHORT_ROUTE_DIRECT_DISTANCE_KM) {
    const shortRoute = makeShortDirectRouteInfo(from, to, directDistanceKm)
    const reason = directDistanceKm <= SAME_POINT_ROUTE_DISTANCE_KM ?
      'same_start_and_finish' :
      'distance_below_threshold'

    writeFrontendLog('route.source.short.selected', {
      context: logContext,
      from: summarizePoint(from),
      to: summarizePoint(to),
      reason,
      directDistanceKm: Number(directDistanceKm.toFixed(3)),
      route: summarizeRouteInfo(shortRoute),
    })
    writeRouteSelected('short-direct', shortRoute, reason)
    return shortRoute
  }

  try {
    const apiRoute = await API.makeRoutePoints(from, to)
    if (isUsableRouteInfo(apiRoute)) {
      writeFrontendLog('route.source.api.success', {
        context: logContext,
        from: summarizePoint(from),
        to: summarizePoint(to),
        route: summarizeRouteInfo(apiRoute),
      })
      writeRouteSelected('api', apiRoute, 'valid_route')
      return apiRoute
    }

    const reason = getRouteRejectReason(apiRoute, directDistanceKm)
    writeFrontendLog('route.source.api.unusable', {
      context: logContext,
      from: summarizePoint(from),
      to: summarizePoint(to),
      reason,
      directDistanceKm: directDistanceKm === null ? null : Number(directDistanceKm.toFixed(3)),
      route: summarizeRouteInfo(apiRoute),
    })
    writeRouteRejected('api', apiRoute, reason)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeFrontendLog('route.source.api.failed', {
      context: logContext,
      from: summarizePoint(from),
      to: summarizePoint(to),
      message,
    })
    writeRouteRejected('api', null, 'exception', message)
  }

  const localRoute = makeLocalRoutePoints(from, to, wayGraph)
  if (isUsableRouteInfo(localRoute)) {
    writeFrontendLog('route.source.local.success', {
      context: logContext,
      from: summarizePoint(from),
      to: summarizePoint(to),
      route: summarizeRouteInfo(localRoute),
    })
    writeRouteSelected('local', localRoute, 'valid_route')
    return localRoute
  }

  const localReason = getRouteRejectReason(localRoute, directDistanceKm)
  writeFrontendLog('route.source.local.unusable', {
    context: logContext,
    from: summarizePoint(from),
    to: summarizePoint(to),
    hasWayGraph: Boolean(wayGraph),
    reason: localReason,
    directDistanceKm: directDistanceKm === null ? null : Number(directDistanceKm.toFixed(3)),
    route: summarizeRouteInfo(localRoute),
  })
  writeRouteRejected('local', localRoute, localReason)

  try {
    const osrmRoute = await makeOsrmRoutePoints(from, to)
    if (isUsableRouteInfo(osrmRoute)) {
      writeFrontendLog('route.source.osrm.success', {
        context: logContext,
        from: summarizePoint(from),
        to: summarizePoint(to),
        route: summarizeRouteInfo(osrmRoute),
      })
      writeRouteSelected('osrm', osrmRoute, 'valid_route')
      return osrmRoute
    }

    const osrmReason = getRouteRejectReason(osrmRoute, directDistanceKm)
    writeFrontendLog('route.source.osrm.unusable', {
      context: logContext,
      from: summarizePoint(from),
      to: summarizePoint(to),
      reason: osrmReason,
      directDistanceKm: directDistanceKm === null ? null : Number(directDistanceKm.toFixed(3)),
      route: summarizeRouteInfo(osrmRoute),
    })
    writeRouteRejected('osrm', osrmRoute, osrmReason)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    writeFrontendLog('route.source.osrm.failed', {
      context: logContext,
      from: summarizePoint(from),
      to: summarizePoint(to),
      message,
    })
    writeRouteRejected('osrm', null, 'exception', message)
  }

  writeRouteRejected('all', null, 'no_usable_route')
  throw new Error('Route by roads is not available')
}

function getDirectRouteDistanceKm(from: IAddressPoint, to: IAddressPoint) {
  if (!from.latitude || !from.longitude || !to.latitude || !to.longitude)
    return null

  return distanceBetweenEarthCoordinates(from.latitude, from.longitude, to.latitude, to.longitude)
}

function makeShortDirectRouteInfo(from: IAddressPoint, to: IAddressPoint, distanceKm: number): IRouteInfo {
  const hasBothPoints = Boolean(from.latitude && from.longitude && to.latitude && to.longitude)
  return {
    distance: parseFloat(Math.max(0, distanceKm).toFixed(2)),
    time: { hours: 0, minutes: 0 },
    points: hasBothPoints ? [
      [from.latitude!, from.longitude!],
      [to.latitude!, to.longitude!],
    ] : [],
  }
}

function getRouteRejectReason(route: IRouteInfo | null | undefined, directDistanceKm?: number | null) {
  if (directDistanceKm !== undefined && directDistanceKm !== null) {
    if (directDistanceKm <= SAME_POINT_ROUTE_DISTANCE_KM)
      return 'same_start_and_finish'
    if (directDistanceKm <= SHORT_ROUTE_DIRECT_DISTANCE_KM)
      return 'distance_below_threshold'
  }

  if (!route)
    return 'empty_route'

  if (!Array.isArray(route.points))
    return 'missing_points'

  if (route.points.length < 2)
    return 'too_few_points'

  if (route.points.some(point =>
    !Array.isArray(point) ||
    point.length < 2 ||
    !Number.isFinite(point[0]) ||
    !Number.isFinite(point[1]),
  ))
    return 'invalid_points'

  if (route.points.length <= 2)
    return 'too_few_points_for_road_route'

  return 'unknown_unusable_route'
}

async function makeOsrmRoutePoints(
  from: IAddressPoint,
  to: IAddressPoint,
): Promise<IRouteInfo | null> {
  if (!from.latitude || !from.longitude || !to.latitude || !to.longitude)
    return null

  const url = [
    'https://router.project-osrm.org/route/v1/driving/',
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`,
    '?overview=full&geometries=geojson',
  ].join('')
  const response = await fetch(url)
  if (!response.ok)
    return null

  const data = await response.json()
  const route = data?.routes?.[0]
  const coordinates = route?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length < 2)
    return null

  const durationSeconds = Number(route.duration) || 0
  const hours = Math.floor(durationSeconds / 3600)
  const minutes = Math.max(1, Math.round((durationSeconds - hours * 3600) / 60))

  return {
    distance: parseFloat(((Number(route.distance) || 0) / 1000).toFixed(2)),
    time: { hours, minutes },
    points: coordinates.map((item: [number, number]) => [item[1], item[0]]),
  }
}

function isUsableRouteInfo(route: IRouteInfo | null | undefined): route is IRouteInfo {
  return Boolean(
    route &&
    Array.isArray(route.points) &&
    route.points.length > 2 &&
    route.points.every(point =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
    ),
  )
}

function makeLocalRoutePoints(
  from: IAddressPoint,
  to: IAddressPoint,
  wayGraph?: IWayGraph,
): IRouteInfo | null {
  if (!wayGraph || !from.latitude || !from.longitude || !to.latitude || !to.longitude)
    return null

  const [startNode] = wayGraph.findClosestNode(from.latitude, from.longitude)
  const [endNode] = wayGraph.findClosestNode(to.latitude, to.longitude)
  if (!startNode || !endNode)
    return null

  const [path, distanceMeters] = wayGraph.findShortestPath(startNode.id, endNode.id)
  if (path.length < 2 || !Number.isFinite(distanceMeters))
    return null

  const minutes = Math.max(1, Math.round(distanceMeters / 1000 / 35 * 60))
  return {
    distance: parseFloat((distanceMeters / 1000).toFixed(2)),
    time: {
      hours: Math.floor(minutes / 60),
      minutes: minutes % 60,
    },
    points: [
      [from.latitude, from.longitude],
      ...path.map(node => [node.latitude, node.longitude] as [number, number]),
      [to.latitude, to.longitude],
    ],
  }
}
