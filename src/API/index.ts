import axios from 'axios'
import { Stringify, ValueOf } from '../types'
import {
  EOrderTypes,
  ESuggestionType,
  IAddressPoint,
  IBookingCoordinatesLatitude,
  IBookingCoordinatesLongitude,
  IOrder,
  IPlaceResponse,
  IRouteInfo,
  ISuggestion,
  ITrip,
} from '../types/types'
import { getBase64, getHints } from '../tools/utils'
import { getPersonalAddressSuggestions } from '../tools/addressBook'
import { convertTrip, reverseConvertTrip } from '../tools/convert'
import {
  addToFormData, apiMethod, IApiMethodArguments, IResponseFields,
} from '../tools/api'
import SITE_CONSTANTS from '../siteConstants'
import Config from '../config'
import store from '../state'
import { configSelectors } from '../state/config'
import { userSelectors } from '../state/user'
import { EBookingActions } from './constants'
import { getCacheVersion } from './cacheVersion'

export { getCacheVersion, EBookingActions }
export {
  register,
  remindPassword,
  login,
  whatsappSignUp,
  googleLogin,
  logout,
} from './auth'
export {
  getUser,
  getUsers,
  getAuthorizedUser,
  editUser,
  editUserAfterRegister,
} from './user'
export {
  createCar,
  createUserCar,
  editCar,
  getUserCars,
  getUserCar,
  driveCar,
  getUserDrivenCar,
  getCar,
  getCars,
} from './car'
export {
  postDrive,
  cancelDrive,
  getOrders,
  getOrder,
  editOrder,
  updateOrderCustomerPrice,
  takeOrder,
  participateVotingOrder,
  cancelVotingParticipation,
  sendOrderOffer,
  arrivedVotingOrder,
  confirmVotingCode,
  chooseCandidate,
  releaseCandidateChoice,
  setOrderState,
  setOrderRating,
  setWaitingTime,
} from './order'
export {
  getAreasIdsBetweenPoints,
  getArea,
} from './way'
export {
  getPolygonsIdsOnPoint,
} from './polygon'

const _uploadFile = (
  { formData }: IApiMethodArguments,
  data: any,
): Promise<{
  dl_id: string
} | null> => {
  return getBase64(data.file)
    .then(base64 => {
      addToFormData(formData, {
        token: data.token,
        u_hash: data.u_hash,
        file: JSON.stringify({ base64, u_id: data.u_id }),
        private: 0,
      })
      return formData
    })
    .then(form => axios.post(`${Config.API_URL}/dropbox/file`, form))
    .then(res => ({ ...res, dl_id: res?.data?.data?.dl_id }))
}

export const uploadFile = apiMethod<typeof _uploadFile>(_uploadFile, { authRequired: false })

const _checkRefCode = (
  { formData }: IApiMethodArguments,
  ref_code: string,
): Promise<boolean> => {
  return axios.get(`${Config.API_URL}/referral/code/${ref_code}/check`)
    .then(res => {
      return res.data?.data?.ref_code_free || false
    })
}

export const checkRefCode = apiMethod<typeof _checkRefCode>(_checkRefCode, { authRequired: false })

const _checkConfig = (
  { formData }: IApiMethodArguments,
  config: string,
): Promise<any> => {
  return axios.get(`${Config.API_URL}`, { params: { config } })
}
export const checkConfig = apiMethod<typeof _checkConfig>(_checkConfig, { authRequired: false })

const _postTrip = (
  { formData }: IApiMethodArguments,
  data: ITrip,
): Promise<IResponseFields & {
    t_id: ITrip['t_id'],
}> => {
  addToFormData(formData, {
    data: JSON.stringify(reverseConvertTrip(data)),
  })

  return axios.post(`${Config.API_URL}/trip`, formData)
    .then(res => res.data)
}
export const postTrip = apiMethod<typeof _postTrip>(_postTrip)

const _getTrips = (
  { formData }: IApiMethodArguments,
  type: EOrderTypes = EOrderTypes.Active,
): Promise<IOrder[]> => {
  addToFormData(formData, {
    array_type: 'list',
  })

  return axios.post(`${Config.API_URL}/trip`, formData)
    .then(res => res.data)
    .then(res =>
      res.data.trip || [],
    )
    .then(res => res.map((item: any) => convertTrip(item)))
    .then(res =>
      res.sort(
        (a: IOrder, b: IOrder) => a.b_start_datetime < b.b_start_datetime ? 1 : -1,
      ),
    )
}
export const getTrips = apiMethod<typeof _getTrips>(_getTrips)

