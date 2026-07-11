import { List as ImmutableList, Map as ImmutableMap, RecordOf } from 'immutable'
import { ICar } from '../../types/types'
import { appName } from '../../constants'

export const moduleName = 'cars'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  GET_SUCCESS: `${prefix}/GET_CAR_SUCCESS`,
  GET_NOT_FOUND: `${prefix}/GET_NOT_FOUND`,
  GET_FAIL: `${prefix}/GET_CAR_FAIL`,
  START_MUTATION: `${prefix}/START_CAR_MUTATION`,
  END_MUTATION: `${prefix}/END_CAR_MUTATION`,

  GET_USER_CARS_REQUEST: `${prefix}/GET_USER_CARS_REQUEST`,
  GET_USER_CARS_SUCCESS: `${prefix}/GET_USER_CARS_SUCCESS`,
  GET_USER_CARS_FAIL: `${prefix}/GET_USER_CARS_FAIL`,
  CREATE_USER_CAR_SUCCESS: `${prefix}/CREATE_USER_CAR_SUCCESS`,
}

export interface ICarState {
  value?: ICar | null
  mutations: number
}

export interface ICarsState {
  cars: ImmutableMap<ICar['c_id'], RecordOf<ICarState>>
  userCars?: ImmutableList<ICar['c_id']>
}