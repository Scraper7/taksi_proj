import './preBootstrap'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { HelmetProvider } from 'react-helmet-async'
import store from './state'
import App from './App'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment'

import * as serviceWorker from './serviceWorker'

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <Provider store={store}>
        <LocalizationProvider dateAdapter={AdapterMoment}>
          <HelmetProvider>
            <App/>
          </HelmetProvider>
        </LocalizationProvider>
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
)

serviceWorker.unregister()
