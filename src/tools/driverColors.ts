import { IDriver } from '../types/types'

export const DRIVER_ROUTE_COLORS = [
  '#0066FF',
  '#00CC00',
  '#AA00FF',
  '#FF8800',
  '#00B8D4',
  '#FFD600',
  '#FF00AA',
  '#00E5FF',
  '#FF66CC',
  '#001F99',
  '#B8E600',
]

type TDriverColorIdentity = Pick<IDriver, 'u_id'> & Partial<Pick<IDriver, 'c_id'>>

function getDriverKey(driver: TDriverColorIdentity | null | undefined) {
  return String(driver?.u_id ?? driver?.c_id ?? '')
}

function getDriverColorByIndex(index: number) {
  return DRIVER_ROUTE_COLORS[Math.abs(index) % DRIVER_ROUTE_COLORS.length]
}

export function getDriverColor(
  driver: TDriverColorIdentity | null | undefined,
  drivers: TDriverColorIdentity[],
) {
  const driverKey = getDriverKey(driver)
  const orderedKeys = Array.from(new Set(
    drivers
      .map(getDriverKey)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  ))
  const index = orderedKeys.indexOf(driverKey)

  return getDriverColorByIndex(index >= 0 ? index : orderedKeys.length)
}
