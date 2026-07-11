import {
  IBookingCoordinates, IBookingAddresses, IAddressPoint,
  IOrder, IDriver, ICar, IUser, ITrip,
} from '../types/types'
import { parseMomentDate } from './reliableTime'

const dateFormat = 'YYYY-MM-DD HH:mm:ssZ'

export const convertDriver = (driver: any): IDriver => {
  return convertTypes<any, IDriver>(
    driver,
    {
      toIntKeys: [
        'c_state',
      ],
      toFloatKeys: [
        'c_latitude',
        'c_longitude',
      ],
      toDateKeys: [
        'l_datetime',
        'c_becomed_candidate',
        'c_arrived',
        'c_started',
        'c_completed',
        'c_canceled',
        'c_payment_datetime',
      ],
      toBooleanKeys: [
        'c_arrive_state',
      ],
    },
  )
}

export const reverseConvertDriver = (driver: IDriver): any => {
  return convertTypes<any, IDriver>(
    driver,
    {
      toStringKeys: [
        'c_latitude',
        'c_longitude',
        'c_state',
      ],
      toStringDateKeys: [
        'l_datetime',
      ],
      toIntBooleanKeys: [
        'c_arrive_state',
      ],
    },
  )
}

export const convertOrder = (order: any): IOrder => {
  return convertTypes<any, IOrder>(
    order,
    {
      toFloatKeys: [
        'b_start_latitude',
        'b_start_longitude',
        'b_destination_latitude',
        'b_destination_longitude',
        'b_passengers_count',
        'b_luggage_count',
        'b_price_estimate',
      ],
      toIntKeys: [
        'b_cars_count',
        'b_distance_estimate',
        'b_car_class',
        'b_state',
      ],
      toDateKeys: [
        'b_start_datetime',
        'b_created',
        'b_approved',
      ],
      toBooleanKeys: [
        'b_confirm_state',
        'b_voting',
      ],
      customKeys: {
        drivers: () => order.drivers?.map((item: any) => convertDriver(item)),
      },
    },
  )
}

export const convertTrip = (trip: any): ITrip => {
  return convertTypes<any, ITrip>(
    trip,
    {
      toFloatKeys: [
        't_start_latitude',
        't_start_longitude',
        't_destination_latitude',
        't_destination_longitude',
      ],
      toDateKeys: [
        't_start_datetime',
        't_complete_datetime',
        't_start_real_datetime',
        't_complete_real_datetime',
        't_edit_datetime',
        't_create_datetime',
      ],
      toBooleanKeys: [
        't_looking_for_clients',
        't_canceled',
      ],
      customKeys: {
        orders: () => trip.orders?.map((item: any) => convertOrder(item)),
      },
    },
  )
}

export const reverseConvertOrder = (order: IOrder): any => {
  return convertTypes<IOrder, any>(
    order,
    {
      toStringKeys: [
        'b_start_latitude',
        'b_start_longitude',
        'b_destination_latitude',
        'b_destination_longitude',
        'b_passengers_count',
        'b_luggage_count',
        'b_price_estimate',
        'b_cars_count',
        'b_distance_estimate',
      ],
      toStringDateKeys: [
        'b_start_datetime',
        'b_created',
        'b_approved',
      ],
      toIntBooleanKeys: [
        'b_confirm_state',
        'b_voting',
      ],
      customKeys: {
        drivers: () => order.drivers?.map(item => reverseConvertDriver(item)),
        b_services: () => order.b_services?.map(item => item.toString()),
      },
    },
  )
}

export const reverseConvertTrip = (order: ITrip): any => {
  return convertTypes<ITrip, any>(
    order,
    {
      toStringKeys: [
        't_start_latitude',
        't_start_longitude',
        't_destination_latitude',
        't_destination_longitude',
      ],
      toStringDateKeys: [
        't_start_datetime',
        't_complete_datetime',
      ],
    },
  )
}

export const convertCar = (car: any): ICar => {
  return convertTypes<any, ICar>(
    car,
    {
      toIntKeys: [
        'seats',
      ],
    },
  )
}

