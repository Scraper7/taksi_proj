import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { clientOrderActionCreators, clientOrderSelectors } from '../../state/clientOrder'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import './styles.scss'
import Overlay from './Overlay'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isSeatsModalOpen(state),
  seats: clientOrderSelectors.seats(state),
})

const mapDispatchToProps = {
  setSeats: clientOrderActionCreators.setSeats,
  setSeatsModal: modalsActionCreators.setSeatsModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const SeatsModal: React.FC<IProps> = ({
  isOpen,
  seats,
  setSeats,
  setSeatsModal,
}) => {
  function onSeatsClick(value: typeof seats) {
    setSeats(value)
    setSeatsModal(false)
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setSeatsModal(false)}
    >
      <div
        id="seatsModal"
        className="modal seats-modal"
      >
        {
          [1, 2, 3].map((item) =>
            <React.Fragment key={item}>
              <div className={`item ${seats === item ? 'active' : ''}`} onClick={() => onSeatsClick(item)}>
                <span>{item}</span>
              </div>
            </React.Fragment>,
          )
        }
      </div>
    </Overlay>
  )
}

export default connector(SeatsModal)
