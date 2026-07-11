import { createStore, applyMiddleware } from 'redux'
import thunk, { ThunkDispatch } from 'redux-thunk'
import { composeWithDevTools } from '@redux-devtools/extension'
import createSagaMiddleware from 'redux-saga'
import rootSaga from './rootSaga'
import rootReducer from './rootReducer'

const sagaMiddleware = createSagaMiddleware()
const configureStore = () => {
  const composeEnhancers =
    (
      (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ &&
      (window as any).__REDUX_DEVTOOLS_EXTENSION_COMPOSE__({ trace: true, traceLimit: 25 })
    ) ||
    composeWithDevTools
  const store = createStore(
    rootReducer,
    composeEnhancers(applyMiddleware(thunk, sagaMiddleware)),
  )

  sagaMiddleware.run(rootSaga)

  return store
}

const store = configureStore()

export default store

export type IRootState = ReturnType<typeof store.getState>
export type IDispatch =
  ThunkDispatch<IRootState, null, Parameters<typeof store.dispatch>[0]>