const _getWashTrips = (
  { formData }: IApiMethodArguments,
  type: EOrderTypes = EOrderTypes.Active,
): Promise<IOrder[]> => {
  addToFormData(formData, {
    array_type: 'list',
  })

  return axios.post(`${Config.API_URL}/trip/get`, formData)
    .then(res => res.data)
    .then(res =>
      res.data.trip || [],
    )
    .then(res => res.map((item: any) => convertTrip(item)))
    .then(res =>
      res.sort(
        (a: IOrder, b: IOrder) => a.b_start_datetime < b.b_start_datetime ? 1 : -1,
      ),
    )
}
export const getWashTrips = apiMethod<typeof _getWashTrips>(_getWashTrips, { authRequired: false })

const _getImageBlob = (
  { formData }: IApiMethodArguments,
  id: number,
) => {
  return axios.post(`${Config.API_URL}/dropbox/file/${id}`, formData, {
    responseType: 'blob',
  }).then(res => {
    return [id, URL.createObjectURL(res.data)]
  })
}
export const getImageBlob = apiMethod<typeof _getImageBlob>(_getImageBlob)

const _getImageFile = (
  { formData }: IApiMethodArguments,
  id: number,
): Promise<[number, File]> => {
  return axios.post(`${Config.API_URL}/dropbox/file/${id}`, formData, {
    responseType: 'blob',
  }).then(res => {
    return [id, new File([res.data], String(id))]
  })
}
export const getImageFile = apiMethod<typeof _getImageFile>(_getImageFile)

const _setOutDrive = (
  { formData }: IApiMethodArguments,
  isFinished: boolean,
  addresses?: {
    fromAddress?: string,
    fromLatitude?: string,
    fromLongitude?: string,
    toAddress?: string,
    toLatitude?: string,
    toLongitude?: string,
  },
  passengers?: IOrder['b_passengers_count'],
): Promise<IResponseFields> => {
  addToFormData(formData, {
    'data': JSON.stringify(
      isFinished ?
        {
          out_drive: '0',
        } :
        {
          out_drive: '1',
          out_s_address: addresses?.fromAddress,
          out_s_latitude: addresses?.fromLatitude?.toString(),
          out_s_longitude: addresses?.fromLongitude?.toString(),
          out_address: addresses?.toAddress,
          out_latitude: addresses?.toLatitude?.toString(),
          out_longitude: addresses?.toLongitude?.toString(),
          out_passengers: passengers,
        },
    ),
  })

  return axios.post(`${Config.API_URL}/user`, formData)
    .then(res => res.data)
}
export const setOutDrive = apiMethod<typeof _setOutDrive>(_setOutDrive)

const getConfigValue = (key: string): string => {
  const siteConstantsValue = (SITE_CONSTANTS as any)?.[key]
  if (typeof siteConstantsValue === 'string')
    return siteConstantsValue

  const configValue = (Config as any)?.[key]
  if (typeof configValue === 'string')
    return configValue

  const envValue = (process.env as any)?.[`REACT_APP_${key}`]
  return typeof envValue === 'string' ? envValue : ''
}

const hereAutosuggestApiKey = getConfigValue('HERE_API_KEY')
let hereAutosuggestDisabled = !hereAutosuggestApiKey

type TAddressSearchCenter = Pick<IAddressPoint, 'latitude' | 'longitude'> | [number, number] | null | undefined

const getFiniteCoordinate = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const getSearchCenterCoordinates = (searchCenter?: TAddressSearchCenter): [number, number] | null => {
  if (Array.isArray(searchCenter)) {
    const lat = getFiniteCoordinate(searchCenter[0])
    const lng = getFiniteCoordinate(searchCenter[1])
    return lat !== null && lng !== null ? [lat, lng] : null
  }

  const lat = getFiniteCoordinate(searchCenter?.latitude)
  const lng = getFiniteCoordinate(searchCenter?.longitude)
  return lat !== null && lng !== null ? [lat, lng] : null
}

