import { IRootState } from '../index'
import { createSelector } from 'reselect'
import { moduleName } from './constants'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const status = createSelector(moduleSelector, state => state.status)
export const language = createSelector(moduleSelector, state => state.language)