import SITE_CONSTANTS from '../siteConstants'
import { t, TRANSLATION } from '../localization'

type TConfigEntry = { id: string, label: string }

type TOption<T = string> = {
  value: T,
  label: string,
}

const LOCALIZABLE_KEY_RE = /^[a-z0-9_.-]+$/i

const DEFAULT_DRIVER_OFFER_ETA_LABELS = [
  TRANSLATION.DRIVER_OFFER_ETA_5,
  TRANSLATION.DRIVER_OFFER_ETA_10,
  TRANSLATION.DRIVER_OFFER_ETA_15,
  TRANSLATION.DRIVER_OFFER_ETA_20,
  TRANSLATION.DRIVER_OFFER_ETA_30,
  TRANSLATION.DRIVER_OFFER_ETA_45,
  TRANSLATION.DRIVER_OFFER_ETA_60,
  TRANSLATION.DRIVER_OFFER_ETA_90,
  TRANSLATION.DRIVER_OFFER_ETA_120,
  TRANSLATION.DRIVER_OFFER_ETA_180,
]

const DEFAULT_DRIVER_OFFER_COMMENT_LABELS = [
  TRANSLATION.DRIVER_OFFER_COMMENT_DIRECT,
  TRANSLATION.DRIVER_OFFER_COMMENT_FAST,
  TRANSLATION.DRIVER_OFFER_COMMENT_AC,
  TRANSLATION.DRIVER_OFFER_COMMENT_BIG_TRUNK,
  TRANSLATION.DRIVER_OFFER_COMMENT_NEARBY,
  TRANSLATION.DRIVER_OFFER_COMMENT_CAREFUL,
]

const DEFAULT_DRIVER_OFFER_SEAT_VALUES = [1, 2, 3, 4, 5, 6, 7, 8]

export function getLocalizedSiteConstantLabel(label: unknown) {
  const value = String(label ?? '').trim()
  if (!value)
    return ''

  return LOCALIZABLE_KEY_RE.test(value) ? t(value) : value
}

function normalizeEntries(entries: TConfigEntry[] | undefined, fallbackLabels: string[]) {
  const source = entries && entries.length ? entries : fallbackLabels.map((label, index) => ({
    id: String(index),
    label,
  }))

  const values = source
    .map(item => getLocalizedSiteConstantLabel(item.label))
    .filter(Boolean)

  return values.length ? values : fallbackLabels.map(getLocalizedSiteConstantLabel).filter(Boolean)
}

export function getDriverOfferEtaLabels() {
  return normalizeEntries(SITE_CONSTANTS.DRIVER_OFFER_ETA_OPTIONS, DEFAULT_DRIVER_OFFER_ETA_LABELS)
}

export function getDriverOfferCommentLabels() {
  return normalizeEntries(SITE_CONSTANTS.DRIVER_OFFER_COMMENT_OPTIONS, DEFAULT_DRIVER_OFFER_COMMENT_LABELS)
}

export function getDriverOfferEtaOptions(): TOption[] {
  return getDriverOfferEtaLabels().map(label => ({
    value: label,
    label,
  }))
}

export function getDriverOfferSeatOptions(): TOption<number>[] {
  const source = SITE_CONSTANTS.DRIVER_OFFER_SEAT_OPTIONS?.length ?
    SITE_CONSTANTS.DRIVER_OFFER_SEAT_OPTIONS :
    DEFAULT_DRIVER_OFFER_SEAT_VALUES.map(value => ({ id: String(value), label: String(value) }))

  const options = source
    .map(item => {
      const numericValue = parseInt(String(item.id || item.label), 10)
      if (!Number.isFinite(numericValue) || numericValue <= 0)
        return null

      return {
        value: numericValue,
        label: getLocalizedSiteConstantLabel(item.label) || String(numericValue),
      }
    })
    .filter(Boolean) as TOption<number>[]

  return options.length ? options : DEFAULT_DRIVER_OFFER_SEAT_VALUES.map(value => ({
    value,
    label: String(value),
  }))
}
