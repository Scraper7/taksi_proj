import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import './styles.scss'
import { defaultDeleteFilesModal } from '../../state/modals/reducer'
import Overlay from './Overlay'
import SITE_CONSTANTS from '../../siteConstants'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isDeleteFilesModalOpen(state),
})

const mapDispatchToProps = {
  setDeleteFilesModal: modalsActionCreators.setDeleteFilesModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  handleDeleteFile: () => any
  handleDeleteFiles: () => any
}

const DeleteFileModal: React.FC<IProps> = ({
  isOpen,
  handleDeleteFile,
  handleDeleteFiles,
  setDeleteFilesModal,
}) => {
  if (!handleDeleteFile || !handleDeleteFiles) return null

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setDeleteFilesModal({ ...defaultDeleteFilesModal })}
    >
      <div className="modal delete-file-modal">
        <p className="delete-file-modal__text">Удалить фото?</p>
        <div className="delete-file-modal__buttons">
          <Button
            text={t(TRANSLATION.ONE)}
            onClick={() => {handleDeleteFile(); setDeleteFilesModal({ ...defaultDeleteFilesModal })}}
            skipHandler
          />
          <Button
            text={t(TRANSLATION.ALL)}
            onClick={() => {handleDeleteFiles(); setDeleteFilesModal({ ...defaultDeleteFilesModal })}}
            className="delete-file-modal__all-button"
            style={{
              color: SITE_CONSTANTS.PALETTE.primary.dark,
              border: `1px solid ${SITE_CONSTANTS.PALETTE.primary.dark}`,
            }}
            skipHandler
          />
        </div>
      </div>
    </Overlay>
  )
}

export default connector(DeleteFileModal)