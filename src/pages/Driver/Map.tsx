import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import {
  MapContainer, Marker, TileLayer, Polyline,
  Popup, Tooltip, useMap,
} from 'react-leaflet'
import {
  EBookingDriverState,
  EOrderProfitRank,
  IAddressPoint,
  IOrder,
  IRouteInfo,
  IUser,
  EStatuses,
} from '../../types/types'
import { IWayGraph } from '../../tools/maps'
import { useCachedState } from '../../tools/hooks'
import images from '../../constants/images'
import {
  dateFormatTimeShort,
  distanceBetweenEarthCoordinates,
  getAttribution,

  getTileServerUrl,
  formatCurrency,
  HIGH_ACCURACY_GEOLOCATION_OPTIONS,
} from '../../tools/utils'
import { useInterval } from '../../tools/hooks'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { orderActionCreators } from '../../state/order'
import { modalsActionCreators } from '../../state/modals'
import { areasActionCreators, areasSelectors } from '../../state/areas'
import { IRootState } from '../../state'
import { t, TRANSLATION } from '../../localization'
import PageSection from '../../components/PageSection'
import Button from '../../components/Button'
import SmoothRotatingMarker from '../../components/SmoothRotatingMarker'
import { EDriverTabs } from '.'
import { DRIVER_OFFER_LIFETIME_MS, isOfferOrder, isVotingOrder } from '../../tools/driverOffer'
import { BROWSER_EMULATOR_STATE_EVENT, isBrowserEmulatorRunning, isDriverEmulatorTargetOrder, isEmulatedClientOrder } from '../../tools/emulatorMode'
import {
  buildMockDriverOrders,
  extendMockVoteLife,
  formatLifeClock,
  getOrderLifeAgePct,
  getOrderLifeElapsedMs,
  getOrderLifeMode,
  getOrderLifeRemainingMs,
  isMarkerMockEnabled,
  isMockLifeExpired,
  MARKER_MOCK_STATE_EVENT,
  MOCK_DRIVER_HEADING_DEG,
  setMarkerMockEnabled,
} from '../../tools/markerMock'
import { writeFlowEvent } from '../../tools/flowLog'
import { writeRawLog } from '../../tools/rawLog'
import { summarizeOrder } from '../../tools/frontendLog'
import './styles.scss'

const cachedDriverMapStateKey = 'cachedDriverMapState'
const DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY = 'driverStartedVotingOrderIds'
const SAVED_GEOLOCATION_KEY = 'gruzvill_last_browser_geolocation'

const KNOWN_LEAFLET_LIFECYCLE_ERRORS = [
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

function isKnownLeafletLifecycleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return KNOWN_LEAFLET_LIFECYCLE_ERRORS.some(item => message.includes(item))
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

function cleanupStaleDriverMarkerDom(marker: any) {
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

function patchLeafletLifecycleForDriverMap() {
  const layerPrototype = (L.Layer as any)?.prototype
  if (layerPrototype && !layerPrototype.__driverSafeLayerAddPatched) {
    const originalLayerAdd = layerPrototype._layerAdd
    if (typeof originalLayerAdd === 'function') {
      layerPrototype._layerAdd = function driverSafeLayerAdd(event: any) {
        const map = event?.target || this?._map
        if (!isLeafletRuntimeReady(map))
          return this

        try {
          return originalLayerAdd.call(this, event)
        } catch (error) {
          if (!isKnownLeafletLifecycleError(error))
            throw error

          return this
        }
      }
      layerPrototype.__driverSafeLayerAddPatched = true
    }
  }

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
          if (!isKnownLeafletLifecycleError(error))
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
          if (!isKnownLeafletLifecycleError(error))
            throw error

          return undefined
        }
      }
      domUtil.__gruzvillSafeRemovePatched = true
    }
  }

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
          if (!isKnownLeafletLifecycleError(error))
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
            cleanupStaleDriverMarkerDom(this)
            return this
          }

          return originalOnRemove.call(this, map)
        } catch (error) {
          if (!isKnownLeafletLifecycleError(error))
            throw error

          cleanupStaleDriverMarkerDom(this)
          return this
        }
      }
      markerPrototype.__gruzvillSafeOnRemovePatched = true
    }
  }
}

function safeLeafletAction(action: () => void) {
  try {
    action()
  } catch (error) {
    if (!isKnownLeafletLifecycleError(error))
      throw error
  }
}

patchLeafletLifecycleForDriverMap()

function saveLastBrowserGeolocation(point: { latitude: number, longitude: number }) {
  try {
    window.localStorage.setItem(SAVED_GEOLOCATION_KEY, JSON.stringify({
      ...point,
      timestamp: Date.now(),
      source: 'driver-map',
    }))
  } catch {
    // ignore storage errors
  }
}

function getSavedDriverMapPosition(): L.LatLngExpression | undefined {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_GEOLOCATION_KEY) || 'null')
    const latitude = Number(parsed?.latitude)
    const longitude = Number(parsed?.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [latitude, longitude] : undefined
  } catch {
    return undefined
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

const DEMO_DRIVER_ROUTE_SPEED_MPS = 24

function findNearestRouteIndex(points: Array<[number, number]>, position: [number, number]) {
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  points.forEach((point, index) => {
    const distance = distanceBetweenEarthCoordinates(position[0], position[1], point[0], point[1])
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })

  return nearestIndex
}

function interpolateRoutePoint(from: [number, number], to: [number, number], ratio: number): [number, number] {
  return [
    from[0] + (to[0] - from[0]) * ratio,
    from[1] + (to[1] - from[1]) * ratio,
  ]
}

function moveAlongRoutePoints(
  current: [number, number],
  points: Array<[number, number]>,
  stepMeters: number,
  startIndex?: number,
) {
  if (points.length < 2)
    return { point: current, index: 0, done: true }

  let point = current
  let targetIndex = Math.max(1, startIndex || findNearestRouteIndex(points, current) + 1)
  let remaining = stepMeters

  while (targetIndex < points.length) {
    const target = points[targetIndex]
    const segmentMeters = distanceBetweenEarthCoordinates(point[0], point[1], target[0], target[1]) * 1000

    if (segmentMeters <= 0.01) {
      point = target
      targetIndex += 1
      continue
    }

    if (segmentMeters > remaining) {
      return {
        point: interpolateRoutePoint(point, target, remaining / segmentMeters),
        index: targetIndex,
        done: false,
      }
    }

    remaining -= segmentMeters
    point = target
    targetIndex += 1
  }

  return { point: points[points.length - 1], index: points.length - 1, done: true }
}

function getStoredStartedVotingOrderIds(): string[] {
  try {
    const value = localStorage.getItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY)
    return value ? JSON.parse(value) : []
  } catch {
    return []
  }
}

function removeStoredStartedVotingOrderId(orderId: IOrder['b_id']) {
  const nextIds = getStoredStartedVotingOrderIds().filter(id => id !== orderId)
  localStorage.setItem(DRIVER_STARTED_VOTING_ORDERS_STORAGE_KEY, JSON.stringify(nextIds))
  return nextIds
}

const mapDispatchToProps = {
  getOrder: orderActionCreators.getOrder,
  setRatingModal: modalsActionCreators.setRatingModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setOrderCardModal: modalsActionCreators.setOrderCardModal,
  getAreasBetweenPoints: areasActionCreators.getAreasBetweenPoints,
}

const mapStateToProps = (state: IRootState) => ({
  wayGraph: areasSelectors.wayGraph(state),
})

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  user: IUser,
  activeOrders: IOrder[] | null,
  readyOrders: IOrder[] | null,
}

function DriverOrderMapMode(props: IProps) {
  const [position, setPosition] = useCachedState<L.LatLngExpression | undefined>(
    `${cachedDriverMapStateKey}.position`,
  )
  const [zoom, setZoom] = useCachedState<number>(
    `${cachedDriverMapStateKey}.zoom`,
    15,
  )

  return (
    <PageSection className="driver-order-map-mode">
      <DriverMapErrorBoundary resetKey={`driver-map-${props.user?.u_id || 'guest'}`}>
        <MapContainer
          center={position ?? getSavedDriverMapPosition() ?? SITE_CONSTANTS.DEFAULT_POSITION}
          zoom={zoom}
          className='map'
          attributionControl={false}
          zoomControl={false}
        >
          <DriverOrderMapModeContent
            {...props}
            locate={false}
            {...{ setPosition, setZoom }}
          />
        </MapContainer>
      </DriverMapErrorBoundary>
    </PageSection>
  )
}

class DriverMapErrorBoundary extends React.Component<{
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
    if (!isKnownLeafletLifecycleError(error))
      console.error(error)
  }

  render() {
    if (this.state.hasError)
      return <div className="map map--fallback" />

    return this.props.children
  }
}

interface IContentProps extends IProps {
  locate: boolean,
  setZoom: (zoom: number) => void
  setPosition: (position: L.LatLngExpression) => void
}

