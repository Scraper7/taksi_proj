import axios from 'axios'
import { EBookingLocationKinds, ICar, IUser } from '../types/types'
import { IResponse } from '../types/api'
import { convertCar } from '../tools/convert'
import { addToFormData, apiMethod, IApiMethodArguments } from '../tools/api'
import Config from '../config'
import SITE_CONSTANTS from '../siteConstants'

type TCreateCar = Pick<ICar,
  'cm_id' |
  'seats' |
  'registration_plate' |
  'color' |
  'cc_id'
> & Partial<Pick<ICar,
  'photo' |
  'details'
>>
interface ICreateCarResponse {
  created_car: {
    c_id: ICar['c_id'],
    u_id: IUser['u_id']
  }
}

export const createCar = apiMethod(async(
  { formData }: IApiMethodArguments,
  fields: {
    u_id: IUser['u_id']
  } & TCreateCar,
): Promise<IResponse<'200', ICreateCarResponse> | IResponse<'404', {}>> => {
  const { u_id, ...formFields } = fields
  addToFormData(formData, { data: JSON.stringify(formFields) })
  const { data } =
    await axios.post(`${Config.API_URL}/user/${u_id}/car`, formData)
  return data
})

const _getCar = (
  { formData }: IApiMethodArguments,
  id: ICar['c_id'],
): Promise<ICar | null> => {
  return axios.post(`${Config.API_URL}/car/${id}`, formData)
    .then(res => res.data.data)
    .then(res => (res.car && res.car[id] && convertCar(res.car[id])) || null)
}
export const getCar = apiMethod<typeof _getCar>(_getCar)

const _getCars = (
  { formData }: IApiMethodArguments,
  ids: IUser['u_id'][],
): Promise<ICar[]> => {
  return axios.post(`${Config.API_URL}/car/${ids.join(',')}`, formData)
    .then(res => res.data.data)
    .then(res => Object.values(res.car).map(i => convertCar(i)))
}
export const getCars = apiMethod<typeof _getCars>(_getCars)

export const createUserCar = apiMethod(async(
  { formData }: IApiMethodArguments,
  fields: TCreateCar & {
    country?: keyof typeof SITE_CONSTANTS.COUNTRIES
  },
): Promise<IResponse<'200', ICreateCarResponse> | IResponse<'404', {}>> => {
  const { country, ...formFields } = fields
  addToFormData(formData, { data: JSON.stringify(formFields) })
  const { data: response } = await axios.post(`${Config.API_URL}/car`, formData)
  if (country && String(response?.code) === '200' && response?.data?.created_car?.c_id)
    await setDefaultCarLicenses(response.data.created_car.c_id, country)
  return response
})

const setDefaultCarLicenses = apiMethod(async(
  { formData }: IApiMethodArguments,
  id: ICar['c_id'],
  country: keyof typeof SITE_CONSTANTS.COUNTRIES,
): Promise<void> => {
  const locationClass = SITE_CONSTANTS.BOOKING_LOCATION_CLASSES
    .find(lc => lc.kind === EBookingLocationKinds.Intercity)!
  addToFormData(formData, { data: JSON.stringify({
    licenses: [{
      en: 'license',
      b_l_c: [{
        location: locationClass.id,
        value: country,
      }],
    }],
  }) })
  await axios.post(`${Config.API_URL}/car/${id}`, formData)
})

const _getUserCars = (
  { formData }: IApiMethodArguments,
): Promise<any> => {
  return axios.post(`${Config.API_URL}/user/authorized/car`, formData)
    .then(res => Object.values(res?.data?.data?.car || {}))
}
export const getUserCars = apiMethod<typeof _getUserCars>(_getUserCars)

const _getUserCar = (
  { formData }: IApiMethodArguments,
  id: IUser['u_id'],
): Promise<ICar | null> => {
  addToFormData(formData, {
    array_type: 'list',
  })

  return axios.post(`${Config.API_URL}/user/${id}/car`, formData)
    .then(res => res.data.data)
    .then(res => (res.car && res.car[0]) || null)
}
export const getUserCar = apiMethod<typeof _getUserCar>(_getUserCar)

export const editCar = apiMethod(async(
  { formData }: IApiMethodArguments,
  id: ICar['c_id'],
  fields: Partial<Pick<ICar,
    'cm_id' |
    'seats' |
    'registration_plate' |
    'color' |
    'photo' |
    'details' |
    'cc_id'
  >>,
): Promise<IResponse<'200', {}> | IResponse<'404', {}>> => {
  addToFormData(formData, { data: JSON.stringify(fields) })
  const { data } = await axios.post(`${Config.API_URL}/car/${id}`, formData)
  return data
})

export const driveCar = apiMethod(async(
  { formData }: IApiMethodArguments,
  car: ICar,
): Promise<IResponse<'200', {}> | IResponse<'404', {
  detail?: 'not_modified'
}>> => {
  let { data: response } = await axios.post(
    `${Config.API_URL}/car/${car.c_id}/drive`,
    formData,
  )
  if (
    response.code === '404' &&
    response.message === 'car is already driven by this user'
  ) response.data = { detail: 'not_modified' }

  if (
    response.code === '200' ||
    (response.code === '404' && response.data.detail === 'not_modified')
  ) {
    const syncUserResponse = await syncUserWithCar(car)
    if (!(syncUserResponse.code === '200' || (
      syncUserResponse.code === '404' &&
      syncUserResponse.data.detail === 'not_modified'
    ))) response = syncUserResponse
  }
  return response
})

const syncUserWithCar = apiMethod(async(
  { formData }: IApiMethodArguments,
  car: ICar,
): Promise<IResponse<'200', {}> | IResponse<'404', {
  detail?: 'not_modified'
}>> => {
  const carClass = SITE_CONSTANTS.CAR_CLASSES[car.cc_id]
  addToFormData(formData, { data: JSON.stringify({
    'b_location_classes=': carClass?.booking_location_classes ??
      SITE_CONSTANTS.BOOKING_LOCATION_CLASSES.map(({ id }) => id),
  }) })
  const { data: response } =
    await axios.post(`${Config.API_URL}/user`, formData)
  if (
    response.code === '404' &&
    response.message === 'user or modified data not found'
  ) response.data = { detail: 'not_modified' }
  return response
})

async function _getUserDrivenCar(
  { formData }: IApiMethodArguments,
): Promise<ICar> {
  const { data } = await axios.post(
    `${Config.API_URL}/user/authorized/car/driven`,
    formData,
  )
  return Object.values(data.data.car)[0] as ICar
}
export const getUserDrivenCar =
  apiMethod<typeof _getUserDrivenCar>(_getUserDrivenCar)
