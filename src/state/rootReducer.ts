import { combineReducers } from 'redux'

import { moduleName as geolocationModule } from './geolocation/constants'
import geolocationReducer from './geolocation/reducer'
import { moduleName as userModule } from './user/constants'
import userReducer from './user/reducer'
import { moduleName as carsModule } from './cars/constants'
import carsReducer from './cars/reducer'
import { moduleName as ordersModule } from './orders/constants'
import ordersReducer from './orders/reducer'
import { moduleName as orderModule } from './order/constants'
import ordersDetailsReducer from './ordersDetails/reducer'
import { moduleName as ordersDetailsModule } from './ordersDetails/constants'
import orderReducer from './order/reducer'
import { moduleName as clientOrderModule } from './clientOrder/constants'
import clientOrderReducer from './clientOrder/reducer'
import { moduleName as configModule } from './config/constants'
import configReducer from './config/reducer'
import { moduleName as modalsModule } from './modals/constants'
import modalsReducer from './modals/reducer'
import { moduleName as areasModule } from './areas/constants'
import areasReducer from './areas/reducer'

const rootReducer = combineReducers({
  [geolocationModule]: geolocationReducer,
  [userModule]: userReducer,
  [carsModule]: carsReducer,
  [ordersModule]: ordersReducer,
  [ordersDetailsModule]: ordersDetailsReducer,
  [orderModule]: orderReducer,
  [clientOrderModule]: clientOrderReducer,
  [configModule]: configReducer,
  [modalsModule]: modalsReducer,
  [areasModule]: areasReducer,
})

export default rootReducer