const getDistanceMetersBetweenPoints = (from: [number, number], to: [number, number]) => {
  const toRad = (value: number) => value * Math.PI / 180
  const earthRadiusMeters = 6371000
  const dLat = toRad(to[0] - from[0])
  const dLng = toRad(to[1] - from[1])
  const lat1 = toRad(from[0])
  const lat2 = toRad(to[0])
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const withSuggestionDistance = (suggestion: ISuggestion, searchCenter?: TAddressSearchCenter): ISuggestion => {
  const center = getSearchCenterCoordinates(searchCenter)
  const point = suggestion.point
  const lat = getFiniteCoordinate(point?.latitude)
  const lng = getFiniteCoordinate(point?.longitude)
  if (!center || lat === null || lng === null)
    return suggestion

  return {
    ...suggestion,
    distance: suggestion.distance ?? Math.round(getDistanceMetersBetweenPoints(center, [lat, lng])),
  }
}

const sortSuggestionsByDistance = (suggestions: ISuggestion[]) =>
  [...suggestions].sort((a, b) => {
    const aDistance = Number.isFinite(Number(a.distance)) ? Number(a.distance) : Infinity
    const bDistance = Number.isFinite(Number(b.distance)) ? Number(b.distance) : Infinity

    if (aDistance !== bDistance)
      return aDistance - bDistance

    const sourcePriority = {
      [ESuggestionType.PointUserTop]: 0,
      [ESuggestionType.PointOfficial]: 1,
      [ESuggestionType.PointUnofficial]: 2,
    }

    return (sourcePriority[a.type ?? ESuggestionType.PointOfficial] ?? 3) -
      (sourcePriority[b.type ?? ESuggestionType.PointOfficial] ?? 3)
  })

const buildNominatimViewbox = (coords: [number, number], radiusKm = 35) => {
  const [lat, lng] = coords
  const latDelta = radiusKm / 111
  const lngDelta = radiusKm / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)))
  return [
    lng - lngDelta,
    lat + latDelta,
    lng + lngDelta,
    lat - latDelta,
  ].map(value => Number(value.toFixed(6))).join(',')
}

const isCertificateOrNetworkError = (error: any) => {
  const message = String(error?.message || error || '')
  const code = String(error?.code || '')
  return code === 'ERR_NETWORK' ||
    message.includes('Network Error') ||
    message.includes('ERR_CERT') ||
    message.includes('CERT_DATE_INVALID')
}


const reverseGeocodeCache = new Map<string, Promise<IPlaceResponse>>()
let reverseGeocodeQueue: Promise<unknown> = Promise.resolve()
let lastReverseGeocodeRequestAt = 0
const REVERSE_GEOCODE_MIN_DELAY_MS = 1250

const waitReverseGeocodeTurn = () => {
  reverseGeocodeQueue = reverseGeocodeQueue.catch(() => undefined).then(async() => {
    const now = Date.now()
    const waitMs = Math.max(0, REVERSE_GEOCODE_MIN_DELAY_MS - (now - lastReverseGeocodeRequestAt))
    if (waitMs)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    lastReverseGeocodeRequestAt = Date.now()
  })

  return reverseGeocodeQueue
}


const compactAddressPart = (value: unknown) => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()

const isHouseNumberPart = (value: string) => /^\d+[\wа-яёА-ЯЁ\-\/]*$/i.test(value.trim())

const isLowValueAddressPart = (value: string) => {
  const part = value.toLowerCase().trim()
  return !part ||
    /^\d{5,6}$/.test(part) ||
    part === 'россия' ||
    part.includes('федеральный округ') ||
    part.includes('область') ||
    part.includes('край') ||
    part.includes('городской округ') ||
    part.includes('муниципальный округ')
}

