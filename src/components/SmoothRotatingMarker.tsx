import React from 'react'
import L from 'leaflet'
import { Marker } from 'react-leaflet'

type LatLngTuple = [number, number]

interface IProps {
  position: LatLngTuple
  iconUrl: string
  className?: string
  iconSize?: LatLngTuple
  iconAnchor?: LatLngTuple
  popupAnchor?: LatLngTuple
  speedKmh?: number
  accentColor?: string
  zIndexOffset?: number
  /**
   * Optional road route. When it is passed, the marker is projected to the
   * polyline and can only move forward by route progress. This prevents the
   * visual marker from driving back to old GPS/backend points on phones.
   */
  path?: LatLngTuple[]
  children?: React.ReactNode
}

const EARTH_RADIUS_METERS = 6371000
const DEFAULT_SPEED_KMH = 42
const MIN_ANIMATION_MS = 220
const MAX_ANIMATION_MS = 18000
const MAX_BAD_POSITION_JUMP_METERS = 420
const MAX_ROUTE_SNAP_METERS = 180
const ROUTE_BACKWARD_TOLERANCE_METERS = 6
const ROUTE_FORWARD_EPSILON_METERS = .8

function toRad(value: number) { return value * Math.PI / 180 }
function toDeg(value: number) { return value * 180 / Math.PI }

function distanceMeters(from: LatLngTuple, to: LatLngTuple) {
  const lat1 = toRad(from[0])
  const lat2 = toRad(to[0])
  const deltaLat = toRad(to[0] - from[0])
  const deltaLon = toRad(to[1] - from[1])
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearingDegrees(from: LatLngTuple, to: LatLngTuple) {
  const lat1 = toRad(from[0])
  const lat2 = toRad(to[0])
  const deltaLon = toRad(to[1] - from[1])
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return normalizeAngle(toDeg(Math.atan2(y, x)))
}

function normalizeAngle(value: number) {
  return ((value % 360) + 360) % 360
}

function shortestAngleDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180
}

function interpolate(from: LatLngTuple, to: LatLngTuple, progress: number): LatLngTuple {
  const t = Math.max(0, Math.min(1, progress))
  return [
    from[0] + (to[0] - from[0]) * t,
    from[1] + (to[1] - from[1]) * t,
  ]
}

function escapeAttribute(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function isFinitePoint(point: LatLngTuple | undefined | null): point is LatLngTuple {
  return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
}

function isSamePoint(a: LatLngTuple, b: LatLngTuple) {
  return Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001
}

function normalizePath(path?: LatLngTuple[]) {
  if (!Array.isArray(path)) return []
  return path.filter(isFinitePoint)
}

function getCumulativeDistances(points: LatLngTuple[]) {
  const cumulative = [0]
  for (let i = 1; i < points.length; i += 1)
    cumulative[i] = cumulative[i - 1] + Math.max(0, distanceMeters(points[i - 1], points[i]))
  return cumulative
}

function getPathLength(points: LatLngTuple[]) {
  const cumulative = getCumulativeDistances(points)
  return cumulative[cumulative.length - 1] || 0
}

function getMetersVector(origin: LatLngTuple, point: LatLngTuple) {
  const latScale = 111320
  const lonScale = 111320 * Math.cos(toRad(origin[0]))
  return {
    x: (point[1] - origin[1]) * lonScale,
    y: (point[0] - origin[0]) * latScale,
  }
}

function projectPointToPath(points: LatLngTuple[], target: LatLngTuple, minMeters = 0) {
  if (points.length < 2) {
    return {
      point: points[0] || target,
      distanceFromTarget: points[0] ? distanceMeters(points[0], target) : 0,
      routeMeters: 0,
      bearing: 0,
    }
  }

  const cumulative = getCumulativeDistances(points)
  let bestPoint = points[0]
  let bestDistance = Number.POSITIVE_INFINITY
  let bestRouteMeters = 0
  let bestBearing = bearingDegrees(points[0], points[1])

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const segmentMeters = cumulative[index] - cumulative[index - 1]
    if (!Number.isFinite(segmentMeters) || segmentMeters < .05)
      continue

    // Once a route is already partially passed, do not look far behind it.
    if (cumulative[index] < minMeters - ROUTE_BACKWARD_TOLERANCE_METERS)
      continue

    const segment = getMetersVector(from, to)
    const targetVector = getMetersVector(from, target)
    const lengthSquared = segment.x * segment.x + segment.y * segment.y
    const t = lengthSquared > 0 ?
      Math.max(0, Math.min(1, (targetVector.x * segment.x + targetVector.y * segment.y) / lengthSquared)) :
      0
    const projected = interpolate(from, to, t)
    const routeMeters = cumulative[index - 1] + segmentMeters * t
    const distanceFromTarget = distanceMeters(projected, target)

    if (distanceFromTarget < bestDistance) {
      bestDistance = distanceFromTarget
      bestPoint = projected
      bestRouteMeters = routeMeters
      bestBearing = bearingDegrees(from, to)
    }
  }

  return {
    point: bestPoint,
    distanceFromTarget: bestDistance,
    routeMeters: bestRouteMeters,
    bearing: bestBearing,
  }
}

