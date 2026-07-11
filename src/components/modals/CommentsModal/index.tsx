import React, { useId } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { connect, ConnectedProps } from 'react-redux'
import { EBookingCommentTypes } from '../../../types/types'
import SITE_CONSTANTS from '../../../siteConstants'
import { t, TRANSLATION } from '../../../localization'
import { IRootState } from '../../../state'
import {
  clientOrderActionCreators,
  clientOrderSelectors,
} from '../../../state/clientOrder'
import { modalsActionCreators, modalsSelectors } from '../../../state/modals'
import Checkbox, { ECheckboxStyles } from '../../Checkbox'
import Input, { EInputStyles } from '../../Input'
import Button, { EButtonStyles } from '../../Button'
import Modal, { EModalStyles } from '../Modal'
import { stripLeadingEmoji } from '../../../tools/utils'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  comments: clientOrderSelectors.comments(state),
  isOpen: modalsSelectors.isCommentsModalOpen(state),
})

const mapDispatchToProps = {
  setComments: clientOrderActionCreators.setComments,
  setCommentsModal: modalsActionCreators.setCommentsModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

interface IFormValues {
  ids: string[],
  custom: string,
  flightNumber: string,
  placard: string,
}

function CommentsModal({
  isOpen,
  comments,
  setComments,
  setCommentsModal,
}: IProps) {
  const {
    register,
    formState: { errors, isValid },
    handleSubmit,
    control,
  } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onChange',
    defaultValues: {
      ids: comments.ids,
      custom: comments.custom,
      flightNumber: comments.flightNumber,
      placard: comments.placard,
    },
  })

  const { ids, ...values } = useWatch<IFormValues>({ control })

  const onSubmit = () => {
    if (isValid)
      setComments({ ...values, ids: ids ?? [] })
    setCommentsModal(false)
  }

  const componentId = useId()

  return (
    <Modal
      overlayProps={{
        isOpen,
        onClick() {
          setCommentsModal(false)
        },
      }}
      style={EModalStyles.RedDesign}
      className="comments-modal"
    >
      <form
        className="comments-modal__form"
        onSubmit={handleSubmit(onSubmit)}
      >
        {Object.entries(SITE_CONSTANTS.BOOKING_COMMENTS)
          .filter(([, comment]) => !comment.internal)
          .map(([id]) =>
            <Checkbox
              key={id}
              {...register('ids')}
              id={componentId + id}
              checkboxStyle={ECheckboxStyles.RedDesign}
              value={id}
              label={stripLeadingEmoji(t(TRANSLATION.BOOKING_COMMENTS[id]))}
            />,
          )
        }
        {ids?.some(id =>
          SITE_CONSTANTS.BOOKING_COMMENTS[id].type ===
            EBookingCommentTypes.Plane,
        ) &&
          <div className="comments-modal__plane-inputs">
            <Input
              inputProps={{
                ...register('flightNumber', {
                  required: t(TRANSLATION.REQUIRED_FIELD),
                }),
                placeholder: `№ ${t(TRANSLATION.FLIGHT)}`,
              }}
              style={EInputStyles.RedDesign}
              error={errors.flightNumber?.message}
            />
            <Input
              inputProps={{
                ...register('placard', {
                  required: t(TRANSLATION.REQUIRED_FIELD),
                }),
                placeholder: t(TRANSLATION.TEXT_ON_THE_TABLE),
              }}
              style={EInputStyles.RedDesign}
              error={errors.placard?.message}
            />
          </div>
        }

        <Input
          inputProps={{
            ...register('custom'),
            placeholder: t(TRANSLATION.CUSTOM_COMMENT),
          }}
          style={EInputStyles.RedDesign}
        />
        <Button
          type="submit"
          buttonStyle={EButtonStyles.RedDesign}
          checkLogin={false}
          text={t(TRANSLATION.OK)}
        />
        {/* TODO voice recognition */}
        {/* TODO add icon */}
      </form>
    </Modal>
  )
}

export default connector(CommentsModal)
