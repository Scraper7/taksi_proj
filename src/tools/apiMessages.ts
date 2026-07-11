import { t, TRANSLATION } from '../localization'

type TApiErrorRule = {
  apiCodes: string[]
  translation: string
}

export const API_ERROR_MESSAGE_TABLE: TApiErrorRule[] = [
  {
    apiCodes: ['car not found', 'no car', 'car missing', 'used_car_not_found', 'not_linked_car'],
    translation: 'driver_status_need_car',
  },
  {
    apiCodes: ['wrong user role'],
    translation: TRANSLATION.WRONG_USER_ROLE,
  },
  {
    apiCodes: ['user is not performer', 'not performer'],
    translation: TRANSLATION.USER_IS_NOT_PERFORMER_ERROR,
  },
  {
    apiCodes: ['busy registration plate'],
    translation: TRANSLATION.CAR_ERROR_PLATE_BUSY,
  },
  {
    apiCodes: ['wrong user check state'],
    translation: TRANSLATION.DRIVER_NOT_APPROVED,
  },
  {
    apiCodes: ['cm_id', 'car_models'],
    translation: TRANSLATION.CAR_ERROR_MODEL_INVALID,
  },
  {
    apiCodes: ['registration_plate'],
    translation: TRANSLATION.CAR_ERROR_PLATE_INVALID,
  },
  {
    apiCodes: ['color', 'car_colors'],
    translation: TRANSLATION.CAR_ERROR_COLOR_INVALID,
  },
  {
    apiCodes: ['photo'],
    translation: TRANSLATION.CAR_ERROR_PHOTO_INVALID,
  },
  {
    apiCodes: ['details'],
    translation: TRANSLATION.CAR_ERROR_DETAILS_INVALID,
  },
  {
    apiCodes: ['cc_id', 'car_classes'],
    translation: TRANSLATION.CAR_ERROR_CLASS_INVALID,
  },
  {
    apiCodes: ['seats'],
    translation: TRANSLATION.CAR_ERROR_SEATS_INVALID,
  },
]

const stringifyApiValue = (value: any) => {
  if (value == null)
    return ''

  if (typeof value === 'string')
    return value

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const getApiText = (response: any) => [
  response?.message,
  response?.info,
  response?.error,
  response?.data?.message,
  response?.data?.error,
  response?.data?.info,
  response?.data?.detail,
  stringifyApiValue(response),
]
  .filter(Boolean)
  .join(' ')
  .toLowerCase()

const getOriginalApiCode = (response: any) => {
  if (typeof response === 'string')
    return response.trim()

  const value = [
    response?.message,
    response?.error,
    response?.info,
    response?.data?.message,
    response?.data?.error,
    response?.data?.info,
    response?.code && String(response.code) !== '200' ? `code ${response.code}` : '',
    stringifyApiValue(response),
  ].find(Boolean)

  return stringifyApiValue(value).trim()
}

const withOriginalApiCode = (message: string, response: any, fallbackCode = '') => {
  const originalCode = getOriginalApiCode(response) || fallbackCode
  if (!originalCode)
    return message

  if (message.toLowerCase().includes(originalCode.toLowerCase()))
    return message

  return `${message}\n${t('message_modal_error_code_english')}: ${originalCode}`
}

const findApiErrorRule = (response: any) => {
  const text = getApiText(response)
  return API_ERROR_MESSAGE_TABLE.find(rule =>
    rule.apiCodes.some(code => text.includes(code.toLowerCase())),
  )
}

export const getApiErrorMessage = (
  response: any,
  options: { context?: 'car-registration' | 'car-profile' | 'driver-order' } = {},
) => {
  const rule = findApiErrorRule(response)
  const message = rule ? t(rule.translation) : ''
  const fallbackCode = rule?.apiCodes[0] || ''

  if (message && options.context === 'car-registration')
    return withOriginalApiCode(`${t(TRANSLATION.CAR_REGISTRATION_PARTIAL_SUCCESS)} ${message}`, response, fallbackCode)

  if (message)
    return withOriginalApiCode(message, response, fallbackCode)

  return withOriginalApiCode(t(TRANSLATION.API_ERROR_GENERIC), response, 'unknown_api_error')
}
