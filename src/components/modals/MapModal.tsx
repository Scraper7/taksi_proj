import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import './styles.scss'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import Overlay from './Overlay'
import { defaultMapModal } from '../../state/modals/reducer'
import Map from '../Map'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isMapModalOpen(state),
})

const mapDispatchToProps = {
  setMapModal: modalsActionCreators.setMapModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const MapModal: React.FC<IProps> = ({
  isOpen,
  setMapModal,
}) => {
  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setMapModal({ ...defaultMapModal })}
    >
      <Map isOpen={isOpen} isModal />
    </Overlay>
  )
}

export default connector(MapModal)
