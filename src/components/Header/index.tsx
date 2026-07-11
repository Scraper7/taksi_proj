import React, { useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { matchPath, useLocation, useNavigate } from 'react-router-dom'
import cn from 'classnames'
import moment from 'moment'
import { EBookingDriverState, EUserRoles, ILanguage, EStatuses } from '../../types/types'
import config from '../../config'
import images from '../../constants/images'
import SITE_CONSTANTS from '../../siteConstants'
import * as API from '../../API'
import { useInterval } from '../../tools/hooks'
import { setCookie } from '../../utils/cookies'
import { IRootState } from '../../state'
import { configSelectors, configActionCreators } from '../../state/config'
import { modalsActionCreators } from '../../state/modals'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { userSelectors, userActionCreators } from '../../state/user'
import { carsSelectors } from '../../state/cars'
import {
  getDriverStatus,
  isDriverCarAdded,
  isDriverCarApproved,
  isDriverOnline,
  isDriverProfileApproved,
} from '../../tools/driverStatus'
import { getPassengerConfirmedChoice, isChoiceOrder } from '../../tools/driverOffer'
import { getApiErrorMessage } from '../../tools/apiMessages'
import {
  BROWSER_EMULATOR_STATE_EVENT,
  getBrowserEmulatorState,
  getPreferredBrowserEmulatorMode,
} from '../../tools/emulatorMode'
import { t, TRANSLATION } from '../../localization'
import { copyAndClearFlowDebugLog, copyAndClearInterfaceLog, copyAndClearRawLog, summarizeOrder, writeFrontendLog } from '../../tools/frontendLog'
import { Burger } from '../Burger/Burger'
import DriverStatusAvatar from '../DriverStatusAvatar'
import DriverEmulatorPanel from '../DriverEmulatorPanel'
import emulationModeExactIcon from '../../assets/images/emulationModeExactIcon.png'
import versionInfo from '../../version.json'
import './styles.scss'

const FLAGS_IMAGES: Record<string, string> = {
  ru: images.flagRu,
  gb: images.flagGb,
  fr: images.flagFr,
  ma: images.flagMar,
}

interface IMenuItem {
  label: string
  action?: (index: number) => any
  href?: string,
  type?: string
}

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
  language: configSelectors.language(state),
  activeOrders: ordersSelectors.activeOrders(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  primaryCar: carsSelectors.userPrimaryCar(state),
})

const mapDispatchToProps = {
  setLanguage: configActionCreators.setLanguage,
  setLoginModal: modalsActionCreators.setLoginModal,
  setProfileModal: modalsActionCreators.setProfileModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  updateUser: userActionCreators.initUser,
  logout: userActionCreators.logout,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  className?: string
}


function getInitialEmulatorMode(fallback: 'drivers' | 'clients' = 'drivers') {
  return getPreferredBrowserEmulatorMode(fallback) as 'drivers' | 'clients'
}

function getInitialEmulatorStatus(fallback: 'drivers' | 'clients' = 'drivers') {
  const mode = getInitialEmulatorMode(fallback)
  const state = getBrowserEmulatorState()
  return state[mode]?.running ? { mode, running: true } : null
}

