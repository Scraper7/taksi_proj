import { EBookingDriverState, ICar, IDriver } from '../types/types'

export const DRIVER_DOOR_NUMBER_PATTERN = /^\d{3,4}$/

export function normalizeDriverDoorNumber(value: unknown): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(0, 4)
}

function getFirstValidDoorNumber(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeDriverDoorNumber(value)
    if (DRIVER_DOOR_NUMBER_PATTERN.test(normalized))
      return normalized
  }

  return ''
}

export function getDriverDoorNumber(driver?: Partial<IDriver> | null, car?: Partial<ICar> | null): string {
  const details = car?.details || {}

  return getFirstValidDoorNumber(
    (driver as any)?.door_number,
    (driver as any)?.doorNumber,
    (driver as any)?.profile_number,
    (driver as any)?.profileNumber,
    (driver as any)?.c_options?.door_number,
    (driver as any)?.c_options?.doorNumber,
    details.door_number,
    details.doorNumber,
    details.profile_number,
    details.profileNumber,
    car?.c_id,
    driver?.c_id,
    car?.registration_plate,
  )
}

export function hasDriverEnteredBoardingCode(driver?: Partial<IDriver> | null): boolean {
  return !!driver && [
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(driver.c_state as EBookingDriverState)
}

export function shouldShowDriverDoorNumber(driver?: Partial<IDriver> | null): boolean {
  return !!driver && !hasDriverEnteredBoardingCode(driver)
}