export const convertUser = (user: any): IUser => {
  return convertTypes<any, IUser>(
    user,
    {
      customKeys: {
        u_ban: () => convertTypes<any, IUser['u_ban']>(user.u_ban, {
          toIntKeys: ['auth', 'order', 'blog_topic', 'blog_post'],
        }),
        u_details: () => convertTypes<any, IUser['u_details']>(user.u_details, {
          toJSONKeys: ['passport_photo', 'driver_license_photo', 'license_photo'],
        }),
      },
      toIntKeys: ['u_tips', 'u_role', 'u_check_state'],
      toFloatKeys: ['out_latitude', 'out_longitude', 'out_s_latitude', 'out_s_longitude'],
      toBooleanKeys: ['u_active', 'u_phone_checked', 'out_drive'],
      toDateKeys: ['u_birthday', 'out_est_datetime'],
    },
  )
}

export const reverseConvertUser = (user: any): IUser => {
  return convertTypes<IUser, any>(
    user,
    {
      toDetailsObjectKeys: ['u_details'],
    },
  )
}

export function bookingCoordinatesStartToPoint(
  coordinates: IBookingCoordinates & IBookingAddresses,
): IAddressPoint {
  return {
    address: coordinates.b_start_address,
    latitude: coordinates.b_start_latitude,
    longitude: coordinates.b_start_longitude,
  }
}
export function bookingCoordinatesDestinationToPoint(
  coordinates: IBookingCoordinates & IBookingAddresses,
): IAddressPoint {
  return {
    address: coordinates.b_destination_address,
    latitude: coordinates.b_destination_latitude,
    longitude: coordinates.b_destination_longitude,
  }
}

interface TConvertKeys {
  toFloatKeys?: string[],
  toIntKeys?: string[],
  toStringKeys?: string[],
  toStringObjectKeys?: string[]
  toDetailsObjectKeys?: string[]
  toDateKeys?: string[],
  toStringDateKeys?: string[],
  toBooleanKeys?: string[],
  toIntBooleanKeys?: string[],
  toJSONKeys?: string[],
  customKeys?: {[key: string]: Function}
}
const convertTypes = <T extends object, R>(
  object: T,
  {
    toFloatKeys = [],
    toIntKeys = [],
    toStringKeys = [],
    toStringObjectKeys = [],
    toDetailsObjectKeys = [],
    toDateKeys = [],
    toStringDateKeys = [],
    toBooleanKeys = [],
    toIntBooleanKeys = [],
    toJSONKeys = [],
    customKeys = {},
  }: TConvertKeys,
) => {
  const convertedObject: any = {}
  if (!object || typeof object !== 'object')
    return convertedObject as R

  const entries: [string, any][] = []
  for (const key in object) {
    if (Object.prototype.hasOwnProperty.call(object, key))
      entries.push([key, (object as any)[key]])
  }

  for (let [key, value] of entries) {
    if (value === null) continue

    if (toFloatKeys.includes(key)) convertedObject[key] = parseFloat(value)
    else if (toIntKeys.includes(key)) convertedObject[key] = parseInt(value)
    else if (toStringKeys.includes(key)) convertedObject[key] = String(value)
    else if (toStringObjectKeys.includes(key)) convertedObject[key] = JSON.stringify(value)
    else if (toDetailsObjectKeys.includes(key)) {
      const detailsArr = []
      for (let [itemKey, itemValue] of Object.entries(value)) {
        detailsArr.push(['=', [itemKey], itemValue ?? ''])
      }
      convertedObject[key] = detailsArr
    }
    else if (toDateKeys.includes(key)) convertedObject[key] = parseMomentDate(value)
    else if (toStringDateKeys.includes(key)) convertedObject[key] = value.format(dateFormat)
    else if (toBooleanKeys.includes(key)) convertedObject[key] = Boolean(parseInt(value))
    else if (toIntBooleanKeys.includes(key)) convertedObject[key] = Number(value)
    else if (toJSONKeys.includes(key)) {
      if (typeof value !== 'string') {
        convertedObject[key] = value
      } else {
        try {
          convertedObject[key] = JSON.parse(value)
        } catch (e) {
          convertedObject[key] = value
        }
      }
    }
    else if (Object.prototype.hasOwnProperty.call(customKeys, key)) convertedObject[key] = customKeys[key]()
    else convertedObject[key] = value
  }

  return convertedObject as R
}