const compactAddressLabel = (address?: string) => {
  const source = String(address || '').trim()
  if (!source)
    return ''

  const parts = source
    .split(',')
    .map(compactAddressPart)
    .filter(Boolean)

  if (parts.length <= 2)
    return source

  let street = ''
  let house = ''
  let startIndex = 0

  if (isHouseNumberPart(parts[0]) && parts[1]) {
    house = parts[0]
    street = parts[1]
    startIndex = 2
  } else if (parts[1] && isHouseNumberPart(parts[1])) {
    street = parts[0]
    house = parts[1]
    startIndex = 2
  } else {
    street = parts[0]
    startIndex = 1
  }

  const main = [street, house].filter(Boolean).join(', ')
  const details = parts
    .slice(startIndex)
    .filter(part => !isLowValueAddressPart(part))
    .filter((part, index, list) => list.findIndex(item => item.toLowerCase() === part.toLowerCase()) === index)
    .slice(0, 2)
    .join(', ')

  const compact = details ? `${main} · ${details}` : main
  return compact.length <= 76 ? compact : `${compact.slice(0, 73).trim()}...`
}

const geocodeSuggestionsCache = new Map<string, Promise<IPlaceResponse[]>>()
let geocodeSuggestionsQueue: Promise<unknown> = Promise.resolve()
let lastGeocodeSuggestionsRequestAt = 0
const GEOCODE_SUGGESTIONS_MIN_DELAY_MS = 650

const waitGeocodeSuggestionsTurn = () => {
  geocodeSuggestionsQueue = geocodeSuggestionsQueue.catch(() => undefined).then(async() => {
    const now = Date.now()
    const waitMs = Math.max(0, GEOCODE_SUGGESTIONS_MIN_DELAY_MS - (now - lastGeocodeSuggestionsRequestAt))
    if (waitMs)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    lastGeocodeSuggestionsRequestAt = Date.now()
  })

  return geocodeSuggestionsQueue
}

const getGeocodeSuggestionsViaNominatim = (
  query: string,
  limit = 4,
  searchCenter?: TAddressSearchCenter,
): Promise<IPlaceResponse[]> => {
  const language = configSelectors.language(store.getState())
  const coords = getSearchCenterCoordinates(searchCenter)
  const cacheKey = [
    query.toLowerCase().trim(),
    language.iso,
    limit,
    coords ? coords.map(value => value.toFixed(4)).join(',') : 'global',
  ].join(':')
  const cached = geocodeSuggestionsCache.get(cacheKey)
  if (cached)
    return cached

  const request = waitGeocodeSuggestionsTurn()
    .then(() => axios.get(
      'https://nominatim.openstreetmap.org/search',
      {
        params: {
          q: query,
          addressdetails: 1,
          limit,
          format: 'json',
          'accept-language': language.iso,
          viewbox: coords ? buildNominatimViewbox(coords) : undefined,
        },
      },
    ))
    .then(res => Array.isArray(res.data) ? res.data : [])
    .then(items => items
      .filter((item: any) => item?.display_name && item.lat && item.lon)
      .map((item: any) => ({
        ...item,
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
      })),
    )
    .catch(error => {
      geocodeSuggestionsCache.delete(cacheKey)
      if (!isCertificateOrNetworkError(error))
        console.error(error)
      return []
    })

  geocodeSuggestionsCache.set(cacheKey, request)
  return request
}

const hereAddressToPlaceResponse = (item: any, lat: string, lng: string): IPlaceResponse => {
  const address = item?.address || {}
  const countryCode = String(address.countryCode || '').toLowerCase()
  const displayName = String(
    address.label ||
    [
      address.street && address.houseNumber ? `${address.street}, ${address.houseNumber}` : address.street,
      address.district,
      address.city,
      address.county,
      address.state,
      address.countryName,
    ].filter(Boolean).join(', '),
  ).trim()

  return {
    place_id: String(item?.id || `${lat},${lng}`),
    licence: 'HERE',
    osm_type: '',
    osm_id: '',
    boundingbox: [],
    lat,
    lon: lng,
    display_name: displayName,
    shortAddress: compactAddressLabel(displayName) || displayName,
    address: {
      country: address.countryName,
      country_code: countryCode,
      state: address.state,
      county: address.county,
      city: address.city,
      town: address.city,
      suburb: address.district,
      neighbourhood: address.district,
      road: address.street,
      house_number: address.houseNumber,
    },
  } as IPlaceResponse
}