function pointAtRouteMeters(points: LatLngTuple[], routeMeters: number) {
  if (points.length < 2)
    return { point: points[0], bearing: 0 }

  const safeMeters = Math.max(0, Math.min(routeMeters, getPathLength(points)))
  let passed = 0

  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]
    const to = points[i]
    const segmentMeters = distanceMeters(from, to)
    if (!Number.isFinite(segmentMeters) || segmentMeters < .05) continue

    if (passed + segmentMeters >= safeMeters) {
      const point = interpolate(from, to, (safeMeters - passed) / segmentMeters)
      return { point, bearing: bearingDegrees(from, to) }
    }

    passed += segmentMeters
  }

  const last = points[points.length - 1]
  const previous = points[points.length - 2]
  return { point: last, bearing: bearingDegrees(previous, last) }
}

function getDurationMsByMeters(meters: number, speedKmh = DEFAULT_SPEED_KMH) {
  if (!Number.isFinite(meters) || meters < 2) return MIN_ANIMATION_MS
  const speedMps = Math.max(5, speedKmh * 1000 / 3600)
  return Math.max(MIN_ANIMATION_MS, Math.min(MAX_ANIMATION_MS, meters / speedMps * 1000))
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ?
    performance.now() :
    Date.now()
}

function getPathKey(path?: LatLngTuple[]) {
  const safePath = normalizePath(path)
  if (safePath.length < 2) return ''
  const last = safePath[safePath.length - 1]
  const first = safePath[0]

  // Do not include every first-point change with high precision. The backend can
  // return a new route from the current car coordinate every poll; resetting the
  // route on those updates caused marker disappearance and backward turns.
  return [
    first[0].toFixed(3),
    first[1].toFixed(3),
    last[0].toFixed(5),
    last[1].toFixed(5),
  ].join(':')
}

