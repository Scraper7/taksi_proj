import { IRootState } from '../'
import { moduleName } from './constants'

export const moduleSelector = (state: IRootState) => state[moduleName]

export const geoposition = (state: IRootState) =>
  moduleSelector(state).geoposition