const reverseGeocodeViaHere = async(
  lat: ValueOf<Stringify<IBookingCoordinatesLatitude>>,
  lng: ValueOf<Stringify<IBookingCoordinatesLongitude>>,
): Promise<IPlaceResponse | null> => {
  if (hereAutosuggestDisabled)
    return null

  const language = configSelectors.language(store.getState())
  try {
    const response = await axios.get(
      'https://revgeocode.search.hereapi.com/v1/revgeocode',
      {
        params: {
          at: `${lat},${lng}`,
          apiKey: hereAutosuggestApiKey,
          lang: language.iso,
          limit: 1,
        },
      },
    )
    const item = response.data?.items?.[0]
    return item ? hereAddressToPlaceResponse(item, String(lat), String(lng)) : null
  } catch (error: any) {
    if (error?.response?.status === 401)
      hereAutosuggestDisabled = true
    return null
  }
}

const reverseGeocodeViaNominatim = (
  lat: ValueOf<Stringify<IBookingCoordinatesLatitude>>,
  lng: ValueOf<Stringify<IBookingCoordinatesLongitude>>,
  { details = true }: {
    details?: boolean
  } = {},
): Promise<IPlaceResponse> => {
  const language = configSelectors.language(store.getState())

  return waitReverseGeocodeTurn()
    .then(() => axios.get(
      'https://nominatim.openstreetmap.org/reverse',
      {
        params: {
          lat,
          lon: lng,
          addressdetails: +details,
          format: 'json',
          'accept-language': language.iso,
        },
      },
    ))
    .then(res => res.data)
}

export const reverseGeocode = (
  lat: ValueOf<Stringify<IBookingCoordinatesLatitude>>,
  lng: ValueOf<Stringify<IBookingCoordinatesLongitude>>,
  { details = true }: {
    details?: boolean
  } = {},
): Promise<IPlaceResponse> => {
  const language = configSelectors.language(store.getState())
  const cacheKey = [
    Number(lat).toFixed(5),
    Number(lng).toFixed(5),
    Number(details),
    language.iso,
  ].join(':')

  const cached = reverseGeocodeCache.get(cacheKey)
  if (cached)
    return cached

  const request = reverseGeocodeViaHere(lat, lng)
    .then(hereResult => hereResult || reverseGeocodeViaNominatim(lat, lng, { details }))
    .then(result => {
      if (!result?.display_name)
        throw new Error('Reverse geocode returned empty address')
      return result
    })
    .catch(error => {
      reverseGeocodeCache.delete(cacheKey)
      throw error
    })

  reverseGeocodeCache.set(cacheKey, request)
  return request
}

export const geocode = (
  query: string,
  { details = false, searchCenter }: {
    details?: boolean
    searchCenter?: TAddressSearchCenter
  } = {},
): Promise<IPlaceResponse | null> => {
  const language = configSelectors.language(store.getState())
  const coords = getSearchCenterCoordinates(searchCenter)

  return axios.get(
    'https://nominatim.openstreetmap.org/search',
    {
      params: {
        q: query,
        addressdetails: +details,
        limit: 1,
        format: 'json',
        'accept-language': language.iso,
        viewbox: coords ? buildNominatimViewbox(coords) : undefined,
      },
    },
  )
    .then(res =>
      res.data[0] &&
            ({ ...res.data[0], lat: parseFloat(res.data[0].lat), lon: parseFloat(res.data[0].lon) }),
    )
}

const orsToken = '5b3ce3597851110001cf6248b6254554dbfc488a8585d67081a4000f'
const routeCacheStorageKey = 'orsRouteCache.v1'

