import {
  List as ImmutableList,
  Map as ImmutableMap,
  Record as ImmutableRecord,
} from 'immutable'
import { TAction } from '../../types'
import { ICar } from '../../types/types'
import { ActionTypes, ICarState, ICarsState } from './constants'

const CarRecord = ImmutableRecord<ICarState>({
  value: undefined,
  mutations: 0,
})

const defaultRecord: ICarsState = {
  cars: ImmutableMap(),
  userCars: undefined,
}

export const ReducerRecord = ImmutableRecord<ICarsState>(defaultRecord)

export default function(
  state = new ReducerRecord(),
  { type, payload }: TAction,
) {
  switch (type) {

    case ActionTypes.START_MUTATION: {
      return state
        .set('cars', state.cars
          .update(payload, new CarRecord(), value => value
            .update('mutations', value => value + 1),
          ),
        )
    }
    case ActionTypes.END_MUTATION: {
      const carData = state.cars.get(payload)!
        .update('mutations', value => value - 1)
      return state
        .set('cars', !carData.value && carData.mutations === 0 ?
          state.cars
            .delete(payload) :
          state.cars
            .set(payload, carData),
        )
    }

    case ActionTypes.GET_SUCCESS: {
      return state
        .set('cars', state.cars
          .update(payload.c_id, value => value!
            .set('value', payload),
          ),
        )
    }
    case ActionTypes.GET_NOT_FOUND: {
      const carData = state.cars.get(payload)
        ?.set('value', null)
      return state
        .set('cars', (carData?.mutations as number) > 0 ?
          state.cars
            .set(payload, carData!) :
          state.cars
            .delete(payload),
        )
        .set('userCars', state.userCars
          ?.delete(payload),
        )
    }

    case ActionTypes.GET_USER_CARS_SUCCESS: {
      return state
        .set('userCars', ImmutableList(payload.map((car: ICar) => car.c_id)))
        .set('cars', state.cars
          .deleteAll(state.userCars?.filter(id =>
            state.cars.get(id)?.mutations === 0,
          ) ?? [])
          .mergeWith(
            (oldValue, newValue) => oldValue
              .set('value', newValue.value),
            payload.map((car: ICar) => [car.c_id, new CarRecord({
              value: car,
            })]),
          ),
        )
    }

    default:
      return state

  }
}