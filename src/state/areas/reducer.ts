import { Record } from 'immutable'
import { TAction } from '../../types'
import { ActionTypes, IAreasState } from './constants'

export const ReducerRecord = Record<IAreasState>({
  areas: {},
})

export default function(state = new ReducerRecord(), action: TAction) {
  const { type, payload } = action

  switch (type) {
    case ActionTypes.GET_AREA_SUCCESS:
      return state
        .set('areas', { ...state.areas, [payload.id]: payload })
    default:
      return state
  }
}