const getFiniteRouteNumber = (value: unknown): number | null => {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const getRouteCacheKey = (from: IAddressPoint, to: IAddressPoint): string => {
  const pointKey = (point: IAddressPoint) => [
    Number(point.latitude).toFixed(6),
    Number(point.longitude).toFixed(6),
  ].join(',')

  return `${pointKey(from)}>${pointKey(to)}`
}

const readCachedRoute = (key: string): IRouteInfo | null => {
  try {
    const cache = JSON.parse(localStorage.getItem(routeCacheStorageKey) || '{}')
    return cache[key] || null
  } catch {
    return null
  }
}

const writeCachedRoute = (key: string, route: IRouteInfo) => {
  try {
    const cache = JSON.parse(localStorage.getItem(routeCacheStorageKey) || '{}')
    cache[key] = route

    const keys = Object.keys(cache)
    if (keys.length > 80) {
      keys.slice(0, keys.length - 80).forEach(oldKey => {
        delete cache[oldKey]
      })
    }

    localStorage.setItem(routeCacheStorageKey, JSON.stringify(cache))
  } catch {
    // Route cache is optional. If localStorage is unavailable, routing still works.
  }
}

export const makeRoutePoints = (from: IAddressPoint, to: IAddressPoint): Promise<IRouteInfo> => {
  const fromLatitude = getFiniteRouteNumber(from.latitude)
  const fromLongitude = getFiniteRouteNumber(from.longitude)
  const toLatitude = getFiniteRouteNumber(to.latitude)
  const toLongitude = getFiniteRouteNumber(to.longitude)

  if (
    fromLatitude === null ||
    fromLongitude === null ||
    toLatitude === null ||
    toLongitude === null
  )
    return Promise.reject(new Error('Invalid route coordinates'))

  const cacheKey = getRouteCacheKey(
    { ...from, latitude: fromLatitude, longitude: fromLongitude },
    { ...to, latitude: toLatitude, longitude: toLongitude },
  )
  const cachedRoute = readCachedRoute(cacheKey)

  if (cachedRoute)
    return Promise.resolve(cachedRoute)

  return axios.post(
    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    {
      coordinates: [
        [fromLongitude, fromLatitude],
        [toLongitude, toLatitude],
      ],
      radiuses: [-1, -1],
    },
    {
      headers: {
        Authorization: orsToken,
        'Content-Type': 'application/json',
      },
    },
  )
    .then(res => res.data)
    .then(res => {
      const feature = res.features?.[0]
      const summary = feature?.properties?.summary
      const coordinates = feature?.geometry?.coordinates

      if (!feature || !summary || !Array.isArray(coordinates))
        throw new Error('Invalid route response')

      const duration = Number(summary.duration) || 0
      const hours = Math.floor(duration / (60 * 60))
      const minutes = Math.round((duration - (hours * 60 * 60)) / 60)
      const points: [number, number][] = coordinates
        .map((item: unknown): [number, number] | null => {
          if (!Array.isArray(item) || item.length < 2)
            return null

          const longitude = Number(item[0])
          const latitude = Number(item[1])

          if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
            return null

          return [latitude, longitude]
        })
        .filter((item: [number, number] | null): item is [number, number] => Boolean(item))

      if (!points.length)
        throw new Error('Invalid route points')

      const route: IRouteInfo = {
        distance: parseFloat((Number(summary.distance || 0) / 1000).toFixed(2)),
        time: {
          hours,
          minutes,
        },
        points,
      }

      writeCachedRoute(cacheKey, route)
      return route
    })
    .catch(error => {
      const fallbackRoute = readCachedRoute(cacheKey)
      if (fallbackRoute)
        return fallbackRoute

      return Promise.reject(error)
    })
}

export const notifyPosition = (point: IAddressPoint) => {
  const userID = userSelectors.user(store.getState())?.u_id

  axios.post('http://jecat.ru/car_api/api/notifypos.php', {
    driver: userID,
    lat: point.latitude,
    lon: point.longitude,
    time: new Date().getTime() / 1000,
  })
}

export const getPointSuggestions = async(
  targetString?: string,
  isIntercity?: boolean,
  searchCenter?: TAddressSearchCenter,
): Promise<ISuggestion[]> => {
  const getBaseSuggestions = (center?: TAddressSearchCenter) => {
    const personalSuggestions = getPersonalAddressSuggestions(targetString)
      .map(item => withSuggestionDistance(item, center))
    const commonSuggestions: ISuggestion[] = getHints(targetString)
      .map(item => ({
        type: ESuggestionType.PointUnofficial,
        point: {
          address: item,
        },
      }))
    return mergeAddressSuggestions(personalSuggestions.concat(commonSuggestions))
  }

  const explicitCenter = getSearchCenterCoordinates(searchCenter)

  if (!targetString) {
    const baseSuggestions = getBaseSuggestions(explicitCenter || undefined)
    return explicitCenter ? sortSuggestionsByDistance(baseSuggestions).slice(0, 6) : baseSuggestions
  }

  try {
    const language = configSelectors.language(store.getState())

    let coords: [number, number]

    if (explicitCenter) {
      coords = explicitCenter
    } else {
      try {
        coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
              resolve([coords.latitude, coords.longitude])
            },
            error => reject(error),
            { enableHighAccuracy: true },
          )
        })
      } catch (error) {
        coords = SITE_CONSTANTS.DEFAULT_POSITION
      }
    }

    const baseSuggestions = getBaseSuggestions(coords)

    let officialResults: ISuggestion[] = []

    if (!hereAutosuggestDisabled) {
      try {
        const officialSuggestions = await axios.get(
          'https://geocode.search.hereapi.com/v1/autosuggest',
          {
            params: {
              q: targetString.toString(),
              at: isIntercity ? `${coords[0]},${coords[1]}` : undefined,
              in: isIntercity ? undefined : `circle:${coords[0]},${coords[1]};r=${SITE_CONSTANTS.SEARCH_RADIUS * 1000}`,
              apiKey: hereAutosuggestApiKey,
              lang: language.iso,
              limit: 4,
            },
          },
        )
          .then(res => res.data)

        officialResults = officialSuggestions.items ?
          officialSuggestions.items
            .map((item: any): ISuggestion | null => {
                if (item.position) {
                  const address = String(item.address?.label || '').trim()
                  return withSuggestionDistance({
                    type: ESuggestionType.PointOfficial,
                    point: {
                      latitude: item.position.lat,
                      longitude: item.position.lng,
                      address,
                      shortAddress: compactAddressLabel(address) || address,
                    },
                    distance: item.distance,
                  }, coords)
                }
                return null
            })
            .filter((item: ISuggestion | null) => item) as ISuggestion[] :
          []
      } catch (error: any) {
        if (error?.response?.status === 401)
          hereAutosuggestDisabled = true
        else if (!isCertificateOrNetworkError(error))
          console.error(error)
      }
    }

    if (officialResults.length < 4) {
      const nominatimSuggestions = await getGeocodeSuggestionsViaNominatim(
        targetString.toString(),
        Math.max(3, 4 - officialResults.length),
        coords,
      )

      officialResults = officialResults.concat(
        nominatimSuggestions.map((item: any): ISuggestion => {
          const address = String(item.display_name || '').trim()
          return withSuggestionDistance({
            type: ESuggestionType.PointOfficial,
            point: {
              latitude: Number(item.lat),
              longitude: Number(item.lon),
              address,
              shortAddress: compactAddressLabel(address) || address,
            },
          }, coords)
        }),
      )
    }

    return sortSuggestionsByDistance(mergeAddressSuggestions(baseSuggestions.concat(officialResults))).slice(0, 6)
  } catch (error: any) {
    if (error?.response?.status === 401)
      hereAutosuggestDisabled = true
    else if (!isCertificateOrNetworkError(error))
      console.error(error)

    const baseSuggestions = getBaseSuggestions(explicitCenter || undefined)
    return explicitCenter ? sortSuggestionsByDistance(baseSuggestions).slice(0, 6) : baseSuggestions
  }
}

