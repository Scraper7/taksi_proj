import { IDispatch } from '..'
import { ActionTypes } from './constants'

export const watch = (
  payload: { interval: number },
) => (dispatch: IDispatch) => {
  dispatch({ type: ActionTypes.WATCH, payload })
  return () => {
    dispatch({ type: ActionTypes.UNWATCH, payload })
  }
}

export const activateSending = () => (dispatch: IDispatch) => {
  dispatch({ type: ActionTypes.ACTIVATE_SENDING })
  return () => {
    dispatch({ type: ActionTypes.DEACTIVATE_SENDING })
  }
}