export default function SmoothRotatingMarker({
  position,
  iconUrl,
  className = 'smooth-rotating-marker',
  iconSize = [40, 40],
  iconAnchor = [20, 20],
  popupAnchor = [0, -22],
  speedKmh = DEFAULT_SPEED_KMH,
  accentColor,
  zIndexOffset,
  path,
  children,
}: IProps) {
  const safeInitialPosition: LatLngTuple = isFinitePoint(position) ? position : [0, 0]
  const [displayPosition, setDisplayPosition] = React.useState<LatLngTuple>(safeInitialPosition)
  const [angle, setAngle] = React.useState(0)
  const animationRef = React.useRef<number | null>(null)
  const displayPositionRef = React.useRef<LatLngTuple>(safeInitialPosition)
  const angleRef = React.useRef(0)
  const routePathRef = React.useRef<LatLngTuple[]>(normalizePath(path))
  const routeMetersRef = React.useRef(0)
  const lastPathKeyRef = React.useRef(getPathKey(path))
  const lastAcceptedRawPositionRef = React.useRef<LatLngTuple>(safeInitialPosition)
  const lastPositionUpdateAtRef = React.useRef<number | null>(null)
  const pathKey = getPathKey(path)
  const markerRef = React.useRef<L.Marker | null>(null)

  React.useEffect(() => {
    if (!isFinitePoint(position)) return

    const from = displayPositionRef.current || position
    const nextPath = normalizePath(path)

    if (pathKey && (lastPathKeyRef.current !== pathKey || routePathRef.current.length < 2)) {
      const projectedFrom = projectPointToPath(nextPath, from)

      // Keep the old stable behavior: do not snap the marker to a newly supplied
      // route when the current marker is far from that route. That stale-route
      // snap was the source of pickup-point teleports on mobile browsers.
      if (projectedFrom.distanceFromTarget <= MAX_ROUTE_SNAP_METERS) {
        routePathRef.current = nextPath
        lastPathKeyRef.current = pathKey
        routeMetersRef.current = projectedFrom.routeMeters
        displayPositionRef.current = projectedFrom.point
        setDisplayPosition(projectedFrom.point)
      } else {
        routePathRef.current = []
        lastPathKeyRef.current = ''
        routeMetersRef.current = 0
      }
    } else if (!pathKey) {
      routePathRef.current = []
      lastPathKeyRef.current = ''
      routeMetersRef.current = 0
    }

    const routePath = routePathRef.current
    let targetPoint = position
    let startRouteMeters = 0
    let targetRouteMeters = 0
    let targetBearing = angleRef.current
    let useRouteAnimation = false

    if (routePath.length > 1) {
      const currentProjection = projectPointToPath(routePath, from, Math.max(0, routeMetersRef.current - ROUTE_BACKWARD_TOLERANCE_METERS))
      const targetProjection = projectPointToPath(routePath, position, Math.max(0, routeMetersRef.current - ROUTE_BACKWARD_TOLERANCE_METERS))
      const currentRouteMeters = Math.max(routeMetersRef.current, currentProjection.routeMeters)

      // If a phone/backend sends a coordinate from behind the already passed route,
      // ignore it. The marker must never visually drive backwards to catch old data.
      if (targetProjection.routeMeters + ROUTE_BACKWARD_TOLERANCE_METERS < currentRouteMeters)
        return

      // Ignore one-off coordinates far away from the cached road route. This is the
      // usual reason for teleports and marker disappearance on mobile GPS.
      if (targetProjection.distanceFromTarget > MAX_ROUTE_SNAP_METERS)
        return

      targetPoint = targetProjection.point
      startRouteMeters = currentRouteMeters
      targetRouteMeters = Math.max(currentRouteMeters, targetProjection.routeMeters)
      targetBearing = targetProjection.bearing
      useRouteAnimation = true

      if (targetRouteMeters <= startRouteMeters + ROUTE_FORWARD_EPSILON_METERS) {
        const nextAngle = normalizeAngle(angleRef.current + shortestAngleDelta(angleRef.current, targetBearing) * .18)
        angleRef.current = nextAngle
        setAngle(nextAngle)
        return
      }
    } else {
      const directDistance = distanceMeters(from, position)
      const lastRawDistance = distanceMeters(lastAcceptedRawPositionRef.current, position)

      if (directDistance > MAX_BAD_POSITION_JUMP_METERS && lastRawDistance > MAX_BAD_POSITION_JUMP_METERS)
        return

      lastAcceptedRawPositionRef.current = position
      targetBearing = bearingDegrees(from, position)
      targetPoint = position
    }

    if (isSamePoint(from, targetPoint))
      return

    const startedAt = nowMs()
    const directMeters = useRouteAnimation ?
      Math.max(0, targetRouteMeters - startRouteMeters) :
      distanceMeters(from, targetPoint)
    const speedDuration = getDurationMsByMeters(directMeters, speedKmh)
    const previousUpdateAt = lastPositionUpdateAtRef.current
    lastPositionUpdateAtRef.current = startedAt

    // Backend/emulator coordinates can arrive by cadence, not by the visual speed.
    // Animate to the next accepted coordinate during the observed update gap so the
    // car keeps moving instead of crawling, stopping, then jumping on the next poll.
    const observedGapDuration = previousUpdateAt ?
      Math.max(MIN_ANIMATION_MS, Math.min(MAX_ANIMATION_MS, (startedAt - previousUpdateAt) * 1.15)) :
      speedDuration
    const duration = Math.max(MIN_ANIMATION_MS, Math.min(MAX_ANIMATION_MS, Math.min(speedDuration, observedGapDuration)))

    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const next = useRouteAnimation ?
        pointAtRouteMeters(routePath, startRouteMeters + (targetRouteMeters - startRouteMeters) * progress) :
        { point: interpolate(from, targetPoint, progress), bearing: targetBearing }
      const angleStep = Math.min(.28, Math.max(.14, progress < .98 ? .18 : .28))
      const nextAngle = normalizeAngle(angleRef.current + shortestAngleDelta(angleRef.current, next.bearing) * angleStep)

      displayPositionRef.current = next.point
      angleRef.current = nextAngle
      setDisplayPosition(next.point)
      setAngle(nextAngle)

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        const finalPoint = useRouteAnimation ? pointAtRouteMeters(routePath, targetRouteMeters).point : targetPoint
        displayPositionRef.current = finalPoint
        angleRef.current = normalizeAngle(angleRef.current + shortestAngleDelta(angleRef.current, targetBearing) * .35)
        setDisplayPosition(finalPoint)
        setAngle(angleRef.current)
        if (useRouteAnimation)
          routeMetersRef.current = Math.max(routeMetersRef.current, targetRouteMeters)
        animationRef.current = null
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [position[0], position[1], speedKmh, pathKey])

  const icon = React.useMemo(() => new L.DivIcon({
    className,
    iconAnchor,
    popupAnchor,
    iconSize,
    html: `<span class="smooth-rotating-marker__wrap">${accentColor ? `<span class="smooth-rotating-marker__accent-dot" style="background:${escapeAttribute(accentColor)};"></span>` : ''}<span class="smooth-rotating-marker__fallback-arrow" style="transform: rotate(0deg);"></span><img class="smooth-rotating-marker__image" src="${escapeAttribute(iconUrl)}" style="transform: rotate(0deg);" /></span>`,
  }), [
    accentColor,
    className,
    iconAnchor[0],
    iconAnchor[1],
    iconSize[0],
    iconSize[1],
    iconUrl,
    popupAnchor[0],
    popupAnchor[1],
  ])

  React.useEffect(() => {
    const element = markerRef.current?.getElement?.()
    if (!element) return

    const rotation = `rotate(${angle}deg)`
    const image = element.querySelector<HTMLElement>('.smooth-rotating-marker__image')
    const fallback = element.querySelector<HTMLElement>('.smooth-rotating-marker__fallback-arrow')

    if (image)
      image.style.transform = rotation
    if (fallback)
      fallback.style.transform = rotation
  }, [angle])

  if (!isFinitePoint(displayPosition) || !iconUrl)
    return null

  return (
    <Marker ref={markerRef} position={displayPosition} icon={icon} zIndexOffset={zIndexOffset}>
      {children}
    </Marker>
  )
}
