import { TDriverStatus } from '../tools/driverStatus'
import active from '../assets/driver-status/driver-status-active.png'
import blocked from '../assets/driver-status/driver-status-blocked.png'
import car from '../assets/driver-status/driver-status-car.png'
import offline from '../assets/driver-status/driver-status-offline.png'

const driverStatusImages: Record<TDriverStatus, string> = {
  active,
  'approved-offline': offline,
  'inactive-with-car': car,
  'inactive-no-car': blocked,
}

export default driverStatusImages
