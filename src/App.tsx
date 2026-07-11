import React, { useEffect } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { Helmet } from 'react-helmet-async'
import SITE_CONSTANTS from './siteConstants'
import * as API from './API'
import { IRootState } from './state'
import { configSelectors } from './state/config'
import { userActionCreators } from './state/user'
import Theme from './components/Theme'
import { ModalHost } from './components/modals'
import AppRoutes from './Routes'
import './App.scss'

const mapStateToProps = (state: IRootState) => ({
  configStatus: configSelectors.status(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  initUser: userActionCreators.initUser,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const App: React.FC<IProps> = ({
  configStatus,
  language,
  initUser,
}) => {
  if ((window as any).ReactNativeWebView) {
    (window as any).ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'SYSTEM', message: 'START' }),
    )
  }

  useEffect(() => {
    initUser()

    API.activateChatServer()
    const interval = setInterval(() => API.activateChatServer(), 30000)
    return () => {
      clearInterval(interval)
    }
  }, [])

  const getMetaTags = () => {
    let _domain = `${window.location.protocol}//${window.location.host}/`

    return (
      <Helmet>
        {SITE_CONSTANTS.OG_IMAGE && (
          <meta property="og:image" content={_domain + SITE_CONSTANTS.OG_IMAGE} />
        )}
        {SITE_CONSTANTS.TW_IMAGE && (
          <meta
            property="twitter:image"
            content={_domain + SITE_CONSTANTS.TW_IMAGE}
          />
        )}
        <style>{`
          .colored {
            color: ${SITE_CONSTANTS.PALETTE.primary.dark}
          }

          section details summary {
            color: ${SITE_CONSTANTS.PALETTE.primary.dark};
          }
          section details summary::after {
            border-top: 10px solid ${SITE_CONSTANTS.PALETTE.primary.main};
          }

          .modal .active {
            color: ${SITE_CONSTANTS.PALETTE.primary.dark}
          }
          .modal form fieldset h3, .modal form fieldset h4 {
            color: ${SITE_CONSTANTS.PALETTE.primary.dark}
          }

          .phone-link {
            border-bottom: 1px solid ${SITE_CONSTANTS.PALETTE.primary.light};
          }
          .phone-link:hover {
            border-bottom-color: ${SITE_CONSTANTS.PALETTE.primary.dark};
          }
        `}</style>
      </Helmet>
    )
  }

  return (
    <React.Fragment>
      <Theme>
        {getMetaTags()}
        <React.Fragment key={`routes-${language?.id || ''}-${language?.iso || ''}`}>
          <AppRoutes />
          <ModalHost languageIso={language?.iso} />
        </React.Fragment>
      </Theme>
    </React.Fragment>
  )
}

export default connector(App)