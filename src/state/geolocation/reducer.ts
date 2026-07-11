import { Record as ImmutableRecord } from 'immutable'
import { TAction } from '../../types'
import { ActionTypes, IGeolocationState } from './constants'

const defaultRecord: IGeolocationState = {
  geoposition: undefined,
}

export const ReducerRecord = ImmutableRecord<IGeolocationState>(defaultRecord)

export default function(
  state = new ReducerRecord(),
  { type, payload }: TAction,
) {
  switch (type) {

    case ActionTypes.GET_SUCCESS: {
      return state
        .set('geoposition', payload)
    }

    default:
      return state

  }
}