function mergeAddressSuggestions(suggestions: ISuggestion[]) {
  const met = new Set<string>()
  const result: ISuggestion[] = []

  for (const suggestion of suggestions) {
    const point = suggestion.point
    const address = String(point?.address || point?.shortAddress || '').trim()
    if (!address)
      continue
    const lat = Number(point?.latitude)
    const lng = Number(point?.longitude)
    const key = [
      address.toLowerCase(),
      Number.isFinite(lat) ? lat.toFixed(5) : '',
      Number.isFinite(lng) ? lng.toFixed(5) : '',
    ].join('|')
    if (met.has(key))
      continue
    met.add(key)
    result.push({
      ...suggestion,
      point: point ? {
        ...point,
        shortAddress: point.shortAddress || compactAddressLabel(address) || address,
      } : point,
    })
  }

  return result
}

export const activateChatServer = () => {
  // chat.itest24.com can have an expired/invalid TLS certificate on test stands.
  // The health-check is optional, so do not spam the console or break the app when it is unavailable.
  if (getConfigValue('ENABLE_CHAT_HEALTHCHECK') !== '1')
    return Promise.resolve(null)

  return axios.get('https://chat.itest24.com/wschat/checksrv.php', {
    params: {
      s: 1,
    },
  }).catch(error => {
    if (!isCertificateOrNetworkError(error))
      console.error(error)
    return null
  })
}
