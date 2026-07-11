import React, { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom'
import {
  configSelectors,
} from './state/config'
import { connect, ConnectedProps } from 'react-redux'
import images from './constants/images'
import { t, TRANSLATION } from './localization'
import { IRootState } from './state'
import { EStatuses, EUserRoles, IUser } from './types/types'
import { userSelectors } from './state/user'
import Sandbox from './pages/Sandbox'
import PageSection from './components/PageSection'

const PassengerOrder = lazy(() => import('./pages/Passenger')) as any
const Order = lazy(() => import('./pages/Order')) as any
const DriverOrder = lazy(() => import('./pages/Driver')) as any

const mapStateToProps = (state: IRootState) => ({
  status: configSelectors.status(state),
  user: userSelectors.user(state),
  language: configSelectors.language(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {

}

const AppRoutesWrapper: React.FC<IProps> = ({ status, user, language }) => {
  const languageIso = language?.iso

  return status === EStatuses.Success ?
    <Suspense fallback={null}><AppRoutes user={user} languageIso={languageIso}/></Suspense> :
    <UnavailableBase/>
}

const UnavailableBase = () => {
  return <PageSection>
    <div className="loading-frame">
      <img src={images.error} alt={t(TRANSLATION.ERROR)}/>
      <div className="loading-frame__title">{t(TRANSLATION.DATABASE_IS_UNAVAILABLE)}</div>
    </div>
  </PageSection>
}

const HomePageRedirect = () => {
  const navigate = useNavigate()
  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/passenger-order')
    }, 11000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <a
        href='/passenger-order'
        style={{
          background: 'linear-gradient(90deg, rgb(15, 44, 118) 0%, rgb(30, 88, 235) 100%)',
          height: 60,
          lineHeight: '60px',
          width: 300,
          color: '#fff',
          textAlign: 'center',
          fontSize: '20px',
          borderRadius: 10,
        }}
      >
        Go to map +1
      </a>
    </div>
  )
}

const AppRoutes = ({ user, languageIso }: {user: IUser | null, languageIso?: string}) => (
  <Routes>
    <Route
      path="/*"
      element={<>
        <Navigate
          replace
          to={
            [
              EUserRoles.Client,
              EUserRoles.Agent,
            ].includes(user?.u_role as any) ?
              '/passenger-order' :
              user?.u_role === EUserRoles.Driver ?
                '/driver-order' :
                '/'
          }
        />
        <PassengerOrder languageIso={languageIso} />
      </>}
    />
    <Route path="/passenger-order" element={<PassengerOrder languageIso={languageIso} />} />
    <Route path="/driver-order/:id" element={<Order languageIso={languageIso} />} />
    <Route path="/driver-order" element={<DriverOrder languageIso={languageIso} />} />
    <Route path="/driver-order-test" element={<DriverOrder languageIso={languageIso} />} />
    <Route path="/sandbox" element={<Sandbox />} />
  </Routes>
)

export default connector(AppRoutesWrapper)
