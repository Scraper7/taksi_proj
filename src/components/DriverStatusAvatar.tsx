import React from 'react'
import cn from 'classnames'
import { TDriverStatus } from '../tools/driverStatus'
import './DriverStatusAvatar.scss'

interface IProps {
  status: TDriverStatus
  src?: string | null
  className?: string
  size?: 'header' | 'profile'
  title?: string
}

const DRIVER_STATUS_IMAGES = {
  defaultAvatar: '/assets/images/default/driver-avatar-default.png',
  noCar: '/assets/images/default/driver-status-no-car.png',
  car: '/assets/images/default/driver-status-car.png',
  offline: '/assets/images/default/driver-status-offline.png',
  online: '/assets/images/default/driver-status-online.png',
}

const statusBadgeImages: Record<TDriverStatus, string> = {
  active: DRIVER_STATUS_IMAGES.online,
  'approved-offline': DRIVER_STATUS_IMAGES.offline,
  'inactive-with-car': DRIVER_STATUS_IMAGES.car,
  'inactive-no-car': DRIVER_STATUS_IMAGES.noCar,
}

const DriverStatusAvatar: React.FC<IProps> = ({
  status,
  src,
  className,
  size = 'profile',
  title,
}) => {
  const photoSrc = String(src || '').trim()
  const [hasPhotoError, setHasPhotoError] = React.useState(false)

  React.useEffect(() => {
    setHasPhotoError(false)
  }, [photoSrc])

  const visiblePhotoSrc = photoSrc && !hasPhotoError ?
    photoSrc :
    DRIVER_STATUS_IMAGES.defaultAvatar

  return (
    <span
      className={cn(
        'driver-status-avatar',
        `driver-status-avatar--${size}`,
        `driver-status-avatar--${status}`,
        { 'driver-status-avatar--custom': !!photoSrc && !hasPhotoError },
        className,
      )}
      title={title}
    >
      <span className="driver-status-avatar__photo">
        <img
          src={visiblePhotoSrc}
          alt=""
          onError={() => setHasPhotoError(true)}
        />
      </span>
      <span className="driver-status-avatar__badge">
        <img src={statusBadgeImages[status]} alt="" />
      </span>
    </span>
  )
}

export default DriverStatusAvatar
