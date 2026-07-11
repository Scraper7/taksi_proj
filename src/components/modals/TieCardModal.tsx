import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import './styles.scss'
import { t, TRANSLATION } from '../../localization'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import images from '../../constants/images'
import { IRootState } from '../../state'
import Overlay from './Overlay'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isMapModalOpen(state),
})

const mapDispatchToProps = {
  setTieCardModal: modalsActionCreators.setTieCardModal,
  setCardDetailsModal: modalsActionCreators.setCardDetailsModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const TieCardModal: React.FC<IProps> = ({
  isOpen,
  setTieCardModal,
  setCardDetailsModal,
}) => {
  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setTieCardModal(false)}
    >
      <div
        className="modal tie-card-modal"
      >
        <form>
          <fieldset>
            <legend>{t(TRANSLATION.TIE_CARD_HEADER)}</legend>
            <div className="info-block">
              <img src={images.cardIcon} alt={t(TRANSLATION.CARD)}/>
              <article>
                {t(TRANSLATION.TIE_CARD_ARTICLE)}
              </article>
              <p>({t(TRANSLATION.TIE_CARD_DESCRIPTION)})</p>

              <Button
                text={t(TRANSLATION.ADD_CARD)}
                className="tie-card-modal_add-btn"
                onClick={() => setCardDetailsModal(true)}
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(TieCardModal)

