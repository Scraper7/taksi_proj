import React from 'react'
import cn from 'classnames'
import { BrowserDriverEmulator, BrowserClientOrderEmulator, BrowserEmulatorSnapshot } from './browserEmulator'
import emulationModeExactIcon from '../../assets/images/emulationModeExactIcon.png'
import { t } from '../../localization'
import { isBrowserEmulatorRunning } from '../../tools/emulatorMode'
import './styles.scss'

type EmulatorStatus = {
  ok?: boolean
  running?: boolean
  pid?: number | null
  startedAt?: string | null
  lastExit?: any
  logs?: string[]
  message?: string
}

type EmulatorPanelMode = 'drivers' | 'clients'

interface IProps {
  isOpen: boolean
  autoStart?: boolean
  mode?: EmulatorPanelMode
  onStatusChange?: (snapshot: BrowserEmulatorSnapshot) => void
  onClose: () => void
}

function DriverEmulatorPanel({ isOpen, autoStart, mode = 'drivers', onStatusChange, onClose }: IProps) {
  const [status, setStatus] = React.useState<BrowserEmulatorSnapshot>(() => ({
    running: isBrowserEmulatorRunning(mode),
    logs: [],
  }))
  const [loading, setLoading] = React.useState(false)
  const logsRef = React.useRef<HTMLPreElement | null>(null)
  const emulatorRef = React.useRef<BrowserDriverEmulator | BrowserClientOrderEmulator | null>(null)
  const emulatorModeRef = React.useRef<EmulatorPanelMode | null>(null)
  const startedByOpenRef = React.useRef(false)
  const swipeStartYRef = React.useRef<number | null>(null)
  const dragYRef = React.useRef(0)
  const [dragY, setDragYState] = React.useState(0)

  const setDragY = (value: number) => {
    dragYRef.current = value
    setDragYState(value)
  }

  const startSwipe = (clientY: number) => {
    swipeStartYRef.current = clientY
    setDragY(0)
  }

  const moveSwipe = (clientY: number) => {
    if (swipeStartYRef.current === null) return
    const nextY = Math.max(0, clientY - swipeStartYRef.current)
    setDragY(Math.min(nextY, 180))
  }

  const finishSwipe = () => {
    if (swipeStartYRef.current === null) return
    const shouldClose = dragYRef.current > 64
    swipeStartYRef.current = null
    setDragY(0)
    if (shouldClose) onClose()
  }

  const cancelSwipe = () => {
    swipeStartYRef.current = null
    setDragY(0)
  }

  const addLocalLog = React.useCallback((message: string) => {
    const time = new Date().toLocaleTimeString()
    setStatus(prev => ({
      ...prev,
      logs: [...(prev.logs || []), `[${time}] ${message}`].slice(-600),
    }))
  }, [])

  const getEmulator = React.useCallback(() => {
    if (!emulatorRef.current || emulatorModeRef.current !== mode) {
      emulatorRef.current?.stop()
      emulatorModeRef.current = mode
      emulatorRef.current = mode === 'clients' ?
        new BrowserClientOrderEmulator({ onUpdate: (snapshot) => setStatus(snapshot) }) :
        new BrowserDriverEmulator({ onUpdate: (snapshot) => setStatus(snapshot) })
    }
    return emulatorRef.current
  }, [mode])

  const runAction = async(action: 'start' | 'stop' | 'check') => {
    setLoading(true)
    try {
      const emulator = getEmulator()
      if (action === 'start') await emulator.start()
      if (action === 'stop') await emulator.stop()
      if (action === 'check') await emulator.check()
      setStatus(emulator.snapshot())
    } catch(error: any) {
      addLocalLog(error?.message || t('emulator_action_failed'))
    } finally {
      setLoading(false)
    }
  }

  React.useEffect(() => {
    const shouldRestore = isBrowserEmulatorRunning(mode)
    const emulator = shouldRestore ? getEmulator() : emulatorRef.current

    if (!emulator) {
      setStatus({ running: false, logs: [] })
      return undefined
    }

    setStatus(emulator.snapshot())

    if (shouldRestore && !emulator.snapshot().running)
      runAction('start')

    return undefined
  }, [mode])

  React.useEffect(() => {
    if (!isOpen) {
      startedByOpenRef.current = false
      cancelSwipe()
      return undefined
    }

    if (emulatorRef.current) setStatus(emulatorRef.current.snapshot())
    return undefined
  }, [isOpen])

  React.useEffect(() => {
    if (!isOpen || !autoStart || startedByOpenRef.current) return
    startedByOpenRef.current = true
    runAction('start')
  }, [isOpen, autoStart])

  React.useEffect(() => {
    onStatusChange?.(status)
  }, [status])

  React.useEffect(() => {
    if (!logsRef.current) return
    logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [status.logs])

  if (!isOpen) return null

  const running = Boolean(status.running)
  const isClientGenerator = mode === 'clients'
  const title = isClientGenerator ? t('emulator_clients') : t('emulator_drivers')
  const subtitle = isClientGenerator ? t('emulator_clients_subtitle') : t('emulator_drivers_subtitle')
  const logs = status.logs?.length ? status.logs.join('\n') : t('emulator_logs_empty')

  return (
    <div className="driver-emulator-panel" role="dialog" aria-modal="true">
      <div className="driver-emulator-panel__backdrop" onClick={onClose} />
      <div
        className="driver-emulator-panel__card"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          className="driver-emulator-panel__handle"
          role="button"
          tabIndex={0}
          aria-label={t('emulator_swipe_down_to_close')}
          onTouchStart={(event) => startSwipe(event.touches[0].clientY)}
          onTouchMove={(event) => moveSwipe(event.touches[0].clientY)}
          onTouchEnd={finishSwipe}
          onTouchCancel={cancelSwipe}
          onMouseDown={(event) => startSwipe(event.clientY)}
          onMouseMove={(event) => { if (swipeStartYRef.current !== null) moveSwipe(event.clientY) }}
          onMouseUp={finishSwipe}
          onMouseLeave={finishSwipe}
        />

        <div className="driver-emulator-panel__head">
          <div className="driver-emulator-panel__title-wrap">
            <img src={emulationModeExactIcon} alt="" className="driver-emulator-panel__title-icon" />
            <div className="driver-emulator-panel__title">{title}</div>
            <div className="driver-emulator-panel__subtitle">{subtitle}</div>
          </div>
          <div className={cn('driver-emulator-panel__status', { 'driver-emulator-panel__status--running': running })}>
            <span />
            {running ? t('emulator_status_running') : t('emulator_status_stopped')}
          </div>
        </div>

        <div className="driver-emulator-panel__actions">
          <button type="button" onClick={() => runAction('start')} disabled={loading || running}>{t('emulator_start')}</button>
          <button type="button" onClick={() => runAction('stop')} disabled={loading || !running} className="driver-emulator-panel__actions-gray">{t('emulator_stop')}</button>
          <button type="button" onClick={() => runAction('check')} disabled={loading} className="driver-emulator-panel__actions-muted">{t('emulator_check')}</button>
        </div>

        <div className="driver-emulator-panel__logs-title">{t('emulator_logs_title')}</div>
        <pre ref={logsRef} className="driver-emulator-panel__logs">{logs}</pre>
      </div>
    </div>
  )
}

export default DriverEmulatorPanel
