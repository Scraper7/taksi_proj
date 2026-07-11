import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import Button from '../Button'
import './styles.scss'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { IRootState } from '../../state'
import Overlay from './Overlay'
import { orderSelectors } from '../../state/order'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isDriverCancelModalOpen(state),
  selectedOrderId: orderSelectors.selectedOrderId(state),
})

const mapDispatchToProps = {
  setDriverCancelModal: modalsActionCreators.setDriverCancelModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const CancelDriverOrderModal: React.FC<IProps> = ({
  isOpen,
  setDriverCancelModal,
  selectedOrderId,
}) => {
  const navigate = useNavigate()

  const onCancel = () => {
    console.log('onCancel', selectedOrderId)
    if (selectedOrderId) {
      API.cancelDrive(selectedOrderId)
      navigate('/driver-order')
    }
    setDriverCancelModal(false)
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setDriverCancelModal(false)}
    >
      <div
        className="modal your-order-modal"
      >
        <form>
          <fieldset>
            <legend>
              {t(TRANSLATION.CANCEL_ORDER)}
            </legend>
            <div className="status">
              <span>{t(TRANSLATION.CANCEL_ORDER_CONFIRMATION)}</span>
              <Button
                text={t(TRANSLATION.OK)}
                className="ok-btn"
                onClick={onCancel}
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(CancelDriverOrderModal)
