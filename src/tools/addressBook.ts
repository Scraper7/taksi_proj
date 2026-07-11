import { IAddressPoint, ISuggestion, ESuggestionType } from '../types/types'
import { getItem, setItem } from './localStorage'
import { shortenAddress } from './utils'

const PERSONAL_ADDRESS_BOOK_KEY = 'taxi.personalAddressBook.v1'
const MAX_PERSONAL_ADDRESSES = 30

const normalizeText = (value: unknown) => String(value || '')
  .toLowerCase()
  .replace(/ё/g, 'е')
  .replace(/[^0-9a-zа-яё]+/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const getAddressKey = (point: IAddressPoint) => {
  const address = normalizeText(point.address || point.shortAddress)
  const lat = Number(point.latitude)
  const lng = Number(point.longitude)
  if (Number.isFinite(lat) && Number.isFinite(lng))
    return `${address}|${lat.toFixed(5)}|${lng.toFixed(5)}`
  return address
}

const isFilledPoint = (point?: IAddressPoint | null): point is IAddressPoint =>
  Boolean(
    point &&
    (point.address || point.shortAddress) &&
    Number.isFinite(Number(point.latitude)) &&
    Number.isFinite(Number(point.longitude)),
  )

const readPersonalAddressBook = (): IAddressPoint[] => {
  const value = getItem<IAddressPoint[]>(PERSONAL_ADDRESS_BOOK_KEY, [])
  return Array.isArray(value) ? value.filter(isFilledPoint) : []
}

const writePersonalAddressBook = (items: IAddressPoint[]) => {
  setItem(PERSONAL_ADDRESS_BOOK_KEY, items.slice(0, MAX_PERSONAL_ADDRESSES))
}

export const rememberPersonalAddress = (point?: IAddressPoint | null) => {
  if (!isFilledPoint(point))
    return

  const address = String(point.address || point.shortAddress || '').trim()
  if (!address)
    return

  const normalizedPoint: IAddressPoint = {
    ...point,
    address,
    shortAddress: point.shortAddress || shortenAddress(address) || address,
  }

  const key = getAddressKey(normalizedPoint)
  const withoutDuplicate = readPersonalAddressBook()
    .filter(item => getAddressKey(item) !== key)

  writePersonalAddressBook([normalizedPoint, ...withoutDuplicate])
}

export const rememberPersonalAddresses = (...points: Array<IAddressPoint | null | undefined>) => {
  points.forEach(rememberPersonalAddress)
}

export const getPersonalAddressSuggestions = (query?: string): ISuggestion[] => {
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery)
    return []

  return readPersonalAddressBook()
    .map(point => ({
      point,
      score: getSuggestionScore(normalizedQuery, point),
    }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ point }) => ({
      type: ESuggestionType.PointUserTop,
      point,
    }))
}

function getSuggestionScore(query: string, point: IAddressPoint) {
  const address = normalizeText(point.address)
  const shortAddress = normalizeText(point.shortAddress)
  const source = [address, shortAddress].filter(Boolean).join(' ')

  if (!source)
    return 0
  if (source === query)
    return 100
  if (source.startsWith(query))
    return 80
  if (source.includes(query))
    return 60

  const words = query.split(' ').filter(Boolean)
  const matchedWords = words.filter(word => source.includes(word)).length
  return matchedWords ? matchedWords * 10 : 0
}
