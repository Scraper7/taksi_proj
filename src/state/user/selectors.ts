import { IRootState } from './../index'
import { createSelector } from 'reselect'
import { moduleName } from './constants'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const user = createSelector(moduleSelector, state => state.user)
export const tokens = createSelector(moduleSelector, state => state.tokens)
export const status = createSelector(moduleSelector, state => state.status)
export const message = createSelector(moduleSelector, state => state.message)
export const tab = createSelector(moduleSelector, state => state.tab)
export const registerResponse = createSelector(moduleSelector, state => state.response)
export const whatsappSignUpData = createSelector(moduleSelector, state => state.whatsappSignUpData)