function DriverOrderMapModeContent({
  user,
  activeOrders: activeOrdersProp,
  readyOrders: readyOrdersProp,
  locate,
  setPosition,
  setZoom,
  getOrder,
  setRatingModal,
  setMessageModal,
  setOrderCardModal,
  getAreasBetweenPoints,
  wayGraph,
}: IContentProps) {

  const navigate = useNavigate()
  const map = useMap()

  const [lastPositions, setLastPositions] = useState<[number, number][]>([])
  const [activeDriveRouteInfo, setActiveDriveRouteInfo] = useState<IRouteInfo | null>(null)
  const [startedVotingOrderIds, setStartedVotingOrderIds] = useState(() =>
    getStoredStartedVotingOrderIds(),
  )
  const [hiddenOrderIds, setHiddenOrderIds] = useState<string[]>(() => getHiddenOrderIds(user?.u_id))
  const [mapActionPending, setMapActionPending] = useState(false)
  const [debugMarkerInfo, setDebugMarkerInfo] = useState<IMarkerDebugInfo | null>(null)
  const debugMarkerTimeoutRef = useRef<number | null>(null)
  const lastDriverMapOrdersRenderLogKeyRef = useRef('')
  const lastDriverMapOrderCardLogKeyRef = useRef('')
  const lastDriverMapVisibleOrderIdsRef = useRef<string[]>([])
  const loggedDriverMapOrderSnapshotIdsRef = useRef<Record<string, true>>({})
  const [resolvedDestinationAddresses, setResolvedDestinationAddresses] = useState<Record<string, string>>({})
  const fittedDestinationOrderRef = useRef<string | null>(null)
  const lastRoutePointRef = useRef<IAddressPoint | null>(null)
  const lastRouteTargetRef = useRef<IAddressPoint | null>(null)
  const lastRouteGraphRef = useRef<IWayGraph | null>(null)
  const [demoDriverPosition, setDemoDriverPosition] = useState<[number, number] | null>(null)
  const demoRouteIndexRef = useRef(0)
  const demoRouteKeyRef = useRef('')
  const demoRouteMoveAtRef = useRef(0)
  const browserGeoRequestPendingRef = useRef(false)
  const lastBrowserGeoRequestAtRef = useRef(0)
  const [browserEmulatorModes, setBrowserEmulatorModes] = useState(() => ({
    clients: isBrowserEmulatorRunning('clients'),
    drivers: isBrowserEmulatorRunning('drivers'),
  }))
  const isClientEmulatorMode = browserEmulatorModes.clients
  const isDriverEmulatorMode = browserEmulatorModes.drivers
  const emulatorOrdersEnabled = isClientEmulatorMode || isDriverEmulatorMode

  // --- Мок-режим дизайн-системы маркера (демо на статичных данных) ---
  const [mockEnabled, setMockEnabled] = useState(() => isMarkerMockEnabled())
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [hintBgAlpha, setHintBgAlpha] = useState(85)
  const [legendOpen, setLegendOpen] = useState(false)
  const [mapFilters, setMapFilters] = useState<TMapFilters>(DEFAULT_MAP_FILTERS)
  const [zoomLevel, setZoomLevel] = useState<number>(15)
  // Центр мока = реальная позиция водителя (где синий маркер «я»), чтобы заказы
  // были вокруг водителя, а не в Москве. Резолвим из сохранённой геопозиции + живого GPS.
  const [mockCenter, setMockCenter] = useState<[number, number] | null>(null)
  const mockFitKeyRef = useRef('')
  // Тик живых таймеров жизни заказа (vote/offer убывают, direct растёт). Раз в секунду
  // перерисовываем подписи/кольца и пересчитываем, какие VOTE-заказы пора убрать с карты.
  const [mockTick, setMockTick] = useState(0)

  useEffect(() => {
    if (!mockEnabled) return undefined

    const saved = getSavedDriverMapPosition()
    if (Array.isArray(saved) && saved.length === 2 && Number.isFinite(Number(saved[0])) && Number.isFinite(Number(saved[1])))
      setMockCenter([Number(saved[0]), Number(saved[1])])

    let cancelled = false
    try {
      navigator.geolocation?.getCurrentPosition(
        ({ coords }) => {
          if (!cancelled)
            setMockCenter([coords.latitude, coords.longitude])
        },
        () => {},
        HIGH_ACCURACY_GEOLOCATION_OPTIONS,
      )
    } catch (_) {}

    return () => {
      cancelled = true
    }
  }, [mockEnabled])

  const mockBundle = useMemo(
    () => (mockEnabled ? buildMockDriverOrders(user?.u_id, mockCenter) : null),
    [mockEnabled, user?.u_id, mockCenter],
  )

  // Часы живых таймеров мока: тикаем раз в секунду, только когда мок включён и вкладка
  // видима. mockTick двигает кольца/счётчики (через setIcon в MockClusterLayer) и
  // пересчёт VOTE-просрочки ниже.
  useInterval(() => {
    if (!mockEnabled || document.hidden) return
    setMockTick(value => (value + 1) % 1_000_000)
  }, 1000)

  // Когда мок включён, карта берёт заказы из мок-источника. Реальные props в мок-режиме
  // не обновляются (polling отрублен в Driver/index.tsx), поэтому их игнорируем.
  const activeOrders = mockEnabled && mockBundle ? mockBundle.active : activeOrdersProp
  const readyOrders = mockEnabled && mockBundle ? mockBundle.ready : readyOrdersProp

  const markerCtx = useMemo<IMarkerRenderCtx>(() => ({
    currentUserId: user?.u_id,
    driverHeadingDeg: mockEnabled ? MOCK_DRIVER_HEADING_DEG : undefined,
    selectedOrderId,
    mock: mockEnabled,
  }), [user?.u_id, mockEnabled, selectedOrderId])

  useEffect(() => {
    const syncEmulatorMode = () => setBrowserEmulatorModes({
      clients: isBrowserEmulatorRunning('clients'),
      drivers: isBrowserEmulatorRunning('drivers'),
    })
    syncEmulatorMode()
    window.addEventListener(BROWSER_EMULATOR_STATE_EVENT, syncEmulatorMode)
    return () => window.removeEventListener(BROWSER_EMULATOR_STATE_EVENT, syncEmulatorMode)
  }, [])

  useEffect(() => {
    const sync = () => setMockEnabled(isMarkerMockEnabled())
    sync()
    window.addEventListener(MARKER_MOCK_STATE_EVENT, sync)
    return () => window.removeEventListener(MARKER_MOCK_STATE_EVENT, sync)
  }, [])

  // §10: следим за зумом, чтобы переключать уровень детализации (far/mid/near).
  useEffect(() => {
    if (!isLeafletMapConnected(map))
      return undefined
    const sync = () => {
      try {
        setZoomLevel(map.getZoom())
      } catch (_) {}
    }
    sync()
    map.on('zoomend', sync)
    return () => {
      safeLeafletAction(() => map.off('zoomend', sync))
    }
  }, [map])

  // Прозрачность фона хинт-карточек (§ ползунок): альфа белой заливки через CSS-переменную.
  // Переменная на :root каскадирует и на DivIcon-маркеры (они вне React-дерева, внутри панелей Leaflet).
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ds-hint-bg-alpha', String(Math.min(100, Math.max(0, hintBgAlpha)) / 100))
    return () => {
      root.style.removeProperty('--ds-hint-bg-alpha')
    }
  }, [hintBgAlpha])

  useEffect(() => () => {
    if (debugMarkerTimeoutRef.current)
      window.clearTimeout(debugMarkerTimeoutRef.current)
  }, [])

  const showMarkerDebugOverlay = (order: IOrder, performing: boolean) => {
    if (!isMarkerDebugEnabled()) return

    if (debugMarkerTimeoutRef.current)
      window.clearTimeout(debugMarkerTimeoutRef.current)

    setDebugMarkerInfo(buildMarkerDebugInfo(order, performing, markerCtx))
    debugMarkerTimeoutRef.current = window.setTimeout(() => setDebugMarkerInfo(null), 7000)
  }

  useEffect(() => {
    const onZoomPreset = (event: Event) => {
      const preset = (event as CustomEvent<'max' | 'overview'>).detail
      if (!isLeafletMapConnected(map)) return
      const rawMaxZoom = Number(map.getMaxZoom())
      const maxZoom = Number.isFinite(rawMaxZoom) && rawMaxZoom > 0 ? rawMaxZoom : 18
      const targetZoom = preset === 'max' ? maxZoom : Math.max(10, maxZoom - 3)
      safeLeafletAction(() => map.setZoom(targetZoom, { animate: true }))
    }

    window.addEventListener('driverMapZoomPreset', onZoomPreset)
    return () => window.removeEventListener('driverMapZoomPreset', onZoomPreset)
  }, [map])

  useEffect(() => {
    if (!map)
      return undefined

    let cancelled = false

    const onLocationFound = (e: L.LocationEvent) => {
      if (cancelled) return
      const point = { latitude: e.latlng.lat, longitude: e.latlng.lng }
      saveLastBrowserGeolocation(point)
      setLastPositions([[e.latlng.lat, e.latlng.lng]])
      if (locate && isLeafletMapConnected(map))
        safeLeafletAction(() => map.setView(e.latlng))
    }
    const onLocationError = (e: L.ErrorEvent) => console.error(e.message)
    const onMapClick = (_e: L.LeafletMouseEvent) => {
      // Не отправляем координаты по клику по карте.
      // Иначе на Android/Chrome при тапе по заказу всплывает системный confirm
      // вместо обычной карточки заказа.
    }
    const onZoomEnd = () => {
      if (!isLeafletRuntimeReady(map))
        return

      safeLeafletAction(() => setZoom(map.getZoom()))
    }
    const onMoveEnd = () => {
      if (!isLeafletRuntimeReady(map))
        return

      safeLeafletAction(() => setPosition(map.getCenter()))
    }

    safeLeafletAction(() => {
      map.once('locationfound', onLocationFound)
      map.once('locationerror', onLocationError)
      if (locate && isClientEmulatorMode && !isDriverEmulatorMode) {
        map.locate({
          ...HIGH_ACCURACY_GEOLOCATION_OPTIONS,
        })
      }
      map.on('zoomend', onZoomEnd)
      map.on('moveend', onMoveEnd)
    })

    return () => {
      cancelled = true
      safeLeafletAction(() => {
        map.off('locationfound', onLocationFound)
        map.off('locationerror', onLocationError)
        map.off('zoomend', onZoomEnd)
        map.off('moveend', onMoveEnd)
        map.stopLocate()
      })
    }
  }, [map, locate, isClientEmulatorMode, isDriverEmulatorMode, setPosition, setZoom, user])

  useEffect(() => {
    const updateHiddenOrders = () => setHiddenOrderIds(getHiddenOrderIds(user?.u_id))
    updateHiddenOrders()
    window.addEventListener('hiddenOrdersChanged', updateHiddenOrders)
    window.addEventListener('storage', updateHiddenOrders)
    return () => {
      window.removeEventListener('hiddenOrdersChanged', updateHiddenOrders)
      window.removeEventListener('storage', updateHiddenOrders)
    }
  }, [user?.u_id])

  const visibleReadyOrders = useMemo(() =>
    readyOrders?.filter(item => !hiddenOrderIds.includes(String(item.b_id))) ?? null
  , [readyOrders, hiddenOrderIds.join('|')])

  const visibleMapOrders = useMemo(() => {
    const ordersById: Record<string, IOrder> = {}

    ;[
      ...(activeOrders ?? []),
      ...(visibleReadyOrders ?? []),
    ].forEach(order => {
      if (!order?.b_id)
        return

      ordersById[String(order.b_id)] = order
    })

    return Object.values(ordersById)
  }, [
    activeOrders?.map(order => `${order.b_id}:${order.b_state}:${order.b_start_latitude}:${order.b_start_longitude}:${order.drivers?.length ?? 0}`).join('|'),
    visibleReadyOrders?.map(order => `${order.b_id}:${order.b_state}:${order.b_start_latitude}:${order.b_start_longitude}:${order.drivers?.length ?? 0}`).join('|'),
  ])

  // Подпись набора заказов с убывающим таймером (vote/offer), уже исчерпавших жизнь.
  // Пересчитывается каждый тик, но как СТРОКА меняется только когда что-то реально
  // обнулилось — поэтому liveMapOrders/кластер не пересобираются на каждую секунду,
  // лишь в момент удаления.
  const expiredLifeSignature = useMemo(() => {
    if (!mockEnabled || !visibleMapOrders.length) return ''
    const now = Date.now()
    return visibleMapOrders
      .filter(order => isMockLifeExpired(order, now))
      .map(order => String(order.b_id))
      .sort()
      .join('|')
    // mockTick — намеренно в зависимостях: триггерит пересчёт раз в секунду.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockEnabled, visibleMapOrders, mockTick])

  // vote/offer при обнулении таймера убираем с карты (direct растёт и остаётся).
  const liveMapOrders = useMemo(() => {
    if (!mockEnabled || !expiredLifeSignature) return visibleMapOrders
    const expired = new Set(expiredLifeSignature.split('|'))
    return visibleMapOrders.filter(order => !expired.has(String(order.b_id)))
  }, [mockEnabled, visibleMapOrders, expiredLifeSignature])

  // §11 Фильтры: в мок-режиме показываем только заказы, прошедшие фильтры (тип/голосование/по пути).
  const filteredMapOrders = useMemo(() => {
    if (!mockEnabled) return liveMapOrders
    return liveMapOrders.filter(order => orderPassesFilters(order, mapFilters, markerCtx.driverHeadingDeg))
  }, [mockEnabled, liveMapOrders, mapFilters, markerCtx.driverHeadingDeg])

  // В мок-режиме центрируем карту на водителе так, чтобы были видны все демо-маркеры.
  // Перецентрируем, когда координаты меняются (например, когда подъехал реальный GPS).
  useEffect(() => {
    if (!mockEnabled) {
      mockFitKeyRef.current = ''
      return
    }
    if (!isLeafletMapConnected(map))
      return

    const coords = visibleMapOrders
      .filter(order => order.b_start_latitude && order.b_start_longitude)
      .map(order => [order.b_start_latitude, order.b_start_longitude] as [number, number])
    if (!coords.length)
      return

    const key = coords.map(point => point.join(',')).join('|')
    if (mockFitKeyRef.current === key)
      return

    mockFitKeyRef.current = key
    safeLeafletAction(() => map.fitBounds(coords, { padding: [70, 70], maxZoom: 15 }))
  }, [mockEnabled, map, visibleMapOrders])

  useEffect(() => {
    const activeMapOrders = activeOrders ?? []
    const readyMapOrders = visibleReadyOrders ?? []
    const allMapOrders = visibleMapOrders
    const mapOrdersWithCoordinates = allMapOrders.filter(order => Boolean(order.b_start_latitude && order.b_start_longitude))
    const mapOrdersWithoutCoordinates = allMapOrders.filter(order => !order.b_start_latitude || !order.b_start_longitude)
    const visibleMarkers = mapOrdersWithCoordinates.map(order => ({
      section: activeMapOrders.some(item => String(item.b_id) === String(order.b_id)) ?
        'active-map-marker' :
        'ready-map-marker',
      order,
    }))
    const renderKey = JSON.stringify({
      userId: user?.u_id ?? null,
      active: activeMapOrders.map(order => order.b_id),
      ready: readyMapOrders.map(order => order.b_id),
      allMapOrders: allMapOrders.map(order => order.b_id),
      mapOrdersWithCoordinates: mapOrdersWithCoordinates.map(order => order.b_id),
      mapOrdersWithoutCoordinates: mapOrdersWithoutCoordinates.map(order => order.b_id),
      visibleMarkers: visibleMarkers.map(item => `${item.section}:${item.order.b_id}`),
      hiddenOrderIds,
    })

    if (renderKey !== lastDriverMapOrdersRenderLogKeyRef.current) {
      lastDriverMapOrdersRenderLogKeyRef.current = renderKey
      const visibleOrderIds = visibleMarkers.map(item => String(item.order.b_id))
      const previousVisibleOrderIds = lastDriverMapVisibleOrderIdsRef.current
      const addedVisibleOrderIds = visibleOrderIds.filter(orderId => !previousVisibleOrderIds.includes(orderId))
      const removedVisibleOrderIds = previousVisibleOrderIds.filter(orderId => !visibleOrderIds.includes(orderId))
      lastDriverMapVisibleOrderIdsRef.current = visibleOrderIds

      const renderedSummary = {
        tab: 'map',
        userId: user?.u_id ?? null,
        activeOrdersCount: activeMapOrders.length,
        readyOrdersCount: readyMapOrders.length,
        totalOrders: allMapOrders.length,
        withCoordinates: mapOrdersWithCoordinates.length,
        withoutCoordinates: mapOrdersWithoutCoordinates.length,
        renderedMarkers: visibleMarkers.length,
        visibleMarkerCount: visibleMarkers.length,
        hiddenOrderIds,
      }

      writeFlowEvent('MAP_ORDERS_RECEIVED', {
        screen: 'DriverMap',
        uiState: 'MapTab',
        data: {
          ...renderedSummary,
          orderIds: allMapOrders.map(order => order.b_id),
          withCoordinatesOrderIds: mapOrdersWithCoordinates.map(order => order.b_id),
          withoutCoordinatesOrderIds: mapOrdersWithoutCoordinates.map(order => order.b_id),
        },
      })
      writeRawLog('MAP_ORDERS_RECEIVED', {
        source: 'driver-map-ui',
        screen: 'DriverMap',
        uiState: 'MapTab',
        ...renderedSummary,
        orderIds: allMapOrders.map(order => order.b_id),
        withCoordinatesOrderIds: mapOrdersWithCoordinates.map(order => order.b_id),
        withoutCoordinatesOrderIds: mapOrdersWithoutCoordinates.map(order => order.b_id),
      })

      allMapOrders.forEach(order => {
        const lat = order.b_start_latitude === undefined || order.b_start_latitude === null ? null : Number(order.b_start_latitude)
        const lng = order.b_start_longitude === undefined || order.b_start_longitude === null ? null : Number(order.b_start_longitude)
        const hasValidCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && Boolean(lat && lng)
        writeFlowEvent('MAP_ORDER', {
          orderId: order.b_id,
          screen: 'DriverMap',
          uiState: 'MapTab',
          data: {
            orderId: order.b_id,
            lat,
            lng,
            hasValidCoordinates,
            renderedMarker: visibleMarkers.some(item => String(item.order.b_id) === String(order.b_id)),
            order: summarizeOrder(order),
          },
        })
        writeRawLog('MAP_ORDER', {
          source: 'driver-map-ui',
          screen: 'DriverMap',
          uiState: 'MapTab',
          orderId: order.b_id,
          lat,
          lng,
          hasValidCoordinates,
          renderedMarker: visibleMarkers.some(item => String(item.order.b_id) === String(order.b_id)),
          order: summarizeOrder(order),
        })
      })

      addedVisibleOrderIds.forEach(orderId => {
        const item = visibleMarkers.find(section => String(section.order.b_id) === String(orderId))
        if (!item)
          return

        writeFlowEvent('ORDER_BECAME_VISIBLE', {
          orderId: item.order.b_id,
          screen: 'DriverMap',
          uiState: 'MapTab',
          data: {
            section: item.section,
            order: summarizeOrder(item.order),
            userId: user?.u_id ?? null,
          },
        })

        if (!loggedDriverMapOrderSnapshotIdsRef.current[String(item.order.b_id)]) {
          loggedDriverMapOrderSnapshotIdsRef.current[String(item.order.b_id)] = true
          writeFlowEvent('ORDER_SNAPSHOT', {
            orderId: item.order.b_id,
            screen: 'DriverMap',
            uiState: 'MapTab',
            data: {
              reason: 'first_marker_visible_on_driver_map',
              section: item.section,
              order: item.order,
            },
          })
          writeRawLog('ORDER_SNAPSHOT', {
            source: 'driver-map-ui',
            screen: 'DriverMap',
            uiState: 'MapTab',
            orderId: item.order.b_id,
            reason: 'first_marker_visible_on_driver_map',
            section: item.section,
            order: item.order,
          })
        }
      })

      removedVisibleOrderIds.forEach(orderId => {
        writeFlowEvent('ORDER_REMOVED', {
          orderId,
          screen: 'DriverMap',
          uiState: 'MapTab',
          data: {
            reason: 'not_in_visible_driver_map_markers',
            remainingOrderIds: visibleOrderIds,
          },
        })
        writeRawLog('ORDER_REMOVED', {
          source: 'driver-map-ui',
          screen: 'DriverMap',
          uiState: 'MapTab',
          orderId,
          reason: 'not_in_visible_driver_map_markers',
          remainingOrderIds: visibleOrderIds,
        })
      })

      writeFlowEvent('ORDERS_LIST_RENDERED', {
        screen: 'DriverMap',
        uiState: 'MapTab',
        data: renderedSummary,
      })
      writeFlowEvent('ACTIVE_ORDERS_RENDERED', {
        screen: 'DriverMap',
        uiState: 'MapTab',
        data: renderedSummary,
      })
      writeRawLog('ACTIVE_ORDERS_RENDERED', {
        source: 'driver-map-ui',
        screen: 'DriverMap',
        uiState: 'MapTab',
        ...renderedSummary,
      })
      writeFlowEvent('ORDERS_VISIBLE_ON_SCREEN', {
        screen: 'DriverMap',
        uiState: 'MapTab',
        data: {
          tab: 'map',
          userId: user?.u_id ?? null,
          visibleOrderIds: visibleMarkers.map(item => String(item.order.b_id)),
          visibleSections: visibleMarkers.map(item => ({
            section: item.section,
            orderId: item.order.b_id,
            orderState: item.order.b_state,
            hasCoords: Boolean(item.order.b_start_latitude && item.order.b_start_longitude),
            driversCount: item.order.drivers?.length ?? 0,
          })),
        },
      })
    }

    const cardsKey = visibleMarkers
      .map(item => `${item.section}:${item.order.b_id}:${item.order.b_state}:${item.order.drivers?.length ?? 0}`)
      .join('|')
    if (cardsKey === lastDriverMapOrderCardLogKeyRef.current)
      return

    lastDriverMapOrderCardLogKeyRef.current = cardsKey
    visibleMarkers.forEach((item, index) => {
      writeFlowEvent('ORDER_CARD_RENDERED', {
        orderId: item.order.b_id,
        screen: 'DriverMap',
        uiState: 'MapTab',
        data: {
          section: item.section,
          index,
          order: summarizeOrder(item.order),
          userId: user?.u_id ?? null,
        },
      })
    })
  }, [
    user?.u_id,
    activeOrders?.map(order => `${order.b_id}:${order.b_state}:${order.b_start_latitude}:${order.b_start_longitude}:${order.drivers?.length ?? 0}`).join('|'),
    visibleReadyOrders?.map(order => `${order.b_id}:${order.b_state}:${order.b_start_latitude}:${order.b_start_longitude}:${order.drivers?.length ?? 0}`).join('|'),
    visibleMapOrders.map(order => `${order.b_id}:${order.b_state}:${order.b_start_latitude}:${order.b_start_longitude}:${order.drivers?.length ?? 0}`).join('|'),
    hiddenOrderIds.join('|'),
  ])

  // Не делаем reverseGeocode для всех видимых заказов на карте.
  // Массовые запросы к Nominatim быстро дают 429/CORS и ломают выбор адресов у клиента.
  // Для плашек берём только реальные адреса из заказа/options; активный заказ ниже
  // может догрузить адрес отдельно, если backend его не вернул.

  const activeDriverOrder = useMemo(() => {
    const navigationStates = [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
    ]

    const order = activeOrders?.find(item => {
      const driver = item.drivers?.find(item => item.u_id === user?.u_id)
      return !!driver && navigationStates.includes(driver.c_state)
    })

    if (!order) return null

    const driver = order.drivers?.find(item => item.u_id === user?.u_id) ?? null
    return { order, driver }
  }, [activeOrders, user?.u_id])

  const isStartedVotingOrder = Boolean(
    activeDriverOrder?.order.b_id &&
    startedVotingOrderIds.includes(activeDriverOrder.order.b_id),
  )

  const isRouteToDestination = Boolean(
    activeDriverOrder?.driver?.c_state === EBookingDriverState.Started ||
    isStartedVotingOrder,
  )

  const performingOrder = !isRouteToDestination ? activeDriverOrder?.order : undefined
  const currentOrder = isRouteToDestination ? activeDriverOrder?.order : undefined
  const routeOrder = activeDriverOrder?.order ?? null

  const routeOrderResolvedDestination = routeOrder?.b_id ?
    resolvedDestinationAddresses[String(routeOrder.b_id)] :
    undefined

  useEffect(() => {
    if (mockEnabled || !routeOrder)
      return undefined

    const orderId = String(routeOrder.b_id)
    if (
      getOrderDestinationAddress(routeOrder, routeOrderResolvedDestination) ||
      routeOrderResolvedDestination !== undefined ||
      !routeOrder.b_destination_latitude ||
      !routeOrder.b_destination_longitude
    )
      return undefined

    let cancelled = false

    API.reverseGeocode(
      String(routeOrder.b_destination_latitude),
      String(routeOrder.b_destination_longitude),
      { details: true },
    )
      .then(response => {
        if (cancelled) return
        setResolvedDestinationAddresses(prev => ({
          ...prev,
          [orderId]: getReverseGeocodeAddress(response),
        }))
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) {
          setResolvedDestinationAddresses(prev => ({
            ...prev,
            [orderId]: '',
          }))
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    mockEnabled,
    routeOrder?.b_id,
    routeOrder?.b_destination_latitude,
    routeOrder?.b_destination_longitude,
    routeOrderResolvedDestination,
  ])

  const runMapOrderAction = (mutation: () => Promise<void>) => {
    if (mapActionPending)
      return

    setMapActionPending(true)
    mutation()
      .catch(error => {
        console.error(error)
        setMessageModal({ isOpen: true, status: EStatuses.Fail, message: t(TRANSLATION.ERROR) })
      })
      .finally(() => setMapActionPending(false))
  }

  const onMapArrivedClick = () => {
    const order = activeDriverOrder?.order
    if (!order) return

    runMapOrderAction(async() => {
      await API.setOrderState(order.b_id, EBookingDriverState.Arrived)
      if (order.b_voting)
        await API.arrivedVotingOrder(order.b_id)
      getOrder(order.b_id)
    })
  }

  const onMapStartedClick = () => {
    const order = activeDriverOrder?.order
    if (!order) return

    if (order.b_voting) {
      setOrderCardModal({ isOpen: true, orderId: order.b_id })
      return
    }

    runMapOrderAction(async() => {
      await API.setOrderState(order.b_id, EBookingDriverState.Started)
      getOrder(order.b_id)
    })
  }

  const onCompleteOrderClick = () => {
    if (!currentOrder) return

    runMapOrderAction(async() => {
      await API.setOrderState(currentOrder.b_id, EBookingDriverState.Finished)
      setStartedVotingOrderIds(removeStoredStartedVotingOrderId(currentOrder.b_id))
      getOrder(currentOrder.b_id)
      navigate(`/driver-order?tab=${EDriverTabs.Lite}`)
      setRatingModal({ isOpen: true, orderID: currentOrder.b_id })
    })
  }

  const mapPrimaryAction = useMemo(() => {
    const driverState = activeDriverOrder?.driver?.c_state
    const order = activeDriverOrder?.order
    if (!order || !driverState)
      return null

    if (driverState === EBookingDriverState.Performer)
      return {
        text: t(TRANSLATION.ARRIVED),
        className: 'finish-drive-button--arrived',
        onClick: onMapArrivedClick,
      }

    if (driverState === EBookingDriverState.Arrived)
      return {
        text: order.b_voting ? t(TRANSLATION.DRIVER_VOTING_CONFIRM_CODE) : t(TRANSLATION.WENT),
        className: 'finish-drive-button--started',
        onClick: onMapStartedClick,
      }

    if (driverState === EBookingDriverState.Started)
      return {
        text: t(TRANSLATION.CLOSE_DRIVE),
        className: 'finish-drive-button--finished',
        onClick: onCompleteOrderClick,
      }

    return null
  }, [
    activeDriverOrder?.driver?.c_state,
    activeDriverOrder?.order?.b_id,
    activeDriverOrder?.order?.b_voting,
    mapActionPending,
  ])

  const backendDriverPosition = useMemo((): [number, number] | null => {
    const latitude = Number(activeDriverOrder?.driver?.c_latitude)
    const longitude = Number(activeDriverOrder?.driver?.c_longitude)

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      return null

    return [latitude, longitude]
  }, [activeDriverOrder?.driver?.c_latitude, activeDriverOrder?.driver?.c_longitude])

  useInterval(() => {
    if (!emulatorOrdersEnabled) return

    // В режиме driver-emulator координаты водителя специально управляются эмулятором.
    // В режиме client-emulator водитель должен оставаться реальным человеком, поэтому
    // берём живой GPS браузера как основной источник, даже если backend ещё хранит
    // старую/серверную координату.
    if (isDriverEmulatorMode) return

    // Android Chrome can freeze the UI when high accuracy geolocation requests
    // overlap with map redraw + polling. Keep only one active request and avoid
    // firing it while the tab is hidden.
    if (document.hidden || browserGeoRequestPendingRef.current) return

    const now = Date.now()
    if (now - lastBrowserGeoRequestAtRef.current < 4500) return
    lastBrowserGeoRequestAtRef.current = now
    browserGeoRequestPendingRef.current = true

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        browserGeoRequestPendingRef.current = false
        setLastPositions(prev => {
          const previous = prev.length ? prev[prev.length - 1] : null
          if (previous) {
            const distanceKm = distanceBetweenEarthCoordinates(previous[0], previous[1], coords.latitude, coords.longitude)
            // Mobile GPS sometimes gives a bad single point. Ignore huge jumps so
            // the map marker does not teleport while the user stands still.
            if (distanceKm > 0.45) return prev
          }

          saveLastBrowserGeolocation({ latitude: coords.latitude, longitude: coords.longitude })
          const nextPositions = [
            ...prev.slice(-2),
            [coords.latitude, coords.longitude] as [number, number],
          ]
          return nextPositions as typeof prev
        })
      },
      error => {
        browserGeoRequestPendingRef.current = false
        console.error(error)
      },
      HIGH_ACCURACY_GEOLOCATION_OPTIONS,
    )
  }, 1000)

  const isDemoMapMovementEnabled = Boolean(
    routeOrder &&
    activeDriveRouteInfo?.points?.length &&
    isDriverEmulatorMode &&
    (
      isDriverEmulatorTargetOrder(routeOrder) ||
      isEmulatedClientOrder(routeOrder)
    ),
  )

  useEffect(() => {
    if (!isDemoMapMovementEnabled || !activeDriveRouteInfo?.points?.length) {
      setDemoDriverPosition(null)
      demoRouteIndexRef.current = 0
      demoRouteKeyRef.current = ''
      demoRouteMoveAtRef.current = 0
      return
    }

    const routeKey = [
      routeOrder?.b_id || '',
      isRouteToDestination ? 'destination' : 'pickup',
      activeDriveRouteInfo.points.length,
      activeDriveRouteInfo.points[0]?.join(','),
      activeDriveRouteInfo.points[activeDriveRouteInfo.points.length - 1]?.join(','),
    ].join(':')

    if (demoRouteKeyRef.current === routeKey) return

    demoRouteKeyRef.current = routeKey
    demoRouteIndexRef.current = 1
    demoRouteMoveAtRef.current = Date.now()
    setDemoDriverPosition(activeDriveRouteInfo.points[0] as [number, number])
  }, [isDemoMapMovementEnabled, activeDriveRouteInfo, routeOrder?.b_id, isRouteToDestination])

  useInterval(() => {
    if (!isDemoMapMovementEnabled || !activeDriveRouteInfo?.points?.length) return

    const now = Date.now()
    const elapsedSeconds = demoRouteMoveAtRef.current ? Math.max(.5, (now - demoRouteMoveAtRef.current) / 1000) : 1
    demoRouteMoveAtRef.current = now

    setDemoDriverPosition((previous) => {
      const startPoint = previous || (activeDriveRouteInfo.points[0] as [number, number])
      const stepMeters = Math.min(80, Math.max(10, elapsedSeconds * DEMO_DRIVER_ROUTE_SPEED_MPS))
      const moved = moveAlongRoutePoints(startPoint, activeDriveRouteInfo.points, stepMeters, demoRouteIndexRef.current)
      demoRouteIndexRef.current = moved.index
      return moved.point
    })
  }, 1000)

  const browserDriverPosition = useMemo((): [number, number] | null => {
    if (!lastPositions || !lastPositions.length) return null
    const last = lastPositions[lastPositions.length - 1]
    return [last[0], last[1]]
  }, [lastPositions])

  // Мемоизируем текущую позицию маркера (чтобы React не пересоздавал <Marker> из-за новой ссылки на массив)
  const currentPosition = useMemo((): [number, number] | null => {
    if (isDemoMapMovementEnabled && demoDriverPosition) return demoDriverPosition

    // Client emulator создаёт пассажирские заказы, но водитель остаётся реальным.
    // Поэтому сначала берём GPS этого браузера, а серверную координату используем
    // только как fallback, пока GPS ещё не пришёл.
    if (isClientEmulatorMode && !isDriverEmulatorMode && browserDriverPosition)
      return browserDriverPosition

    if (backendDriverPosition) return backendDriverPosition
    if (browserDriverPosition) return browserDriverPosition
    return null
  }, [
    isDemoMapMovementEnabled,
    demoDriverPosition,
    isClientEmulatorMode,
    isDriverEmulatorMode,
    browserDriverPosition,
    backendDriverPosition,
  ])

  const centerOnDriver = () => {
    if (!currentPosition) return
    if (isLeafletMapConnected(map))
      safeLeafletAction(() => map.setView(currentPosition, Math.max(map.getZoom(), 16)))
  }

  // §10 уровень детализации по зуму: далеко ≤12, средне 13–15, близко ≥16.
  const detailLevel: 'far' | 'mid' | 'near' = zoomLevel <= 12 ? 'far' : zoomLevel >= 16 ? 'near' : 'mid'

  // Контекст рендера мок-маркеров: к базовому ctx добавляем позицию водителя (для
  // расстояния в хинте) и уровень детализации. Мемоизирован, чтобы кластер не пересобирался зря.
  const mockRenderCtx = useMemo<IMarkerRenderCtx>(
    () => ({ ...markerCtx, driverPosition: currentPosition, detail: detailLevel }),
    [markerCtx, currentPosition, detailLevel],
  )

  // Ключ пересборки кластера: только то, что реально влияет на вид маркеров. Позицию
  // водителя учитываем (огрублённо) лишь на близком зуме, где показывается расстояние в хинте.
  const clusterRefreshKey = useMemo(() => {
    const pos = detailLevel === 'near' && currentPosition
      ? `${currentPosition[0].toFixed(4)},${currentPosition[1].toFixed(4)}`
      : ''
    return [
      detailLevel,
      selectedOrderId || '',
      performingOrder?.b_id || '',
      pos,
    ].join('|')
  }, [detailLevel, selectedOrderId, performingOrder?.b_id, currentPosition])

  // Клик по мок-маркеру: выделение (§12) + dev-оверлей с ID. Карточку заказа в моке не открываем.
  const onMockMarkerClick = useCallback((order: IOrder, performing: boolean) => {
    setSelectedOrderId(String(order.b_id))
    // Продление VOTE кликом (§5: клиент тянет таймер вверх). +30 c к жизни заказа;
    // бампаем тик, чтобы кольцо/счётчик обновились сразу, не дожидаясь секунды.
    if (getOrderLifeMode(order) === 'vote') {
      extendMockVoteLife(order.b_id, 30000)
      setMockTick(value => (value + 1) % 1_000_000)
    }
    if (!isMarkerDebugEnabled())
      return
    if (debugMarkerTimeoutRef.current)
      window.clearTimeout(debugMarkerTimeoutRef.current)
    setDebugMarkerInfo(buildMarkerDebugInfo(order, performing, markerCtx))
    debugMarkerTimeoutRef.current = window.setTimeout(() => setDebugMarkerInfo(null), 7000)
  }, [markerCtx])

  const currentOrderDestination = useMemo((): [number, number] | null => {
    if (!routeOrder?.b_destination_latitude || !routeOrder?.b_destination_longitude) return null
    return [
      routeOrder.b_destination_latitude,
      routeOrder.b_destination_longitude,
    ]
  }, [routeOrder?.b_destination_latitude, routeOrder?.b_destination_longitude])

  const currentOrderStart = useMemo((): [number, number] | null => {
    if (!routeOrder?.b_start_latitude || !routeOrder?.b_start_longitude) return null
    return [
      routeOrder.b_start_latitude,
      routeOrder.b_start_longitude,
    ]
  }, [routeOrder?.b_start_latitude, routeOrder?.b_start_longitude])

  const currentRouteTarget = useMemo((): [number, number] | null => {
    if (isRouteToDestination)
      return currentOrderDestination

    return currentOrderStart
  }, [isRouteToDestination, currentOrderDestination, currentOrderStart])

  const currentRouteStart = useMemo((): [number, number] | null => {
    if (currentPosition)
      return currentPosition

    return currentOrderStart
  }, [currentPosition, currentOrderStart])

  const displayedActiveDriveRoutePoints = useMemo(() =>
    trimRoutePointsToPosition(activeDriveRouteInfo?.points, currentPosition),
  [activeDriveRouteInfo, currentPosition])

  const routeAreasRequestKey = useMemo(() => {
    if (!currentRouteStart || !currentRouteTarget) return ''

    return [
      ...currentRouteStart,
      ...currentRouteTarget,
    ].map(value => value.toFixed(4)).join(';')
  }, [currentRouteStart, currentRouteTarget])

  useEffect(() => {
    if (mockEnabled) return
    if (!currentRouteStart || !currentRouteTarget) return

    getAreasBetweenPoints([currentRouteStart, currentRouteTarget])
  }, [mockEnabled, routeAreasRequestKey, getAreasBetweenPoints])

  useEffect(() => {
    if (mockEnabled) return
    if (!currentRouteTarget) return
    const fitKey = `${routeOrder?.b_id || ''}:${isRouteToDestination ? 'destination' : 'pickup'}`
    if (fittedDestinationOrderRef.current === fitKey) return

    fittedDestinationOrderRef.current = fitKey

    if (currentRouteStart) {
      if (isLeafletMapConnected(map))
        safeLeafletAction(() => map.fitBounds([currentRouteStart, currentRouteTarget], {
          padding: [60, 90],
          maxZoom: 16,
        }))
      return
    }

    if (isLeafletMapConnected(map))
      safeLeafletAction(() => map.setView(currentRouteTarget, Math.max(map.getZoom(), 15)))
  }, [mockEnabled, map, routeOrder?.b_id, currentRouteTarget, currentRouteStart])

  useEffect(() => {
    // В мок-режиме маршрут по дорогам не строим (никаких обращений к бэку);
    // направление заказа показываем своими пунктирными линиями (см. ниже).
    if (mockEnabled) {
      setActiveDriveRouteInfo(null)
      return
    }
    if (!currentRouteStart || !currentRouteTarget) {
      if (activeDriveRouteInfo) {
        writeFlowEvent('MAP_ROUTE_RESET', {
          screen: 'DriverMap',
          uiState: 'MapTab',
          data: {
            reason: 'no_current_route_target_or_start',
            routeOrderId: routeOrder?.b_id ?? null,
            emulatorOrdersEnabled,
          },
        })
        writeRawLog('MAP_ROUTE_RESET', {
          source: 'driver-map-ui',
          screen: 'DriverMap',
          uiState: 'MapTab',
          reason: 'no_current_route_target_or_start',
          routeOrderId: routeOrder?.b_id ?? null,
          emulatorOrdersEnabled,
        })
      }
      setActiveDriveRouteInfo(null)
      lastRoutePointRef.current = null
      lastRouteTargetRef.current = null
      lastRouteGraphRef.current = null
      return
    }

    const from: IAddressPoint = {
      latitude: currentRouteStart[0],
      longitude: currentRouteStart[1],
    }
    const to: IAddressPoint = {
      latitude: currentRouteTarget[0],
      longitude: currentRouteTarget[1],
    }
    const lastRoutePoint = lastRoutePointRef.current
    const lastRouteTarget = lastRouteTargetRef.current
    if (
      activeDriveRouteInfo &&
      lastRoutePoint &&
      lastRouteTarget &&
      lastRouteGraphRef.current === wayGraph &&
      distanceBetweenEarthCoordinates(
        lastRoutePoint.latitude!,
        lastRoutePoint.longitude!,
        from.latitude!,
        from.longitude!,
      ) < 0.8 &&
      distanceBetweenEarthCoordinates(
        lastRouteTarget.latitude!,
        lastRouteTarget.longitude!,
        to.latitude!,
        to.longitude!,
      ) < 0.03
    )
      return

    let changed = false
    lastRoutePointRef.current = from
    lastRouteTargetRef.current = to
    lastRouteGraphRef.current = wayGraph

    makeRoutePointsSafe(from, to, wayGraph)
      .then((info) => {
        if (changed) return
        setActiveDriveRouteInfo(info)
      })
      .catch((error) => {
        console.error(error)
        if (!changed && !activeDriveRouteInfo)
          setActiveDriveRouteInfo(null)
      })

    return () => {
      changed = true
    }
  }, [mockEnabled, currentRouteStart, currentRouteTarget, wayGraph, activeDriveRouteInfo, routeOrder?.b_id, emulatorOrdersEnabled])


  const routeDestinationAddress = routeOrder ?
    getOrderDestinationAddress(routeOrder, resolvedDestinationAddresses[String(routeOrder.b_id)]) :
    ''

  return (
    <>
      <TileLayer
        attribution={getAttribution()}
        url={getTileServerUrl()}
      />
      <div
        className="ds-dev-panel"
        ref={(el) => {
          if (!el) return
          try {
            L.DomEvent.disableClickPropagation(el)
            L.DomEvent.disableScrollPropagation(el)
          } catch (_) {}
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`ds-dev-panel__toggle${mockEnabled ? ' ds-dev-panel__toggle--on' : ''}`}
          onClick={() => setMarkerMockEnabled(!mockEnabled)}
        >
          {mockEnabled ? 'Мок ДС: вкл' : 'Мок ДС: выкл'}
        </button>
        <label className="ds-dev-panel__slider">
          <span>Прозрачность хинтов: {hintBgAlpha}%</span>
          <input
            type="range"
            min={0}
            max={100}
            value={hintBgAlpha}
            onChange={(event) => setHintBgAlpha(Number(event.target.value))}
          />
        </label>
      </div>
      {mockEnabled && (
        <div
          className="ds-filters"
          ref={(el) => {
            if (!el) return
            try {
              L.DomEvent.disableClickPropagation(el)
              L.DomEvent.disableScrollPropagation(el)
            } catch (_) {}
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          {DS_FILTER_DEFS.map((def) => (
            <button
              type="button"
              key={def.key}
              className={`ds-filters__chip${mapFilters[def.key] ? ' ds-filters__chip--on' : ''}`}
              onClick={() => setMapFilters((prev) => ({ ...prev, [def.key]: !prev[def.key] }))}
            >
              <span className="ds-filters__icon" dangerouslySetInnerHTML={{ __html: def.icon }} />
              <span className="ds-filters__label">{def.label}</span>
            </button>
          ))}
        </div>
      )}
      {mockEnabled && (
        <div
          className="ds-legend"
          ref={(el) => {
            if (!el) return
            try {
              L.DomEvent.disableClickPropagation(el)
              L.DomEvent.disableScrollPropagation(el)
            } catch (_) {}
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onTouchStart={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="ds-legend__toggle"
            onClick={() => setLegendOpen((value) => !value)}
          >
            {legendOpen ? 'Легенда ✕' : 'Легенда'}
          </button>
          {legendOpen && (
            <div className="ds-legend__body">
              <div className="ds-legend__col">
                {DS_LEGEND_STATUSES.map((item) => (
                  <div className="ds-legend__row" key={item.label}>
                    <span className="ds-legend__icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
                    <span className="ds-legend__label">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="ds-legend__col">
                {DS_LEGEND_ROUTEFIT.map((item) => (
                  <div className="ds-legend__row" key={item.label}>
                    <span className="ds-legend__icon" dangerouslySetInnerHTML={{ __html: item.icon }} />
                    <span className="ds-legend__label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {debugMarkerInfo && (
        <div
          className="order-marker-debug-overlay"
          onClick={() => setDebugMarkerInfo(null)}
        >
          <pre className="order-marker-debug-overlay__body">{[
            `ID:     ${debugMarkerInfo.orderId}`,
            `FSM:    ${debugMarkerInfo.status}`,
            `TYPE:   ${debugMarkerInfo.type}`,
            'FACTS:',
            `  RouteFit: ${debugMarkerInfo.routeFit}`,
            `  OfferAge: ${debugMarkerInfo.offerAge}`,
            `  Profit:   ${debugMarkerInfo.profit}`,
            `  ETA:      ${debugMarkerInfo.eta}`,
          ].join('\n')}</pre>
        </div>
      )}
      {currentPosition && (
        <button
          type="button"
          className="driver-order-map-mode__locate-button"
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            centerOnDriver()
          }}
          aria-label={t(TRANSLATION.SHOW_MY_LOCATION)}
        >
          <img src={images.mapLocationButton} alt="" />
        </button>
      )}
      {
        // Заменяем lastPositions.map() на одиночный <Marker> с мемоизированной позицией и arrowIconRef.current
        currentPosition && (
          <SmoothRotatingMarker
            position={currentPosition}
            iconUrl={images.mapArrow}
            className="driver-arrow-divicon smooth-rotating-marker"
            iconAnchor={[20, 20]}
            popupAnchor={[0, -22]}
            speedKmh={96}
            path={activeDriveRouteInfo?.points}
            zIndexOffset={3000}
          />
        )
      }
      {
        !!lastPositions.length && !isDriverEmulatorMode &&
        <Polyline positions={lastPositions} />
      }
      {
        activeDriveRouteInfo && (
          <Polyline
            positions={displayedActiveDriveRoutePoints.length > 1 ? displayedActiveDriveRoutePoints : activeDriveRouteInfo.points}
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
      {
        currentOrderDestination && (
          <Marker
            position={currentOrderDestination}
            icon={new L.Icon({
              iconUrl: images.markerTo,
              iconSize: [36, 41],
              iconAnchor: [18, 41],
              popupAnchor: [0, -35],
            })}
          >
            <Tooltip direction="top" offset={[0, -40]} opacity={1} permanent>
              {formatDriverPointTooltip(t(TRANSLATION.TO), routeDestinationAddress)}
            </Tooltip>
            <Popup>
              {t(TRANSLATION.TO)}
              {!!routeDestinationAddress && `: ${routeDestinationAddress}`}
            </Popup>
          </Marker>
        )
      }
      {
        currentOrderStart && (
          <Marker
            position={currentOrderStart}
            icon={new L.Icon({
              iconUrl: images.markerFrom,
              iconSize: [35, 41],
              iconAnchor: [18, 41],
              popupAnchor: [0, -35],
            })}
          >
            <Popup>
              {t(TRANSLATION.FROM)}
              {!!routeOrder?.b_start_address && `: ${routeOrder.b_start_address}`}
            </Popup>
          </Marker>
        )
      }
      {
        // §7 Направление заказа: пунктир от маркера к точке назначения. Только в мок-режиме
        // и от среднего зума (§10: на дальнем — скрыто); координаты назначения берём из заказа.
        mockEnabled && detailLevel !== 'far' && filteredMapOrders
          .filter(item =>
            item.b_start_latitude && item.b_start_longitude &&
            item.b_destination_latitude && item.b_destination_longitude,
          )
          .map(item => {
            const dirPositions = [
              [item.b_start_latitude, item.b_start_longitude],
              [item.b_destination_latitude, item.b_destination_longitude],
            ] as L.LatLngExpression[]
            return (
              // Два слоя: белая обводка-халанг под пунктиром + тёмный пунктир сверху,
              // чтобы направление читалось на любом фоне карты (серое на сером сливалось).
              <React.Fragment key={`ds-dir-${item.b_id}`}>
                <Polyline
                  positions={dirPositions}
                  pathOptions={{ color: '#FFFFFF', weight: 6, opacity: 0.95, dashArray: '7 7', lineCap: 'round', lineJoin: 'round' }}
                />
                <Polyline
                  positions={dirPositions}
                  pathOptions={{ color: '#1B2430', weight: 3, opacity: 1, dashArray: '7 7', lineCap: 'round', lineJoin: 'round' }}
                />
              </React.Fragment>
            )
          })
      }
      {
        // §9: в мок-режиме маркеры идут через кластерный слой (markercluster).
        mockEnabled && (
          <MockClusterLayer
            orders={filteredMapOrders}
            ctx={mockRenderCtx}
            refreshKey={clusterRefreshKey}
            tick={mockTick}
            performingOrderId={performingOrder?.b_id}
            farMaxZoom={12}
            nearMinZoom={16}
            onMarkerClick={onMockMarkerClick}
          />
        )
      }
      {
        // Реальный режим — прежний рендер маркеров (без кластеров), поведение не меняем.
        !mockEnabled && filteredMapOrders
          .filter(item => item.b_start_latitude && item.b_start_longitude)
          .map(item =>
            <Marker
              position={[item.b_start_latitude, item.b_start_longitude] as L.LatLngExpression}
              icon={new L.DivIcon({
                iconAnchor: [24, 49],
                popupAnchor: [0, -44],
                iconSize: [48, 52],
                shadowSize: [29, 40],
                shadowAnchor: [7, 40],
                html: getOrderMarkerHtml(item, item === performingOrder, resolvedDestinationAddresses[String(item.b_id)], { ...markerCtx, driverPosition: currentPosition }),
              })}
              eventHandlers={{
                click: (event) => {
                  try {
                    event.originalEvent?.preventDefault?.()
                    event.originalEvent?.stopPropagation?.()
                    L.DomEvent.stopPropagation(event.originalEvent)
                  } catch (_) {}
                  setSelectedOrderId(String(item.b_id))
                  showMarkerDebugOverlay(item, item === performingOrder)
                  // В мок-режиме карточку заказа не открываем — данных на бэке нет,
                  // тап только выделяет маркер (§12 «выбрано») и показывает диагностику.
                  if (!mockEnabled)
                    setOrderCardModal({ isOpen: true, orderId: item.b_id })
                },
              }}
              key={item.b_id}
            />,
          )
      }
      <button
        className='no-coords-orders'
        onClick={() => navigate(`/driver-order?tab=${EDriverTabs.Detailed}`)}
      >
        {
          (
            !!visibleMapOrders && visibleMapOrders
              .filter(item => !item.b_start_latitude || !item.b_start_longitude)
              .length
          ) || 0
        }
      </button>
      {
        mapPrimaryAction && (
          <Button
            text={mapPrimaryAction.text}
            className={`finish-drive-button ${mapPrimaryAction.className}`}
            onClick={mapPrimaryAction.onClick}
            disabled={mapActionPending}
            fixedSize={false}
          />
        )
      }
      {/* {
        !!activeOrders?.length && (
          <div
            style={{
              zIndex: 400,
              position: 'absolute',
              left: '70px',
              right: '70px',
            }}
          >
            {
              activeOrders.map(order => (
                <ChatToggler
                  anotherUserID={order.u_id}
                  orderID={order.b_id}
                  key={order.b_id}
                />
              ))
            }
          </div>
        )
      } */}
    </>
  )
}


function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getAddressString(value?: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number')
    return String(value).replace(/\s+/g, ' ').trim()

  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    return getAddressString(
      source.shortAddress ||
      source.address ||
      source.formattedAddress ||
      source.formatted_address ||
      source.displayName ||
      source.name ||
      source.title ||
      source.label ||
      source.text,
    )
  }

  return ''
}

function isGeneratedAddressPlaceholder(value?: unknown) {
  const address = getAddressString(value).toLowerCase()
  if (!address) return false

  return [
    /^точка\s+(подачи|назначения|нажатия)(\s+|$)/i,
    /рядом\s+с\s+(вами|нами)/i,
    /с\s+(вами|нами)$/i,
    /^destination\s+point/i,
    /^pickup\s+point/i,
  ].some(pattern => pattern.test(address))
}

function pickRealAddress(...values: unknown[]) {
  for (const value of values) {
    const address = getAddressString(value)
    if (address && !isGeneratedAddressPlaceholder(address)) return address
  }
  return ''
}

function getReverseGeocodeAddress(response: any) {
  return pickRealAddress(
    response?.display_name,
    response?.displayName,
    response?.address?.road && response?.address?.city ?
      `${response.address.road}, ${response.address.city}` :
      '',
    response?.address?.road && response?.address?.town ?
      `${response.address.road}, ${response.address.town}` :
      '',
    response?.address?.suburb && response?.address?.city ?
      `${response.address.suburb}, ${response.address.city}` :
      '',
    response?.address?.suburb,
    response?.name,
  )
}

function shortenAddress(value?: unknown, limit = 38) {
  const text = getAddressString(value)
  if (!text) return ''

  const parts = text
    .split(',')
    .map(part => part.replace(/^(откуда|куда)\s*:?\s*/i, '').trim())
    .filter(Boolean)
  const meaningfulPart = parts.find(part => /[a-zа-яё]/i.test(part) && part.length > 2)
  const firstPart = meaningfulPart || parts.find(Boolean) || text
  const cleanText = firstPart.replace(/^(откуда|куда)\s*:?\s*/i, '').trim() || firstPart
  return cleanText.length > limit ? `${cleanText.slice(0, Math.max(0, limit - 1))}…` : cleanText
}

function getOrderDestinationAddress(order: IOrder, resolvedDestinationAddress?: string) {
  const options = (order as any)?.b_options || {}
  const pricingOptions = options?.pricingModel?.options || {}

  // Важно: не показываем технические заглушки типа
  // "Точка назначения рядом с вами". Сначала берём реальный адрес заказа,
  // потом адрес из геокодера, потом расширенные поля options, и только в
  // последнюю очередь короткие поля options, если они не являются заглушками.
  return pickRealAddress(
    order.b_destination_address,
    resolvedDestinationAddress,
    options.toAddress,
    options.destinationAddress,
    options.destination,
    options.to,
    pricingOptions.toAddress,
    pricingOptions.destinationAddress,
    options.toShortAddress,
    options.destinationShortAddress,
    pricingOptions.toShortAddress,
  )
}

function formatDriverPointTooltip(label: string, address?: unknown) {
  const short = shortenAddress(address)
  return short ? `${label}: ${short}` : label
}

function getSafeOrderTime(order: IOrder) {
  try {
    return order.b_start_datetime?.format ? order.b_start_datetime.format(dateFormatTimeShort) : ''
  } catch {
    return ''
  }
}

function getEstimatedProfit(order: IOrder) {
  if (typeof order.profit === 'number' && Number.isFinite(order.profit))
    return order.profit

  const price = Number(order.b_price_estimate || (order as any).b_price || (order as any).price || 0)
  const tips = Number(order.b_tips || 0)
  const passengerBonus = Number(order.b_passengers_count || 0) * 3
  const fallback = price + tips + passengerBonus
  return Number.isFinite(fallback) && fallback > 0 ? fallback : undefined
}

function getProfitRankClass(order: IOrder) {
  const rank = order.profitRank
  if (rank !== undefined) {
    return {
      [EOrderProfitRank.Low]: 'low',
      [EOrderProfitRank.Medium]: 'medium',
      [EOrderProfitRank.High]: 'high',
    }[rank]
  }

  const profit = getEstimatedProfit(order)
  if (profit === undefined) return ''
  if (profit >= 200) return 'high'
  if (profit >= 100) return 'medium'
  return 'low'
}

function getOrderModeIcon(order: IOrder, performing: boolean) {
  if (performing) return images.mapOrderPerforming
  if (isVotingOrder(order)) return images.mapOrderVoting
  if (isOfferOrder(order)) return images.mapOrderWating
  return images.mapOrderWating
}

/* ============================================================================
 *  Дизайн-система маркера заказа (редизайн + FSM)
 *  Форма = тип заказа, символ = статус голосования, цвет = вспомогательный.
 *  Всё читается по форме/символу (ч/б-режим, дальтоники).
 *  Маппинг на FSM идёт по реальным сигналам заказа; недостающие состояния
 *  вынесены в хуки (см. getOrderDSStatus) — данные лежат вне этой функции.
 * ========================================================================== */
const DS_COLORS = {
  beige: '#F2E7C9', purple: '#7B61FF', yellow: '#FFC107',
  green: '#2EAF5B', grey: '#9AA0A6', red: '#E53935', ink: '#2b2b2b',
  orange: '#FB8C00', blue: '#2196F3',
}

type TDSOrderType = 'passenger' | 'delivery' | 'marshrutka'
type TDSOrderStatus = 'new' | 'responded' | 'driverAnswered' | 'won' | 'expired'

const DS_STATUS_META: Record<TDSOrderStatus, { color: string, mark: 'check' | 'double' | 'cross' | null }> = {
  new:            { color: DS_COLORS.beige,  mark: null },
  responded:      { color: DS_COLORS.yellow, mark: 'check' },
  driverAnswered: { color: DS_COLORS.purple, mark: 'check' },
  won:            { color: DS_COLORS.green,  mark: 'double' },
  expired:        { color: DS_COLORS.grey,   mark: 'cross' },
}

/* --- Поставщики фактов: каждая функция делает одно вычисление, без сайд-эффектов --- */

// Признак доставки/курьера. Реальный сигнал — b_options.courier_auto (курьерская
// машина). Демо-мок дополнительно проставляет b_options.ds_order_type='delivery'.
function isDeliveryOrder(order: IOrder): boolean {
  const raw = order as any
  if (raw?.b_options?.courier_auto)
    return true

  const optionType = String(raw?.b_options?.ds_order_type ?? '').toLowerCase()
  return optionType === 'delivery' || optionType === 'courier' || optionType === 'cargo'
}

// Тип заказа (форма маркера, §3). Сначала явная метка ds_order_type (мок/бэк, если
// появится), затем эвристика по реальным данным. Тип НЕ зависит от режима распределения.
function getOrderDSType(order: IOrder): TDSOrderType {
  const explicit = String((order as any)?.b_options?.ds_order_type ?? '').toLowerCase()
  if (explicit === 'marshrutka') return 'marshrutka'
  if (explicit === 'delivery') return 'delivery'
  if (explicit === 'passenger') return 'passenger'

  if (isVotingOrder(order)) return 'marshrutka'
  if (isDeliveryOrder(order)) return 'delivery'
  return 'passenger'
}

type TOrderDistributionMode = 'voting' | 'fixed'

// Режим распределения (§11 «Голосование»/фикс) — НЕЗАВИСИМАЯ от типа ось. Явная метка
// ds_order_mode, иначе — по реальному признаку голосования.
function getOrderDistributionMode(order: IOrder): TOrderDistributionMode {
  const explicit = String((order as any)?.b_options?.ds_order_mode ?? '').toLowerCase()
  if (explicit === 'voting') return 'voting'
  if (explicit === 'fixed') return 'fixed'
  return isVotingOrder(order) ? 'voting' : 'fixed'
}

// Возраст времени-метки (Moment | number) в миллисекундах эпохи, иначе null.
function getTimestampMs(value: any): number | null {
  try {
    const ms = Number(value?.valueOf?.())
    return Number.isFinite(ms) && ms > 0 ? ms : null
  } catch {
    return null
  }
}

function clampPct(pct: number): number {
  return Math.min(100, Math.max(0, pct))
}

// Полное окно жизни заказа: реальное b_max_waiting (сек), иначе базовый
// DRIVER_OFFER_LIFETIME_MS. Так же, как в isVotingOrderExpired/formatVotingRemaining.
function getOfferLifetimeMs(order: IOrder): number {
  const waitingSeconds = Number(order.b_max_waiting)
  return Number.isFinite(waitingSeconds) && waitingSeconds > 0
    ? waitingSeconds * 1000
    : DRIVER_OFFER_LIFETIME_MS
}

// Реальный остаток жизни заказа (voting/offer) — серверное remaining_lifetime_seconds.
// null — если поля нет (обычные заказы); тогда возраст считаем от времени создания.
function getOrderRemainingSeconds(order: IOrder): number | null {
  const value = Number(order.remaining_lifetime_seconds)
  return Number.isFinite(value) ? Math.max(0, value) : null
}

// Время создания заказа из реальных полей: b_created (приходит с backend и
// конвертируется в Moment в tools/convert.ts), b_start_datetime как запасной.
function getOrderCreatedMs(order: IOrder): number | null {
  return getTimestampMs(order.b_created) ?? getTimestampMs(order.b_start_datetime)
}

// Сколько прожил заказ-офер в процентах 0..100. Источник — реальные поля заказа,
// тот же приоритет, что и в остальном приложении: серверный остаток
// remaining_lifetime_seconds, иначе возраст от b_created относительно окна жизни.
// null — если в данных нет ни остатка, ни времени создания (кольцо не рисуем).
function getOfferAgePct(order: IOrder): number | null {
  // Живой таймер мока имеет приоритет: vote/offer дают убывающее кольцо в реальном
  // времени; direct — без убывающего кольца (его индикатор — нарастающий счётчик).
  const lifeMode = getOrderLifeMode(order)
  if (lifeMode === 'direct') return null
  if (lifeMode === 'vote' || lifeMode === 'offer') {
    const livePct = getOrderLifeAgePct(order)
    if (livePct !== null) return livePct
  }

  const lifetimeMs = getOfferLifetimeMs(order)

  const remainingSeconds = getOrderRemainingSeconds(order)
  if (remainingSeconds !== null)
    return clampPct(100 - ((remainingSeconds * 1000) / lifetimeMs) * 100)

  const createdMs = getOrderCreatedMs(order)
  if (createdMs === null) return null

  return clampPct(((Date.now() - createdMs) / lifetimeMs) * 100)
}

function isOfferAgeExpired(order: IOrder): boolean {
  const agePct = getOfferAgePct(order)
  return agePct !== null && agePct >= 100
}

// На заказ откликнулся какой-либо водитель (Performer/Considering).
function hasAnsweringDriver(order: IOrder): boolean {
  return Boolean(order.drivers?.some(driver =>
    driver.c_state === EBookingDriverState.Performer ||
    driver.c_state === EBookingDriverState.Considering,
  ))
}

// Текущий водитель уже откликнулся на заказ (есть его u_id среди drivers в активном
// статусе). Требует u_id — он приходит в маркер через ctx (currentUserId).
function hasRespondedSelf(order: IOrder, currentUserId?: string): boolean {
  if (!currentUserId)
    return false

  return Boolean(order.drivers?.some(driver =>
    String(driver.u_id) === String(currentUserId) &&
    (driver.c_state === EBookingDriverState.Performer ||
      driver.c_state === EBookingDriverState.Considering),
  ))
}

// Азимут (0..360) по дуге большого круга из точки старта в точку назначения.
function getBearingDeg(fromLat: number, fromLng: number, toLat: number, toLng: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const toDeg = (rad: number) => (rad * 180) / Math.PI
  const lat1 = toRad(fromLat)
  const lat2 = toRad(toLat)
  const dLng = toRad(toLng - fromLng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

// Наименьшая разница между двумя курсами в градусах (0..180).
function getHeadingDiffDeg(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

type TRouteFit = 'ideal' | 'small' | 'strong' | 'against'

// Совпадение направления заказа (азимут start->destination) с курсом водителя.
// null — если курс водителя недоступен (стрелку не рисуем).
function getRouteFit(order: IOrder, driverHeadingDeg?: number): TRouteFit | null {
  // TODO(hook): источник курса водителя (GPS heading) вне scope маркера.
  if (driverHeadingDeg === undefined || driverHeadingDeg === null || !Number.isFinite(driverHeadingDeg))
    return null

  const fromLat = Number(order.b_start_latitude)
  const fromLng = Number(order.b_start_longitude)
  const toLat = Number(order.b_destination_latitude)
  const toLng = Number(order.b_destination_longitude)
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite))
    return null

  const diff = getHeadingDiffDeg(getBearingDeg(fromLat, fromLng, toLat, toLng), driverHeadingDeg)
  if (diff <= 30) return 'ideal'
  if (diff <= 75) return 'small'
  if (diff <= 120) return 'strong'
  return 'against'
}

// Короткий диспетчер FSM-статуса: вся логика вынесена в поставщиков выше.
// responded (мой отклик, жёлтый ✓) и driverAnswered (чужой отклик, фиолетовый ✓)
// различаются по currentUserId — он приходит в маркер через ctx.
function getOrderDSStatus(order: IOrder, performing: boolean, currentUserId?: string): TDSOrderStatus {
  if (performing) return 'won'
  if (hasRespondedSelf(order, currentUserId)) return 'responded'
  if (hasAnsweringDriver(order)) return 'driverAnswered'
  if (isOfferAgeExpired(order)) return 'expired'
  return 'new'
}

function dsTypeGlyph(type: TDSOrderType): string {
  if (type === 'delivery')
    // Синяя посылка (§3 Доставка, #2196F3) с белой «лентой»-крестом.
    return `<g><rect x='18.5' y='13.5' width='11' height='11' rx='1.5' fill='${DS_COLORS.blue}' stroke='${DS_COLORS.ink}' stroke-width='1'/><path d='M24 13.5 L24 24.5 M18.5 19 L29.5 19' fill='none' stroke='#fff' stroke-width='1.2' stroke-opacity='0.9'/></g>`
  if (type === 'marshrutka')
    return `<path d='M24 12 L30 15.5 L30 22.5 L24 26 L18 22.5 L18 15.5 Z' fill='none' stroke='${DS_COLORS.ink}' stroke-width='2'/>`
  return `<g fill='none' stroke='${DS_COLORS.ink}' stroke-width='2' stroke-linecap='round'><circle cx='24' cy='15.5' r='2.6'/><path d='M19.5 25 C19.5 20 28.5 20 28.5 25'/></g>`
}

function dsStatusBadge(mark: 'check' | 'double' | 'cross' | null, color: string): string {
  if (!mark) return ''
  const ring = `<circle cx='34' cy='25' r='7.5' fill='#fff' stroke='${color}' stroke-width='1.5'/>`
  if (mark === 'check')
    return `${ring}<path d='M30.5 25 L33 27.5 L38 21' fill='none' stroke='${color}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>`
  if (mark === 'double')
    return `${ring}<g fill='none' stroke='${color}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M29 25 L31.3 27.5 L34.8 21.5'/><path d='M33.2 25 L35.5 27.5 L39 21'/></g>`
  return `${ring}<path d='M31 22 L37 28 M37 22 L31 28' stroke='${color}' stroke-width='2' stroke-linecap='round'/>`
}

// Цвет кольца по остатку жизни офера — пороги под скриншот ДС (§6):
// ~100% зелёный, 75% жёлтый, 30% оранжевый, 10% красный. Зелёный только выше ~80%.
function dsOfferRingColor(remainingPct: number): string {
  if (remainingPct > 80) return DS_COLORS.green
  if (remainingPct > 40) return DS_COLORS.yellow
  if (remainingPct > 12) return DS_COLORS.orange
  return DS_COLORS.red
}

// Кольцо времени жизни офера вокруг головы пина. Рисуется ПОД глифом типа и
// бейджем статуса (они кладутся поверх), поэтому их не перекрывает.
function dsOfferRing(agePct: number): string {
  const remaining = Math.min(100, Math.max(0, 100 - agePct))
  const r = 10
  const circumference = 2 * Math.PI * r
  const dash = (remaining / 100) * circumference
  const track = `<circle cx='24' cy='19' r='${r}' fill='none' stroke='rgba(43,43,43,0.18)' stroke-width='2'/>`
  const arc = `<circle cx='24' cy='19' r='${r}' fill='none' stroke='${dsOfferRingColor(remaining)}' stroke-width='2' stroke-linecap='round' stroke-dasharray='${dash.toFixed(2)} ${circumference.toFixed(2)}' transform='rotate(-90 24 19)'/>`
  return `${track}${arc}`
}

// Глиф стрелки RouteFit внутри бейджа (центр 14,25).
function dsRouteFitGlyph(fit: TRouteFit, color: string): string {
  const stroke = `fill='none' stroke='${color}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'`
  if (fit === 'ideal')   // ↑
    return `<path d='M14 28.4 L14 21.6 M11.6 24 L14 21.6 L16.4 24' ${stroke}/>`
  if (fit === 'small')   // ↗
    return `<path d='M11.6 27.4 L16.4 22.6 M13.2 22.6 L16.4 22.6 L16.4 25.8' ${stroke}/>`
  if (fit === 'strong')  // →
    return `<path d='M10.6 25 L17.4 25 M15 22.6 L17.4 25 L15 27.4' ${stroke}/>`
  return `<path d='M11.5 22 L16.5 28 M16.5 22 L11.5 28' ${stroke}/>` // against ✗
}

// Бейдж RouteFit в нижнем-левом углу пина — разнесён со статусным бейджем (нижний-правый).
function dsRouteFitBadge(fit: TRouteFit | null): string {
  if (!fit) return ''
  const color = fit === 'ideal' ? DS_COLORS.green
    : fit === 'small' ? DS_COLORS.yellow
      : fit === 'strong' ? DS_COLORS.orange
        : DS_COLORS.red
  const ring = `<circle cx='14' cy='25' r='6.5' fill='#fff' stroke='${color}' stroke-width='1.5'/>`
  return `${ring}${dsRouteFitGlyph(fit, color)}`
}

// Источник ETA для диагностики (оценочное время ожидания в секундах).
function getOrderEtaText(order: IOrder): string {
  const seconds = Number(order.b_estimate_waiting)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return `${Math.max(1, Math.round(seconds / 60))} мин`
}

// Контекст рендера маркера: данные, которых нет в самом заказе, но нужны для ДС.
// currentUserId — чтобы отличить «мой отклик» от «чужого»; driverHeadingDeg — курс
// водителя для RouteFit (в реальных данных отсутствует, есть только в моке);
// selectedOrderId — выбранный маркер (§12 «выбрано»).
interface IMarkerRenderCtx {
  currentUserId?: string
  driverHeadingDeg?: number
  selectedOrderId?: string | null
  // mock=true -> хинт показывает осмысленную карточку по статусу (§13), без тех. id.
  mock?: boolean
  // позиция водителя (синий маркер «я») для расчёта расстояния в хинте «новый».
  driverPosition?: [number, number] | null
  // §10 уровень детализации по зуму: far (только маркеры), mid (+кольцо/направление),
  // near (+хинт/RouteFit). undefined -> реальный режим, ведём себя как раньше.
  detail?: 'far' | 'mid' | 'near'
}

// Демо-состояние взаимодействия (§12), которое мок проставляет на заказ напрямую,
// чтобы статичный демо показывал «выбрано / нажато / неактивно» без реального тапа.
function getOrderDemoInteractionState(order: IOrder): 'selected' | 'pressed' | 'inactive' | null {
  const state = String((order as any)?.ds_demo_state ?? '').toLowerCase()
  return state === 'selected' || state === 'pressed' || state === 'inactive' ? state : null
}

// CSS-класс состояния взаимодействия маркера: демо-состояние из мока имеет приоритет,
// иначе — «выбрано», если это последний тапнутый маркер.
function getInteractionClass(order: IOrder, ctx?: IMarkerRenderCtx): string {
  const demo = getOrderDemoInteractionState(order)
  if (demo) return ` order-marker--${demo}`
  if (ctx?.selectedOrderId && String(ctx.selectedOrderId) === String(order.b_id))
    return ' order-marker--selected'
  return ''
}

interface IMarkerDebugInfo {
  orderId: string
  status: TDSOrderStatus
  type: TDSOrderType
  routeFit: string
  offerAge: string
  profit: string
  eta: string
}

// Сводка фактов для диагностического оверлея (только dev). Чистая функция-поставщик.
function buildMarkerDebugInfo(order: IOrder, performing: boolean, ctx?: IMarkerRenderCtx): IMarkerDebugInfo {
  const fit = getRouteFit(order, ctx?.driverHeadingDeg)
  const agePct = getOfferAgePct(order)
  return {
    orderId: String(order.b_id),
    status: getOrderDSStatus(order, performing, ctx?.currentUserId),
    type: getOrderDSType(order),
    routeFit: fit ?? '—',
    offerAge: agePct === null ? '—' : `${Math.round(agePct)}%`,
    profit: getProfitRankClass(order) || '—',
    eta: getOrderEtaText(order) || '—',
  }
}

// Диагностический оверлей виден только вне прода или при ?debug=1. По умолчанию выключен.
function isMarkerDebugEnabled(): boolean {
  try {
    if (process.env.NODE_ENV !== 'production') return true
    return new URLSearchParams(window.location.search).get('debug') === '1'
  } catch {
    return false
  }
}

/* ===== §13 Хинты по статусу: осмысленная карточка вместо тех. id ===== */

// Расстояние водитель -> точка подачи, км (для хинта «новый»).
function getOrderDistanceKm(order: IOrder, driverPosition?: [number, number] | null): number | null {
  if (!driverPosition) return null
  const lat = Number(order.b_start_latitude)
  const lng = Number(order.b_start_longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return distanceBetweenEarthCoordinates(driverPosition[0], driverPosition[1], lat, lng)
}

function formatDistanceKm(km: number | null): string {
  if (km === null || !Number.isFinite(km) || km < 0) return ''
  if (km < 1) return `${Math.round(km * 1000)} м`
  return `${km.toFixed(1).replace('.', ',')} км`
}

// ETA — производное от расстояния (≈15 км/ч город), а не из захардкоженного поля.
function getEtaMinFromKm(km: number): number {
  return Math.max(1, Math.round(km * 4))
}

// Время окончания офера (До HH:MM) из остатка жизни заказа.
function getOrderDeadlineText(order: IOrder): string {
  const remaining = getOrderRemainingSeconds(order)
  if (remaining === null || remaining <= 0) return ''
  const date = new Date(Date.now() + remaining * 1000)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

// Читаемые на белом цвета текста хинта по статусу (жёлтый затемнён для контраста).
const HINT_STATUS_COLOR: Record<TDSOrderStatus, string> = {
  new: '#201712',
  responded: '#B07A00',
  driverAnswered: DS_COLORS.purple,
  won: DS_COLORS.green,
  expired: DS_COLORS.red,
}

function buildStatusHintHtml(order: IOrder, dsStatus: TDSOrderStatus, ctx?: IMarkerRenderCtx): string {
  let primary = ''
  let secondary = ''

  if (dsStatus === 'responded') {
    primary = 'Вы откликнулись'
    const deadline = getOrderDeadlineText(order)
    secondary = deadline ? `До ${deadline}` : 'Ждём ответа'
  } else if (dsStatus === 'driverAnswered') {
    primary = 'Ответил водитель'
    secondary = 'Ждёт других'
  } else if (dsStatus === 'won') {
    primary = 'Вы победили!'
    secondary = 'Назначен вам'
  } else if (dsStatus === 'expired') {
    primary = 'Истёк'
    secondary = '0:00'
  } else {
    const km = getOrderDistanceKm(order, ctx?.driverPosition)
    primary = km !== null
      ? `${formatDistanceKm(km)} · ${getEtaMinFromKm(km)} мин`
      : 'Новый заказ'
  }

  return `<div class='order-marker-hint order-marker-hint--destination-only order-marker-hint--ds-status'>
      <div class='order-marker-hint__primary' style='color:${HINT_STATUS_COLOR[dsStatus]}'>${escapeHtml(primary)}</div>
      ${secondary ? `<div class='order-marker-hint__secondary'>${escapeHtml(secondary)}</div>` : ''}
    </div>`
}

/* ===== §11 Фильтры на карте ===== */

type TFilterKey = 'passenger' | 'delivery' | 'marshrutka' | 'voting' | 'byRoute'
type TMapFilters = Record<TFilterKey, boolean>
// «По пути» — ограничивающий фильтр, по умолчанию выключен, чтобы по умолчанию были
// видны все полосы RouteFit (включите его, чтобы оставить только попутные).
const DEFAULT_MAP_FILTERS: TMapFilters = {
  passenger: true, delivery: true, marshrutka: true, voting: true, byRoute: false,
}

function orderPassesFilters(order: IOrder, filters: TMapFilters, driverHeadingDeg?: number): boolean {
  const type = getOrderDSType(order)
  if (type === 'passenger' && !filters.passenger) return false
  if (type === 'delivery' && !filters.delivery) return false
  if (type === 'marshrutka' && !filters.marshrutka) return false
  // «Голосование» фильтрует по режиму распределения, независимо от типа.
  if (!filters.voting && getOrderDistributionMode(order) === 'voting') return false
  if (filters.byRoute) {
    const fit = getRouteFit(order, driverHeadingDeg)
    if (fit !== 'ideal' && fit !== 'small') return false
  }
  return true
}

/* ===== §14 Легенда + §11 иконки фильтров (маленькие SVG) ===== */

function dsLegendStatusIcon(color: string, mark: 'check' | 'double' | 'cross' | null): string {
  const base = `<circle cx='10' cy='10' r='8.5' fill='${color}' stroke='${DS_COLORS.ink}' stroke-width='1'/>`
  let m = ''
  if (mark === 'check')
    m = `<path d='M6.4 10 L9 12.6 L13.8 7.2' fill='none' stroke='#fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/>`
  else if (mark === 'double')
    m = `<g fill='none' stroke='#fff' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M4.8 10 L7 12.4 L10.2 7.6'/><path d='M9 10 L11.2 12.4 L15 7.4'/></g>`
  else if (mark === 'cross')
    m = `<path d='M7 7 L13 13 M13 7 L7 13' stroke='#fff' stroke-width='1.8' stroke-linecap='round'/>`
  return `<svg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'>${base}${m}</svg>`
}

function dsLegendRouteFitIcon(color: string, kind: TRouteFit): string {
  const ring = `<circle cx='10' cy='10' r='8.5' fill='none' stroke='${color}' stroke-width='1.6'/>`
  const s = `fill='none' stroke='${color}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'`
  let g = `<path d='M6.6 6.6 L13.4 13.4 M13.4 6.6 L6.6 13.4' ${s}/>`
  if (kind === 'ideal')
    g = `<path d='M10 14.2 L10 6 M7.4 8.4 L10 6 L12.6 8.4' ${s}/>`
  else if (kind === 'small')
    g = `<path d='M6.5 13.5 L13.5 6.5 M9.6 6.5 L13.5 6.5 L13.5 10.4' ${s}/>`
  else if (kind === 'strong')
    g = `<path d='M5.6 10 L14.4 10 M11.6 7.2 L14.4 10 L11.6 12.8' ${s}/>`
  return `<svg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'>${ring}${g}</svg>`
}

function dsFilterIcon(key: TFilterKey): string {
  const wrap = (inner: string) => `<svg width='18' height='18' viewBox='0 0 18 18' xmlns='http://www.w3.org/2000/svg'>${inner}</svg>`
  if (key === 'passenger')
    return wrap(`<g fill='none' stroke='${DS_COLORS.ink}' stroke-width='1.6' stroke-linecap='round'><circle cx='9' cy='6' r='2.4'/><path d='M4.5 14 C4.5 9.5 13.5 9.5 13.5 14'/></g>`)
  if (key === 'delivery')
    return wrap(`<g><rect x='4' y='4' width='10' height='10' rx='1.4' fill='${DS_COLORS.blue}' stroke='${DS_COLORS.ink}' stroke-width='1'/><path d='M9 4 L9 14 M4 9 L14 9' stroke='#fff' stroke-width='1' stroke-opacity='.9'/></g>`)
  if (key === 'marshrutka')
    return wrap(`<path d='M9 3 L14 5.8 L14 11.2 L9 14 L4 11.2 L4 5.8 Z' fill='none' stroke='${DS_COLORS.ink}' stroke-width='1.6'/>`)
  if (key === 'voting')
    return wrap(`<g fill='none' stroke='${DS_COLORS.purple}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><circle cx='8' cy='6' r='2.2'/><path d='M3.8 14 C3.8 10.2 10.6 10.2 11.4 12.2'/><path d='M10.8 11.6 L12.4 13.2 L15.2 9.9'/></g>`)
  return wrap(`<path d='M9 14 L9 4.5 M5.8 7.7 L9 4.5 L12.2 7.7' fill='none' stroke='${DS_COLORS.green}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/>`)
}

const DS_LEGEND_STATUSES = [
  { icon: dsLegendStatusIcon(DS_COLORS.beige, null), label: 'Новый заказ' },
  { icon: dsLegendStatusIcon(DS_COLORS.yellow, 'check'), label: 'Я откликнулся' },
  { icon: dsLegendStatusIcon(DS_COLORS.purple, 'check'), label: 'Ответил водитель' },
  { icon: dsLegendStatusIcon(DS_COLORS.green, 'double'), label: 'Я победил' },
  { icon: dsLegendStatusIcon(DS_COLORS.grey, 'cross'), label: 'Истёк' },
]

const DS_LEGEND_ROUTEFIT = [
  { icon: dsLegendRouteFitIcon(DS_COLORS.green, 'ideal'), label: 'Идеально по пути' },
  { icon: dsLegendRouteFitIcon(DS_COLORS.yellow, 'small'), label: 'Небольшой крюк' },
  { icon: dsLegendRouteFitIcon(DS_COLORS.orange, 'strong'), label: 'Сильный крюк' },
  { icon: dsLegendRouteFitIcon(DS_COLORS.red, 'against'), label: 'Не по пути' },
]

// «Маршрутки» как фильтр-чип убран — в этом проекте маршруток нет (фильтр marshrutka
// остаётся включённым по умолчанию, так что заказы-маршрутки, если попадут, не прячутся).
const DS_FILTER_DEFS: Array<{ key: TFilterKey, label: string, icon: string }> = [
  { key: 'passenger', label: 'Пассажиры', icon: dsFilterIcon('passenger') },
  { key: 'delivery', label: 'Доставка', icon: dsFilterIcon('delivery') },
  { key: 'voting', label: 'Голосование', icon: dsFilterIcon('voting') },
  { key: 'byRoute', label: 'По пути', icon: dsFilterIcon('byRoute') },
]

// Подпись живого таймера под маркером (§5/§6): vote/offer — убывающий M:SS, direct —
// нарастающий +M:SS («сколько уже ждёт»). Пустая строка, если режим жизни не задан
// (реальные заказы) или на дальнем зуме. Обновляется на каждый тик (см. MockClusterLayer).
function dsLifeTimerChip(order: IOrder, detail?: 'far' | 'mid' | 'near'): string {
  if (detail === 'far') return ''
  const mode = getOrderLifeMode(order)
  if (!mode) return ''

  if (mode === 'direct') {
    const elapsedMs = getOrderLifeElapsedMs(order)
    if (elapsedMs === null) return ''
    return `<div class='order-marker__timer order-marker__timer--up'>+${formatLifeClock(elapsedMs)}</div>`
  }

  const remainingMs = getOrderLifeRemainingMs(order)
  if (remainingMs === null) return ''
  const urgentClass = remainingMs <= 30000 ? ' order-marker__timer--urgent' : ''
  return `<div class='order-marker__timer order-marker__timer--down${urgentClass}'>${formatLifeClock(remainingMs)}</div>`
}

function getOrderMarkerHtml(order: IOrder, performing: boolean, resolvedDestinationAddress?: string, ctx?: IMarkerRenderCtx) {
  const rankClass = getProfitRankClass(order)
  const profit = getEstimatedProfit(order)
  const profitText = profit !== undefined ? formatCurrency(profit, {
    signDisplay: 'always',
    currencyDisplay: 'none',
  }) : '+?'
  const toText = shortenAddress(getOrderDestinationAddress(order, resolvedDestinationAddress) || t(TRANSLATION.ADDRESS_NOT_SPECIFIED), 40)
  const startTime = getSafeOrderTime(order)
  const competitorsCount = Number(order.drivers?.length || 0)
  const priceValue = order.b_price_estimate || 0
  const tipsValue = order.b_tips || 0
  const passengersCount = order.b_passengers_count || 0

  const dsType = getOrderDSType(order)
  const dsStatus = getOrderDSStatus(order, performing, ctx?.currentUserId)
  const meta = DS_STATUS_META[dsStatus]

  const offerAgePct = getOfferAgePct(order)
  // §10 уровень детализации (только мок): far — голый маркер; mid — +кольцо/направление;
  // near — +хинт/RouteFit. undefined (реальный режим) ведёт себя как раньше.
  const detail = ctx?.detail
  // Кольцо офера — индикатор обратного отсчёта, имеет смысл только для активных
  // оферов. У победителя (назначен) и истёкшего его не показываем; на дальнем зуме — тоже.
  const showRing = offerAgePct !== null && dsStatus !== 'expired' && dsStatus !== 'won' && detail !== 'far'
  // RouteFit — только на близком зуме (или в реальном режиме); на истёкшем не рисуем.
  const showRouteFit = detail === undefined || detail === 'near'
  const routeFit = (dsStatus === 'expired' || !showRouteFit) ? null : getRouteFit(order, ctx?.driverHeadingDeg)
  const expiringClass = showRing && 100 - (offerAgePct as number) < 12 ? ' order-marker--expiring' : ''
  const interactionClass = getInteractionClass(order, ctx)

  const negativeClass = profit !== undefined && profit < 0 ? ' order-marker--profit-negative' : ''

  const pin = `<svg class='order-marker__pin' width='48' height='52' viewBox='0 0 48 52' xmlns='http://www.w3.org/2000/svg'>
      <path d='M20.9 30.6 A 12 12 0 1 1 27.1 30.6 Q 25.6 40.5 24 49 Q 22.4 40.5 20.9 30.6 Z' fill='${meta.color}' stroke='${DS_COLORS.ink}' stroke-width='1' stroke-linejoin='round' stroke-linecap='round'/>
      ${showRing ? dsOfferRing(offerAgePct as number) : ''}
      ${dsTypeGlyph(dsType)}
      ${dsStatusBadge(meta.mark, meta.color)}
      ${dsRouteFitBadge(routeFit)}
    </svg>`

  // §13: в мок-режиме хинт — осмысленная карточка по статусу (без тех. id), и только на
  // близком зуме (§10). На far/mid хинт скрыт. В реальном режиме — прежний хинт «Куда: …».
  const showHint = detail === undefined || detail === 'near'
  const hintHtml = ctx?.mock
    ? (showHint ? buildStatusHintHtml(order, dsStatus, ctx) : '')
    : `<div class='order-marker-hint order-marker-hint--destination-only'>
      <div class='order-marker-hint__destination'>
        <b>${escapeHtml(t(TRANSLATION.TO))}:</b>
        <span>${escapeHtml(toText)}</span>
      </div>
      <div class='order-marker-hint__meta'>
        ${startTime ? `<span class='order-marker-hint__time'>${escapeHtml(startTime)}</span>` : ''}
        <span class='competitors-num'>${escapeHtml(competitorsCount)}</span>
        <span class='price'>${escapeHtml(priceValue)}</span>
        <span class='tips'>${escapeHtml(tipsValue)}</span>
        <span class='order-profit'>${escapeHtml(passengersCount)}</span>
        <span class='order-profit-estimation'>${escapeHtml(profitText)}</span>
      </div>
    </div>`

  // Живой таймер показываем только пока заказ жив (не у победителя/истёкшего).
  const timerHtml = (dsStatus === 'won' || dsStatus === 'expired')
    ? ''
    : dsLifeTimerChip(order, detail)

  return `<div class='order-marker order-marker--ds order-marker--status-${dsStatus} order-marker--type-${dsType}${rankClass ? ` order-marker--profit--${rankClass}` : ''}${negativeClass}${expiringClass}${interactionClass}'>
    ${hintHtml}
    ${pin}
    ${timerHtml}
  </div>`
}

/* ===== §9 Кластеры заказов (leaflet.markercluster) ===== */

// Иконка кластера: на дальнем зуме — простой кружок с числом; на среднем —
// число + разбивка по статусам (голосуют/ответили/победили/истекли) как в ДС.
function buildClusterIcon(cluster: any, map: L.Map, farMaxZoom: number): L.DivIcon {
  const count = cluster.getChildCount()
  let zoom = farMaxZoom
  try {
    zoom = map.getZoom()
  } catch (_) {}

  if (zoom <= farMaxZoom)
    return new L.DivIcon({
      html: `<div class='ds-cluster ds-cluster--simple'>${count}</div>`,
      className: '',
      iconSize: [46, 46],
      iconAnchor: [23, 23],
    })

  const counts = { voting: 0, answered: 0, won: 0, expired: 0 }
  cluster.getAllChildMarkers().forEach((marker: any) => {
    const status = marker.__dsStatus as TDSOrderStatus | undefined
    if (status === 'won') counts.won += 1
    else if (status === 'expired') counts.expired += 1
    else if (status === 'responded' || status === 'driverAnswered') counts.answered += 1
    else counts.voting += 1
  })

  const row = (color: string, value: number, label: string) =>
    `<div class='ds-cluster__row'><span class='ds-cluster__dot' style='background:${color}'></span><b>${value || '—'}</b> ${label}</div>`

  const legend = [
    row(DS_COLORS.purple, counts.voting, 'голосуют'),
    row(DS_COLORS.yellow, counts.answered, 'ответили'),
    row(DS_COLORS.green, counts.won, 'победили'),
    row(DS_COLORS.grey, counts.expired, 'истекли'),
  ].join('')

  return new L.DivIcon({
    html: `<div class='ds-cluster ds-cluster--info'><div class='ds-cluster__count'>${count}</div><div class='ds-cluster__legend'>${legend}</div></div>`,
    className: '',
    iconSize: [112, 84],
    iconAnchor: [56, 42],
  })
}

interface IMockClusterLayerProps {
  orders: IOrder[]
  ctx: IMarkerRenderCtx
  // Стабильный ключ содержимого: кластер пересобирается только когда меняется то, что
  // реально влияет на вид (детализация/выбор/набор заказов/позиция на близком зуме), а
  // не на каждый рендер или тик GPS.
  refreshKey: string
  // Тик живых таймеров: меняется раз в секунду; перерисовывает иконки маркеров на месте
  // (кольцо/счётчик), НЕ пересобирая кластер.
  tick: number
  performingOrderId?: string
  farMaxZoom: number
  nearMinZoom: number
  onMarkerClick: (order: IOrder, performing: boolean) => void
}

// Слой кластеризованных мок-маркеров. markercluster сам сворачивает/разворачивает
// маркеры по зуму; при nearMinZoom и ближе кластеризация выключается (отдельные маркеры).
function MockClusterLayer({ orders, ctx, refreshKey, tick, performingOrderId, farMaxZoom, nearMinZoom, onMarkerClick }: IMockClusterLayerProps) {
  const map = useMap()
  // ctx и onMarkerClick читаем через ref — они меняют идентичность часто (позиция/выбор),
  // но напрямую в зависимости эффекта не идут, чтобы кластер не пересобирался зря.
  const ctxRef = useRef(ctx)
  ctxRef.current = ctx
  const clickRef = useRef(onMarkerClick)
  clickRef.current = onMarkerClick
  // Живые маркеры текущей сборки: по ним тик-эффект обновляет иконки (таймеры) на месте.
  const entriesRef = useRef<Array<{ marker: L.Marker, order: IOrder, performing: boolean }>>([])

  useEffect(() => {
    if (!isLeafletMapConnected(map))
      return undefined

    const factory = (L as any).markerClusterGroup
    if (typeof factory !== 'function') {
      // Плагин подключается сайд-эффектом import 'leaflet.markercluster' после import L.
      console.error('leaflet.markercluster is not initialized')
      return undefined
    }

    const renderCtx = ctxRef.current
    const group = factory({
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: nearMinZoom,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster: any) => buildClusterIcon(cluster, map, farMaxZoom),
    })

    const entries: Array<{ marker: L.Marker, order: IOrder, performing: boolean }> = []
    orders.forEach(order => {
      const lat = Number(order.b_start_latitude)
      const lng = Number(order.b_start_longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng))
        return

      const performing = !!performingOrderId && String(order.b_id) === String(performingOrderId)
      const marker = L.marker([lat, lng], {
        icon: new L.DivIcon({
          html: getOrderMarkerHtml(order, performing, undefined, renderCtx),
          className: '',
          iconAnchor: [24, 49],
          popupAnchor: [0, -44],
          iconSize: [48, 52],
        }),
      })
      ;(marker as any).__dsStatus = getOrderDSStatus(order, performing, renderCtx.currentUserId)
      marker.on('click', () => clickRef.current(order, performing))
      group.addLayer(marker)
      entries.push({ marker, order, performing })
    })
    entriesRef.current = entries

    safeLeafletAction(() => map.addLayer(group))

    return () => {
      entriesRef.current = []
      safeLeafletAction(() => map.removeLayer(group))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, orders, refreshKey, performingOrderId, farMaxZoom, nearMinZoom])

  // Тик живых таймеров: на месте обновляем иконку каждого маркера (кольцо §6 убывает,
  // direct-счётчик растёт). Кластер при этом не пересобирается — никакого мерцания.
  useEffect(() => {
    const renderCtx = ctxRef.current
    entriesRef.current.forEach(({ marker, order, performing }) => {
      safeLeafletAction(() => marker.setIcon(new L.DivIcon({
        html: getOrderMarkerHtml(order, performing, undefined, renderCtx),
        className: '',
        iconAnchor: [24, 49],
        popupAnchor: [0, -44],
        iconSize: [48, 52],
      })))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])

  return null
}

function getHiddenOrderIds(userID?: IUser['u_id']): string[] {
  if (!userID)
    return []

  try {
    const hiddenOrders = JSON.parse(localStorage.getItem('hiddenOrders') || '{}')
    return Array.isArray(hiddenOrders?.[userID]) ? hiddenOrders[userID].map(String) : []
  } catch {
    return []
  }
}

export default connector(DriverOrderMapMode)

async function makeRoutePointsSafe(
  from: IAddressPoint,
  to: IAddressPoint,
  wayGraph?: IWayGraph,
): Promise<IRouteInfo> {
  try {
    const apiRoute = await API.makeRoutePoints(from, to)
    if (isUsableRouteInfo(apiRoute))
      return apiRoute
  } catch (error) {
    }

  const localRoute = makeLocalRoutePoints(from, to, wayGraph)
  if (isUsableRouteInfo(localRoute))
    return localRoute

  try {
    const osrmRoute = await makeOsrmRoutePoints(from, to)
    if (isUsableRouteInfo(osrmRoute))
      return osrmRoute
  } catch (error) {
    console.error(error)
  }

  throw new Error('Route by roads is not available')
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
