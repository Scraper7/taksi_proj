import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import { t, TRANSLATION } from '../../localization'
import './styles.scss'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { useInterval } from '../../tools/hooks'
import images from '../../constants/images'
import Overlay from './Overlay'
import { defaultAlarmModal } from '../../state/modals/reducer'

const mapStateToProps = (state: IRootState) => {
  return {
    seconds: modalsSelectors.alarmModalSeconds(state),
    isOpen: modalsSelectors.isAlarmModalOpen(state),
  }
}

const mapDispatchToProps = {
  setAlarmModal: modalsActionCreators.setAlarmModal,
  closeAllModals: modalsActionCreators.closeAllModals,
  setRatingModal: modalsActionCreators.setRatingModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const AlarmModal: React.FC<IProps> = ({
  isOpen,
  seconds,
  closeAllModals,
  setAlarmModal,
  setRatingModal,
}) => {
  useInterval(() => {
    if ( seconds <= 0 ) {
      if (isOpen) setAlarmModal({ ...defaultAlarmModal })
      return
    }
    setAlarmModal({ isOpen: true, seconds: seconds - 1 })
  }, 1000)

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setAlarmModal({ ...defaultAlarmModal })}
    >
      <div
        className="modal vote-modal"
      >
        <form>
          <fieldset>
            <legend>
              {t(TRANSLATION.ALARM)}
            </legend>
            <div className="timer-block">
              <img src={images.timer} className="timer-block_timer-img" alt="timer"/>
              <article>
                {t(TRANSLATION.ESTIMATE)} <span>{seconds}</span> {t(TRANSLATION.SECONDS)}
              </article>

              <Button
                text={t(TRANSLATION.CANCEL_ALARM)}
                className="vote-modal-btn"
                onClick={() => {
                  setAlarmModal({ ...defaultAlarmModal })
                }}
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(AlarmModal)
