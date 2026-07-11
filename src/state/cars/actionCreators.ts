import { ParametersExceptFirst, TAction } from '../../types'
import { ICar } from '../../types/types'
import * as API from '../../API'
import { IDispatch } from '..'
import { ActionTypes } from './constants'

export const getUserCars = (): TAction =>
  ({ type: ActionTypes.GET_USER_CARS_REQUEST })

export const createUserCar = (
  ...params: Parameters<typeof API.createUserCar>
) => async(dispatch: IDispatch) => {
  const response = await API.createUserCar(...params)
  const createdCarId = (response.data as any)?.created_car?.c_id
  if (String(response.code) === '200' && createdCarId)
    dispatch({
      type: ActionTypes.CREATE_USER_CAR_SUCCESS,
      payload: createdCarId,
    })
  return response
}

export const edit = (
  id: ICar['c_id'],
  ...params: ParametersExceptFirst<typeof API.editCar>
) => mutationThunk(() => API.editCar(id, ...params), id)
export const drive = (car: ICar) =>
  mutationThunk(() => API.driveCar(car), car.c_id)

const mutationThunk = <TReturn>(
  mutation: () => Promise<TReturn>,
  id: ICar['c_id'],
) => async(
    dispatch: IDispatch,
  ): Promise<TReturn> => {
    dispatch({ type: ActionTypes.START_MUTATION, payload: id })
    try {
      return await mutation()
    } finally {
      dispatch({ type: ActionTypes.END_MUTATION, payload: id })
    }
  }
