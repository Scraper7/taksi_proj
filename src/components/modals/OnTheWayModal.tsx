import React, { useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import { t, TRANSLATION } from '../../localization'
import moment from 'moment'
import { useInterval } from '../../tools/hooks'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { IRootState } from '../../state'
import './styles.scss'
import Overlay from './Overlay'
import * as API from '../../API'
import { EBookingDriverState, EColorTypes, EStatuses } from '../../types/types'
import { getOrderDriveStartedAt } from '../../tools/order'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isOnTheWayModalOpen(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  activeOrders: ordersSelectors.activeOrders(state),
})

const mapDispatchToProps = {
  setOnTheWayModal: modalsActionCreators.setOnTheWayModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setAlarmModal: modalsActionCreators.setAlarmModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const OnTheWayModal: React.FC<IProps> = ({
  isOpen,
  selectedOrder,
  activeOrders,
  setOnTheWayModal,
  setRatingModal,
  setMessageModal,
  setAlarmModal,
}) => {
  const [seconds, setSeconds] = useState(0)
  const order = activeOrders?.find(item => item.b_id === selectedOrder)
  const driveStartedAt = getOrderDriveStartedAt(order)

  const formattedDuration = formatTripDuration(seconds)

  useInterval(() => {
    setSeconds(
      driveStartedAt ?
        moment().diff(driveStartedAt, 'seconds') :
        0,
    )
  }, 1000)

  const handleCloseDriveClick = () => {
    selectedOrder && API.setOrderState(selectedOrder, EBookingDriverState.Finished)
      .then(() => {
        setOnTheWayModal(false)
        setRatingModal({ isOpen: true, orderID: selectedOrder })
      })
      .catch(error => {
        console.error(error)
        setMessageModal({ isOpen: true, message: t(TRANSLATION.ERROR), status: EStatuses.Fail })
      })
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setOnTheWayModal(false)}
    >
      <div
        className="modal ontheway-modal"
        style={{ display: isOpen ? 'flex' : 'none' }}
      >
        <form>
          <fieldset>
            <legend>{t(TRANSLATION.DRIVING_HEADER)}</legend>
            <h3>{t(TRANSLATION.DRIVING_TIME)}</h3>
            <div className="ontheway-modal__time">{formattedDuration}</div>
            <Button
              text={t(TRANSLATION.CLOSE_DRIVE)}
              onClick={handleCloseDriveClick}
              className="ontheway-modal__close-button"
            />
            <Button
              text={t(TRANSLATION.ALARM)}
              colorType={EColorTypes.Accent}
              onClick={() => setAlarmModal({ isOpen: true })}
            />
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(OnTheWayModal)

function formatTripDuration(totalSeconds: number) {
  const safeSeconds = Math.max(Math.floor(totalSeconds || 0), 0)
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
