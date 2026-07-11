export function isPassengerUiFsmEnabled(): boolean {
  const envFlag = String((process.env as any)?.REACT_APP_PASSENGER_UI_FSM || '').trim()
  const storageFlag = typeof window !== 'undefined' ?
    window.localStorage.getItem('feature.passenger_ui_fsm') :
    null

  if (storageFlag === '1')
    return true
  if (storageFlag === '0')
    return false

  return envFlag === '1'
}
