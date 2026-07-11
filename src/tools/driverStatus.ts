import { EUserCheckStates, EUserRoles, ICar, IOrder, IUser } from '../types/types'

export type TDriverStatus =
  'active' |
  'approved-offline' |
  'inactive-with-car' |
  'inactive-no-car'

const getCarCheckValue = (car?: ICar | null) => (
  (car as any)?.check_state ??
  (car as any)?.c_check_state ??
  (car as any)?.c_check ??
  (car as any)?.check ??
  (car as any)?.state ??
  (car as any)?.status ??
  (car as any)?.details?.check_state ??
  (car as any)?.details?.c_check_state ??
  (car as any)?.details?.status
)

const getUserCheckValue = (user?: IUser | null) => (
  (user as any)?.u_check_state ??
  (user as any)?.check_state ??
  (user as any)?.user_check_state ??
  (user as any)?.u_check ??
  (user as any)?.check ??
  (user as any)?.status ??
  (user as any)?.u_status ??
  (user as any)?.profile_status ??
  (user as any)?.details?.u_check_state ??
  (user as any)?.details?.check_state ??
  (user as any)?.details?.status
)

const isApprovedCheckValue = (value: any) => {
  if (value === undefined || value === null || value === '') return false

  if (typeof value === 'boolean') return value

  const numericValue = Number(value)
  if (!Number.isNaN(numericValue)) return numericValue === EUserCheckStates.Active

  const stringValue = String(value).trim().toLowerCase()
  return [
    'active',
    'approved',
    'accepted',
    'verified',
    'success',
    'confirmed',
    'complete',
    'completed',
  ].includes(stringValue)
}

export const isDriverProfileApproved = (user?: IUser | null) =>
  isApprovedCheckValue(getUserCheckValue(user))

export const isDriverCarAdded = (car?: ICar | null) => {
  return Boolean(
    String(car?.registration_plate ?? '').trim() ||
    String((car as any)?.c_registration_plate ?? '').trim() ||
    String((car as any)?.number ?? '').trim() ||
    String((car as any)?.plate ?? '').trim() ||
    (car as any)?.c_id,
  )
}

export const isDriverCarApproved = (car?: ICar | null) => {
  if (!isDriverCarAdded(car)) return false

  const value = getCarCheckValue(car)
  if (value === undefined || value === null || value === '') return true

  return isApprovedCheckValue(value)
}

export const isDriverOnline = (user?: IUser | null) => {
  const value = user?.u_active
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value

  const numericValue = Number(value)
  if (!Number.isNaN(numericValue)) return numericValue > 0

  const stringValue = String(value).trim().toLowerCase()
  if (['0', 'false', 'offline', 'inactive', 'no', 'off', 'blocked'].includes(stringValue)) return false
  if (['1', 'true', 'online', 'active', 'yes', 'on', 'available'].includes(stringValue)) return true

  return false
}

export const getDriverStatus = ({
  user,
  car,
}: {
  user?: IUser | null,
  car?: ICar | null,
  activeOrders?: IOrder[] | null,
}): TDriverStatus => {
  if (user?.u_role !== EUserRoles.Driver) return 'inactive-no-car'

  const hasCar = isDriverCarAdded(car)
  if (!hasCar) return 'inactive-no-car'

  const isProfileApproved = isDriverProfileApproved(user)
  const isCarApproved = isDriverCarApproved(car)
  const isOnLine = isDriverOnline(user)

  if (!isProfileApproved || !isCarApproved) return 'inactive-with-car'
  if (isOnLine) return 'active'
  return 'approved-offline'
}
