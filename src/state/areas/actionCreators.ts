import { TAction } from '../../types'
import { IArea } from '../../types/types'
import { ActionTypes } from './constants'

export const getArea = (payload: IArea['id']): TAction =>
  ({ type: ActionTypes.GET_AREA_REQUEST, payload })

export const getAreasBetweenPoints = (
  payload: [lat: number, lng: number][],
): TAction => ({ type: ActionTypes.GET_AREAS_BETWEEN_POINTS_REQUEST, payload })