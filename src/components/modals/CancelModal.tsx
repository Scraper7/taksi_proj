import React, { useEffect, useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { EStatuses } from '../../types/types'
import SITE_CONSTANTS from '../../siteConstants'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { clientOrderActionCreators, clientOrderSelectors } from '../../state/clientOrder'
import { ordersActionCreators } from '../../state/orders'
import Button from '../Button'
import Overlay from './Overlay'
import './styles.scss'


function getLocalizedCancelReasons(reasons: Array<{ id: string, label: string }>) {
  return (reasons.length ? reasons : SITE_CONSTANTS.CANCEL_ORDER_REASONS)
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

const mapStateToProps = (state: IRootState) => ({
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  isOpen: modalsSelectors.isCancelModalOpen(state),
})

const mapDispatchToProps = {
  setCancelModal: modalsActionCreators.setCancelModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setVoteModal: modalsActionCreators.setVoteModal,
  setDriverModal: modalsActionCreators.setDriverModal,
  setOnTheWayModal: modalsActionCreators.setOnTheWayModal,
  setSelectedOrder: clientOrderActionCreators.setSelectedOrder,
  cancelOrder: ordersActionCreators.cancel,
  refreshActiveOrders: ordersActionCreators.refreshActiveOrders,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const CancelOrderModal: React.FC<IProps> = ({
  selectedOrder,
  isOpen,
  setCancelModal,
  setMessageModal,
  setVoteModal,
  setDriverModal,
  setOnTheWayModal,
  setSelectedOrder,
  cancelOrder,
  refreshActiveOrders,
}) => {
  const REASONS = useMemo(() => getLocalizedCancelReasons(SITE_CONSTANTS.CANCEL_ORDER_REASONS), [isOpen])

  const [reason, setReason] = useState(REASONS[0]?.id ?? '0')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen)
      setReason(REASONS[0]?.id ?? '0')
  }, [isOpen, REASONS])

  function closeModal() {
    setCancelModal(false)
    setVoteModal(false)
    setDriverModal(false)
    setOnTheWayModal(false)
  }

  function onDenial() {
    if (!selectedOrder || isSubmitting) {
      closeModal()
      return
    }

    setIsSubmitting(true)
    cancelOrder(
      selectedOrder,
      REASONS.find(item => item.id === reason)?.label,
    )
      .then(() => {
        refreshActiveOrders()
        setSelectedOrder(null)
        closeModal()
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: t(TRANSLATION.ERROR),
        })
      })
      .finally(() => setIsSubmitting(false))
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setCancelModal(false)}
    >
      <div className="modal cancel-order-modal message-window">
        {
          REASONS.map(item => {
            const active = reason === item.id ? ' active' : ''
            return (
              <div
                key={item.id}
                onClick={e => setReason(item.id)}
                className={cn('reason-item', { 'reason-item--active': active } )}
                style={{ color: active ? SITE_CONSTANTS.PALETTE.primary.dark : undefined }}
              >
                {item.label}
              </div>
            )
          })
        }
        <div className="modal__buttons-block">
          <Button
            text={isSubmitting ? t(TRANSLATION.LOADING) : t(TRANSLATION.CANCEL_ORDER)}
            onClick={onDenial}
            disabled={isSubmitting}
          />
          <Button
            text={t(TRANSLATION.CANCEL)}
            onClick={() => setCancelModal(false)}
          />
        </div>
      </div>
    </Overlay>
  )
}

export default connector(CancelOrderModal)