function Header({
  user,
  language,
  activeOrders,
  selectedOrder,
  primaryCar,
  setLanguage,
  setLoginModal,
  setProfileModal,
  setMessageModal,
  updateUser,
  logout,
  className,
}: IProps) {
  const [languagesOpened, setLanguagesOpened] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [menuOpened, setMenuOpened] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [emulatorPanelOpened, setEmulatorPanelOpened] = useState(false)
  const defaultEmulatorMode = user?.u_role === EUserRoles.Driver ? 'clients' : 'drivers'
  const [emulatorPanelMode, setEmulatorPanelMode] = useState<'drivers' | 'clients'>(() => getInitialEmulatorMode(defaultEmulatorMode))
  const [emulatorStatus, setEmulatorStatus] = useState<{ mode: 'drivers' | 'clients', running: boolean } | null>(() => getInitialEmulatorStatus(defaultEmulatorMode))
  const [emulatorInfoOpened, setEmulatorInfoOpened] = useState(false)
  const driverStatusRefreshedRef = React.useRef(false)
  if (!menuOpened && languagesOpened)
    setLanguagesOpened(false)

  const location = useLocation()
  const navigate = useNavigate()

  React.useEffect(() => {
    if (driverStatusRefreshedRef.current || user?.u_role !== EUserRoles.Driver || !user?.u_id)
      return

    driverStatusRefreshedRef.current = true
    updateUser()
  }, [user?.u_id, user?.u_role])

  React.useEffect(() => {
    if (!statusMenuOpen || user?.u_role !== EUserRoles.Driver)
      return

    updateUser()
  }, [statusMenuOpen])

  React.useEffect(() => {
    const syncEmulatorStatus = () => {
      const mode = getInitialEmulatorMode(defaultEmulatorMode)
      const state = getBrowserEmulatorState()
      const running = Boolean(state[mode]?.running)
      if (running) setEmulatorPanelMode(mode)
      setEmulatorStatus(running ? { mode, running } : null)
    }

    syncEmulatorStatus()
    window.addEventListener(BROWSER_EMULATOR_STATE_EVENT, syncEmulatorStatus)
    window.addEventListener('storage', syncEmulatorStatus)
    return () => {
      window.removeEventListener(BROWSER_EMULATOR_STATE_EVENT, syncEmulatorStatus)
      window.removeEventListener('storage', syncEmulatorStatus)
    }
  }, [defaultEmulatorMode])

  const clientOrder = activeOrders?.find(item => item.b_id === selectedOrder)
  const driver = React.useMemo(() => {
    const drivers = clientOrder?.drivers ?? []

    if (!clientOrder)
      return undefined

    if (isChoiceOrder(clientOrder)) {
      const confirmedChoiceId = getPassengerConfirmedChoice(clientOrder.b_id)
      return confirmedChoiceId ? drivers.find(item =>
        String(item.u_id) === String(confirmedChoiceId) &&
        [
          EBookingDriverState.Performer,
          EBookingDriverState.Arrived,
          EBookingDriverState.Started,
          EBookingDriverState.Finished,
        ].includes(item.c_state),
      ) : undefined
    }

    return drivers.find(item => [
      EBookingDriverState.Performer,
      EBookingDriverState.Arrived,
      EBookingDriverState.Started,
      EBookingDriverState.Finished,
    ].includes(item.c_state))
  }, [
    clientOrder?.b_id,
    clientOrder?.drivers?.map(item => `${item.u_id}:${item.c_state}`).join('|'),
  ])

  const startDriverEmulator = (mode: 'drivers' | 'clients') => {
    setEmulatorPanelMode(mode)
    setEmulatorStatus(prev => ({ mode, running: Boolean(prev?.mode === mode && prev.running) }))
    setMenuOpened(false)
    setEmulatorPanelOpened(true)
  }

  const menuItems: IMenuItem[] = []
  menuItems.push({
    label: t('profile'),
    action: () => {
      setProfileModal({ isOpen: true })
      setMenuOpened(false)
    },
  })

  menuItems.push({
    label: t('language'),
    type: 'language',
    action: () => {
      setLanguagesOpened(prev => !prev)
    },
  })


  const isAuthorizedDriver = user?.u_role === EUserRoles.Driver

  // Показываем клиентский тестовый режим ещё до авторизации: заказ можно начать
  // оформлять гостем, поэтому пользователь должен заранее выбрать тестовый/реальный сценарий.
  if (!user || user?.u_role === EUserRoles.Client) {
    menuItems.push({
      label: t('emulator_drivers'),
      action: () => startDriverEmulator('drivers'),
    })
  }

  if (isAuthorizedDriver) {
    menuItems.push({
      label: t('emulator_clients'),
      action: () => startDriverEmulator('clients'),
    })
  }

  useInterval(() => {
    if (clientOrder) {
      if (driver) return setSeconds(0)
      const _seconds = moment().diff(clientOrder?.b_start_datetime, 'seconds')
      if (_seconds > (clientOrder?.b_max_waiting || SITE_CONSTANTS.WAITING_INTERVAL)) return setSeconds(0)
      setSeconds(_seconds)
    } else if (seconds !== 0) setSeconds(0)
  }, 1000)

  const onReturn = () => {
    navigate(-1)
  }

  const toggleMenuOpened = () => {
    setMenuOpened(prev => !prev)
  }

  const closeSideMenu = React.useCallback(() => {
    setMenuOpened(false)
    setLanguagesOpened(false)
  }, [])

  React.useEffect(() => {
    if (!menuOpened) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        closeSideMenu()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpened, closeSideMenu])


  const detailedOrderID = matchPath({ path: '/driver-order/:id' }, location.pathname)?.params.id

  let avatar = images.noUserAvatar
  let avatarSize = '24px'
  if (user) {
    avatar = user.u_photo || images.noImgAvatar
    avatarSize = user.u_photo ? 'cover' : '24px'
  }

  const isDriver = user?.u_role === EUserRoles.Driver
  const hasCar = isDriverCarAdded(primaryCar)
  const isApprovedDriver = isDriverProfileApproved(user)
  const isApprovedCar = isDriverCarApproved(primaryCar)
  const isOnlineDriver = isDriverOnline(user)
  const driverStatus = getDriverStatus({
    user,
    car: primaryCar,
    activeOrders,
  })
  const driverVisualStatus = !hasCar ?
    'inactive-no-car' :
    (!isApprovedDriver || !isApprovedCar) ?
      'inactive-with-car' :
      isOnlineDriver ? 'active' : 'approved-offline'

  const driverStatusText = !hasCar ?
    `${t('driver_line_no_car')}. ${t('driver_status_need_car')}` :
    !isApprovedDriver ?
      `${t('driver_profile_pending_label')}. ${t('driver_status_hint_profile_check')}` :
      !isApprovedCar ?
        `${t(TRANSLATION.DRIVER_STATUS_INACTIVE_WITH_CAR)}. ${t(TRANSLATION.DRIVER_STATUS_INACTIVE_WITH_CAR_DESCRIPTION)}` :
        driverVisualStatus === 'active' ?
        `${t(TRANSLATION.DRIVER_STATUS_ACTIVE)}. ${t(TRANSLATION.DRIVER_STATUS_ACTIVE_DESCRIPTION)}` :
        `${t('driver_line_offline')}. ${t('driver_status_hint_header_change')}`

  const driverStatusMenuHint = !hasCar ?
    t('driver_status_need_car') :
    (!isApprovedDriver || !isApprovedCar) ?
      t('driver_status_hint_profile_check') :
      t('driver_status_hint_header_change')

  const canChangeAvailability = isDriver &&
    hasCar &&
    isApprovedDriver &&
    isApprovedCar

  const changeDriverAvailability = async(active: boolean) => {
    setStatusMenuOpen(false)

    if (statusChanging || isDriverOnline(user) === active) return

    if (!canChangeAvailability) {
      setMessageModal({
        isOpen: true,
        status: EStatuses.Warning,
        message: !hasCar ?
          getApiErrorMessage({ message: 'car not found' }, { context: 'car-profile' }) :
          getApiErrorMessage({ message: 'wrong user check state' }, { context: 'driver-order' }),
      })
      return
    }

    setStatusChanging(true)
    try {
      const response = await API.editUser({ u_active: active as any })
      if (response?.status === 'error' || (response?.code && String(response.code) !== '200')) {
        throw new Error(response?.message || t('driver_status_change_failed'))
      }
      updateUser()
    } catch (error: any) {
      const message = String(error?.message || '')
      if (message.includes('user or modified data not found')) return

      setMessageModal({
        isOpen: true,
        status: EStatuses.Fail,
        message: getApiErrorMessage({ message: error?.message || 'driver status change failed' }),
      })
    } finally {
      setStatusChanging(false)
    }
  }


  const getDebugLogSnapshot = () => ({
    route: location.pathname,
    selectedOrder,
    clientOrder: summarizeOrder(clientOrder),
    activeOrders: (activeOrders || []).map(summarizeOrder),
    user: user ? {
      u_id: user.u_id,
      u_role: user.u_role,
      u_active: user.u_active,
      u_city: user.u_city,
    } : null,
    driverStatus,
    primaryCar: primaryCar ? {
      c_id: (primaryCar as any).c_id,
      c_state: (primaryCar as any).c_state,
      cm_name: (primaryCar as any).cm_name,
    } : null,
  })

  const showLogExportResult = (
    result: { downloaded?: boolean, copied?: boolean },
    downloadSuccessMessageKey: string,
    copySuccessMessageKey: string,
    failMessageKey: string,
  ) => {
    const success = Boolean(result.downloaded || result.copied)
    setMenuOpened(false)
    setMessageModal({
      isOpen: true,
      status: success ? EStatuses.Success : EStatuses.Warning,
      message: success ?
        t(result.downloaded ? downloadSuccessMessageKey : copySuccessMessageKey) :
        t(failMessageKey),
    })
  }

  const handleCopyInterfaceLog = async() => {
    writeFrontendLog('menu.interfaceLog.copy.clicked', {
      pathname: location.pathname,
      selectedOrder,
      activeOrdersCount: activeOrders?.length || 0,
      role: user?.u_role ?? null,
    })

    const result = await copyAndClearInterfaceLog(getDebugLogSnapshot())
    showLogExportResult(result, 'frontend_interface_log_downloaded', 'frontend_interface_log_copied', 'frontend_interface_log_copy_failed')
  }

  const handleCopyFlowLog = async() => {
    writeFrontendLog('menu.flowLog.copy.clicked', {
      pathname: location.pathname,
      selectedOrder,
      activeOrdersCount: activeOrders?.length || 0,
      role: user?.u_role ?? null,
    })

    const result = await copyAndClearFlowDebugLog(getDebugLogSnapshot())
    showLogExportResult(result, 'frontend_flow_log_downloaded', 'frontend_flow_log_copied', 'frontend_flow_log_copy_failed')
  }

  const handleCopyRawLog = async() => {
    writeFrontendLog('menu.rawLog.copy.clicked', {
      pathname: location.pathname,
      selectedOrder,
      activeOrdersCount: activeOrders?.length || 0,
      role: user?.u_role ?? null,
    })

    const result = await copyAndClearRawLog(getDebugLogSnapshot())
    showLogExportResult(result, 'frontend_raw_log_downloaded', 'frontend_raw_log_copied', 'frontend_raw_log_copy_failed')
  }

  const isDriverLogArea = user?.u_role === EUserRoles.Driver || location.pathname.includes('/driver-order')
  const isPassengerLogArea = !isDriverLogArea

  if (isPassengerLogArea) {
    menuItems.push({
      label: t('frontend_interface_log_menu'),
      action: () => handleCopyInterfaceLog(),
    })
  }

  menuItems.push({
    label: t('frontend_flow_log_menu'),
    action: () => handleCopyFlowLog(),
  })

  if (isDriverLogArea) {
    menuItems.push({
      label: t('frontend_raw_log_menu'),
      action: () => handleCopyRawLog(),
    })
  }

  const languages = SITE_CONSTANTS.LANGUAGES
    .filter(x => x.iso !== (config.SavedConfig !== 'children' ? ' ' : 'ru'))

  const handleLanguageChange = (lang: ILanguage) => {
    setCookie('user_lang', lang.iso)
    setLanguage(lang)
    setLanguagesOpened(false)
  }

  const isEmulationModeVisible = emulatorPanelOpened || Boolean(emulatorStatus?.running)
  const emulationModeTitle = emulatorStatus?.mode === 'clients' ? t('emulator_clients_mode') : t('emulator_drivers_mode')
  const buildDate = React.useMemo(() => {
    const value = new Date((versionInfo as any).buildTimestamp)
    return Number.isNaN(value.getTime()) ? String((versionInfo as any).buildTimestamp || '') : value.toLocaleString()
  }, [])
  const driverAccountName = [user?.u_name, user?.u_family].filter(Boolean).join(' ').trim()
  const driverAccountLogin = user?.u_phone || user?.u_email || (user?.u_id ? `ID ${user.u_id}` : '')

  return (
    <header className={cn('header', className)}>
      <div className="burger-wrapper">
        <div className="column">
          {
            detailedOrderID ?
              <img src={images.returnIcon} className="menu-icon" alt={t(TRANSLATION.RETURN)} onClick={onReturn} /> :
              (
                <div className="menu__wrapper">
                  {menuOpened && (
                    <button
                      type="button"
                      className="menu__backdrop"
                      aria-label={t(TRANSLATION.CLOSE)}
                      onClick={closeSideMenu}
                    />
                  )}
                  <Burger onClick={toggleMenuOpened} isOpen={menuOpened} />
                  <ul
                    className={cn('menu__list', {
                      'menu__list--active': menuOpened,
                      'menu__list--expanded': languagesOpened,
                    })}
                  >
                    {menuItems.map((item, index) => (
                      <li key={index} className="menu__item">
                        <button
                          onClick={() =>
                            item.href ?
                              navigate(item.href) :
                              item.action?.(index)
                          }
                          className="menu__button"
                        >
                          {item.label}
                        </button>
                        {item.type === 'language' && languagesOpened && (
                          <ul className="menu__languages">
                            {languages.map(item =>
                              <li
                                key={item.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleLanguageChange(item)
                                }}
                                className="menu__language-flag"
                              >
                                {item.logo in FLAGS_IMAGES &&
                                  <img
                                    src={FLAGS_IMAGES[item.logo]}
                                    alt=""
                                    className="menu__language-flag-icon"
                                  />
                                }
                                <span className="menu__language-flag-text">
                                  {item.native}
                                </span>
                              </li>,
                            )}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )
          }
        </div>
      </div>
      <div className='header-logo'><img src={images.logo} alt="" /></div>
      <div className='header-avatar-wrapper'>
        {isEmulationModeVisible && (
          <button
            type="button"
            className="header-emulation-indicator"
            aria-label={t('emulator_mode_info_aria')}
            title={emulationModeTitle}
            onClick={() => setEmulatorInfoOpened(true)}
          >
            <img src={emulationModeExactIcon} alt="" className="header-emulation-indicator__icon" />
          </button>
        )}
        <span className='header-user-name'>{user?.u_city ? `${((window as any).data.cities[user?.u_city][language.iso ?? (window as any).data.langs[(window as any).default_lang].iso])},` : ''}</span>
        <span className='header-user-lng'>{language.iso.toUpperCase()}</span>
        <div
          className={cn('header-avatar-status', { 'header-avatar-status--driver': isDriver })}
        >
          {isDriver ? (
            <>
              <button
                type="button"
                className={`header-driver-status header-driver-status--${driverStatus}`}
                aria-label={driverStatusText}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setStatusMenuOpen(prev => !prev)
                }}
                disabled={statusChanging}
              >
                <DriverStatusAvatar
                  status={driverVisualStatus}
                  src={user?.u_photo}
                  size="header"
                  className="header-driver-status__image"
                  title={driverStatusText}
                />
              </button>

              {statusMenuOpen && (
                <div className="header-driver-status-menu header-driver-status-menu--profile">
                  <div className="header-driver-status-menu__profile">
                    <div className="header-driver-status-menu__profile-title">
                      Текущая учётка
                    </div>
                    <div className="header-driver-status-menu__profile-main">
                      {driverAccountName || driverAccountLogin || 'Водитель'}
                    </div>
                    {driverAccountName && driverAccountLogin && (
                      <div className="header-driver-status-menu__profile-muted">
                        {driverAccountLogin}
                      </div>
                    )}
                    <div className="header-driver-status-menu__profile-row">
                      <span>Версия</span>
                      <b>{(versionInfo as any).version}</b>
                    </div>
                    <div className="header-driver-status-menu__profile-row">
                      <span>Дата</span>
                      <b>{buildDate}</b>
                    </div>
                  </div>

                  <div className="header-driver-status-menu__actions">
                    <button
                      type="button"
                      className={cn('header-driver-status-menu__item', {
                        'header-driver-status-menu__item--active': isApprovedDriver && driverStatus === 'active',
                      })}
                      onClick={() => changeDriverAvailability(true)}
                      disabled={statusChanging || !canChangeAvailability}
                    >
                      {t('driver_line_online')}
                    </button>
                    <button
                      type="button"
                      className={cn('header-driver-status-menu__item', {
                        'header-driver-status-menu__item--active': isApprovedDriver && driverStatus === 'approved-offline',
                      })}
                      onClick={() => changeDriverAvailability(false)}
                      disabled={statusChanging || !canChangeAvailability}
                    >
                      {t('driver_line_offline')}
                    </button>
                    <button
                      type="button"
                      className="header-driver-status-menu__item header-driver-status-menu__item--logout"
                      onClick={() => {
                        setStatusMenuOpen(false)
                        logout()
                      }}
                    >
                      {t(TRANSLATION.LOGOUT)}
                    </button>
                  </div>

                  {!canChangeAvailability && (
                    <span className="header-driver-status-menu__hint">
                      {driverStatusMenuHint}
                    </span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div
              className="avatar"
              onClick={e => setLoginModal(true)}
              style={{
                backgroundSize: avatarSize,
                backgroundImage: `url(${avatar})`,
              }}
            />
          )}
        </div>

      </div>
      <DriverEmulatorPanel
        isOpen={emulatorPanelOpened}
        mode={emulatorPanelMode}
        onStatusChange={(snapshot) => setEmulatorStatus({ mode: emulatorPanelMode, running: Boolean(snapshot.running) })}
        onClose={() => setEmulatorPanelOpened(false)}
      />
      {emulatorInfoOpened && (
        <div className="emulation-info" role="dialog" aria-modal="true">
          <div className="emulation-info__backdrop" onClick={() => setEmulatorInfoOpened(false)} />
          <div className="emulation-info__card">
            <div className="emulation-info__icon">
              <img src={emulationModeExactIcon} alt="" className="emulation-info__icon-image" />
            </div>
            <div className="emulation-info__title">{t('emulator_mode_title')}</div>
            <div className="emulation-info__text">
              <p>{t('emulator_info_intro')}</p>
              <p>{t('emulator_info_virtual')}</p>
              <p>{t('emulator_info_allows')}</p>
              <p>{t('emulator_info_ui')}</p>
              <p>{t('emulator_info_test_orders')}</p>
              <p>{t('emulator_info_modes')}</p>
              <p>{t('emulator_info_notifications')}</p>
            </div>
            <button type="button" className="emulation-info__button" onClick={() => setEmulatorInfoOpened(false)}>
              {t('ok')}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

export default connector(Header)
