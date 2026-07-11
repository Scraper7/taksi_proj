import React, { useMemo } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useLocation } from 'react-router-dom'
import { EStatuses } from '../../../types/types'
import { IRootState } from '../../../state'
import {
  userSelectors,
  userActionCreators,
} from '../../../state/user'
import { LOGIN_TABS } from '../../../state/user/constants'
import { modalsActionCreators, modalsSelectors } from '../../../state/modals'
import { t, TRANSLATION } from '../../../localization'
import Tabs from '../../tabs/Tabs'
import VersionInfo from '../../version-info'
import LoadFrame from '../../LoadFrame'
import Overlay from '../Overlay'
import LoginForm from './Login'
import RegisterForm from './Register'
import LogoutForm from './LogoutForm'
import RegisterJSON from './RegisterJSON'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isLoginModalOpen(state),
  user: userSelectors.user(state),
  status: userSelectors.status(state),
  tab: userSelectors.tab(state),
})

const mapDispatchToProps = {
  setLoginModal: modalsActionCreators.setLoginModal,
  setTab: userActionCreators.setTab,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function LoginModal({
  isOpen,
  user,
  status,
  tab,
  setTab,
  setLoginModal,
}: IProps) {
  const location = useLocation()
  const _TABS = user ?
    [] :
    LOGIN_TABS.map((item, index) => ({
      ...item,
      label: t(item.label),
    }))

  const RegisterComponent = location.pathname.includes('/driver-order') ?
    RegisterJSON :
    RegisterForm
  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setLoginModal(false)}
      wrapperClassName="login-modal-overlay"
    >
      <div className="modal login-modal">
        <button
          type="button"
          className="login-modal__close"
          aria-label={t(TRANSLATION.CLOSE)}
          onClick={() => setLoginModal(false)}
        >
          ×
        </button>
        {status === EStatuses.Loading && <LoadFrame />}

        <fieldset>
          <legend>
            {user ?
              t(TRANSLATION.PROFILE) :
              tab === 'sign-in' ?
                t(TRANSLATION.SIGN_IN_HEADER) :
                t(TRANSLATION.SIGNUP)
            }
          </legend>

          <div className="login">
            {useMemo(() => _TABS.length > 0 &&
              <Tabs
                tabs={_TABS}
                activeTabID={tab}
                onChange={id => setTab(id as typeof tab)}
              />
            , [_TABS, tab, setTab])}

            {useMemo(() => user ?
              <LogoutForm /> :
              tab === 'sign-in' ?
                <LoginForm
                  isOpen={isOpen}
                /> :
                <RegisterComponent
                  isOpen={isOpen}
                />
            , [user, tab, isOpen])}
          </div>
        </fieldset>
        <VersionInfo/>
      </div>
    </Overlay>
  )
}

export default connector(LoginModal)