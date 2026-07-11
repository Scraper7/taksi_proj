import axios from 'axios'
import { IUser } from '../types/types'
import { convertUser, reverseConvertUser } from '../tools/convert'
import { addToFormData, apiMethod, IApiMethodArguments } from '../tools/api'
import Config from '../config'

function firstObjectValue<T = any>(value: any): T | null {
  if (!value || typeof value !== 'object')
    return null

  for (const key in value)
    if (Object.prototype.hasOwnProperty.call(value, key))
      return value[key] as T

  return null
}

function safeObjectValues<T = any>(value: any): T[] {
  if (!value || typeof value !== 'object')
    return []

  const result: T[] = []
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key))
      result.push(value[key] as T)
  }
  return result
}

const _getUser = (
  { formData }: IApiMethodArguments,
  id: IUser['u_id'],
): Promise<IUser | null> => {
  return axios.post(`${Config.API_URL}/user/${id}`, formData)
    .then(res => res.data?.data)
    .then(res => {
      const users = res?.user
      const user = users && typeof users === 'object' ? users[id] : null

      return user ? convertUser(user) || null : null
    })
}
export const getUser = apiMethod<typeof _getUser>(_getUser)

const _getUsers = (
  { formData }: IApiMethodArguments,
  ids: IUser['u_id'][],
): Promise<IUser[]> => {
  return axios.post(`${Config.API_URL}/user/${ids.join(',')}`, formData)
    .then(res => res.data?.data)
    .then(res => {
      const users = res?.user
      if (!users || typeof users !== 'object')
        return []

      return safeObjectValues(users).map(i => convertUser(i)).filter(Boolean) as IUser[]
    })
}
export const getUsers = apiMethod<typeof _getUsers>(_getUsers)

const _getAuthorizedUser = (
  { formData }: IApiMethodArguments,
): Promise<IUser | null> => {
  return axios.post(`${Config.API_URL}/user/authorized`, formData)
    .then(res => res.data?.data)
    .then(res => {
      const user = firstObjectValue<IUser>(res?.user)

      return user ? convertUser(user) || null : null
    })
}
export const getAuthorizedUser = apiMethod<typeof _getAuthorizedUser>(_getAuthorizedUser)

type TEditUser = Partial<Pick<IUser, 'u_id' | 'token' | 'u_hash'>>
export type TEditClient = TEditUser & Partial<Pick<IUser,
  'u_role' |
  'u_name' |
  'u_family' |
  'u_middle' |
  'u_phone' |
  'u_email' |
  'u_photo' |
  'u_lang' |
  'u_currency' |
  'ref_code' |
  'u_details'
>>
export type TEditDriverCheckRequired = TEditUser & Partial<Pick<IUser,
  'u_role' |
  'u_name' |
  'u_family' |
  'u_middle' |
  'u_phone' |
  'u_email' |
  'u_photo' |
  'u_city' |
  'u_lang_skills' |
  'u_description' |
  'u_birthday' |
  'ref_code' |
  'u_details'
>>
export type TEditDriverCheckActive = TEditUser & Partial<Pick<IUser,
  'u_role' |
  'u_lang' |
  'u_currency' |
  'u_gps_software' |
  'u_active' |
  'out_drive' |
  'out_address' |
  'out_latitude' |
  'out_longitude' |
  'out_est_datetime' |
  'out_s_address' |
  'out_s_latitude' |
  'out_s_longitude' |
  'out_passengers' |
  'out_luggage' |
  'ref_code' |
  'u_details'
>>

const _editUser = (
  { formData }: IApiMethodArguments,
  data:
    TEditClient |
    TEditDriverCheckRequired |
    TEditDriverCheckActive,
) => {
  // @TODO вернуть u_city когда наладим автозаполнение
  const { token, u_hash, u_id, u_city, ...userData } = data as (
    TEditClient &
    TEditDriverCheckRequired &
    TEditDriverCheckActive
  )
  if (token && u_hash && u_id) addToFormData(formData, { token, u_hash, u_id })
  addToFormData(formData, {
    data: JSON.stringify({
      u_city: u_city || undefined,
      ...reverseConvertUser(userData),
    }),
  })

  return axios.post(`${Config.API_URL}/user`, formData)
    .then(res => res.data)
}
export const editUser = apiMethod<typeof _editUser>(_editUser)
export const editUserAfterRegister = apiMethod<typeof _editUser>(_editUser, { authRequired: false })
