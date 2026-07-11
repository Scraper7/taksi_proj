import React, { useEffect, useMemo, useState } from 'react'
import cn from 'classnames'
import SITE_CONSTANTS from '../../siteConstants'
import { t, TRANSLATION } from '../../localization'
import Button from '../Button'
import Overlay from './Overlay'
import './styles.scss'


function getLocalizedCancelReasons(reasons: Array<{ id: string, label: string }>) {
  return reasons
    .map(item => ({
      ...item,
      label: getLocalizedReasonLabel(item.label),
    }))
    .filter(item => Boolean(item.label))
}

function getLocalizedReasonLabel(label: string) {
  const value = String(label ?? '').trim()
  if (!value)
    return ''

  return /^[a-z0-9_.-]+$/i.test(value) ? t(value) : value
}

interface IProps {
  isOpen: boolean
  isSubmitting?: boolean
  onClose: () => void
  onConfirm: (reason?: string) => void
}

const DriverChoiceCancelReasonModal: React.FC<IProps> = ({
  isOpen,
  isSubmitting = false,
  onClose,
  onConfirm,
}) => {
  const reasons = useMemo(() => getLocalizedCancelReasons(SITE_CONSTANTS.DRIVER_CHOICE_CANCEL_REASONS), [isOpen])

  const [reason, setReason] = useState(reasons[0]?.id ?? '0')

  useEffect(() => {
    if (isOpen)
      setReason(reasons[0]?.id ?? '0')
  }, [isOpen, reasons])

  const handleClose = () => {
    if (!isSubmitting)
      onClose()
  }

  const handleConfirm = () => {
    if (isSubmitting)
      return

    onConfirm(reasons.find(item => item.id === reason)?.label)
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={handleClose}
    >
      <div className="modal cancel-order-modal message-window">
        {reasons.map(item => {
          const active = reason === item.id
          return (
            <div
              key={item.id}
              onClick={() => !isSubmitting && setReason(item.id)}
              className={cn('reason-item', { 'reason-item--active': active })}
              style={{ color: active ? SITE_CONSTANTS.PALETTE.primary.dark : undefined }}
            >
              {item.label}
            </div>
          )
        })}
        <div className="modal__buttons-block">
          <Button
            text={isSubmitting ? t(TRANSLATION.LOADING) : t(TRANSLATION.CANCEL_DRIVER_CHOICE)}
            onClick={handleConfirm}
            disabled={isSubmitting}
          />
          <Button
            text={t(TRANSLATION.CANCEL)}
            onClick={handleClose}
            disabled={isSubmitting}
          />
        </div>
      </div>
    </Overlay>
  )
}

export default DriverChoiceCancelReasonModal
