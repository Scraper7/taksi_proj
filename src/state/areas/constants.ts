import { appName } from '../../constants'
import { IArea } from '../../types/types'

export const moduleName = 'areas'

const prefix = `${appName}/${moduleName}`

export const ActionTypes = {
  GET_AREA_REQUEST: `${prefix}/GET_AREA_REQUEST`,
  GET_AREAS_BETWEEN_POINTS_REQUEST:
    `${prefix}/GET_AREAS_INCLUDES_POINTS_REQUEST`,
  GET_AREA_SUCCESS: `${prefix}/GET_AREA_SUCCESS`,
  GET_AREA_FAIL: `${prefix}/GET_AREA_FAIL`,
} as const

export interface IAreasState {
  areas: Record<IArea['id'], IArea>
}