import React from 'react'
import { useForm } from 'react-hook-form'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import Input, { EInputTypes } from '../Input'
import { years, months } from '../../constants/cardDetails'
import { t, TRANSLATION } from '../../localization'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import images from '../../constants/images'
import './styles.scss'
import { IRootState } from '../../state'
import Overlay from './Overlay'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isCardDetailsModalOpen(state),
})

const mapDispatchToProps = {
  setCardDetailsModal: modalsActionCreators.setCardDetailsModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IFormValues {
  cardNumber: string,
  name: string,
  month: string,
  year: string,
  cvv: string
}

interface IProps extends ConnectedProps<typeof connector> {
}

const CardDetailsModal: React.FC<IProps> = ({
  isOpen,
  setCardDetailsModal,
}) => {
  const { register, formState: { errors, isValid }, handleSubmit } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onChange',
  })

  const onSubmit = (data: any, e?: React.BaseSyntheticEvent) => {
    (e as React.BaseSyntheticEvent).preventDefault()

    if (isValid) {
      console.log('Fields is valid')

    } else {
      console.error('Fields is not valid')
    }

    setCardDetailsModal(false)
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setCardDetailsModal(false)}
    >
      <div
        className="modal card-details-modal"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <fieldset>
            <legend>{t(TRANSLATION.ATTACH_CARD)}</legend>
            <div className="details">
              <Input
                inputProps={{
                  ...register('cardNumber', {
                    required: t(TRANSLATION.REQUIRED_FIELD),
                    pattern: {
                      value: /^\d{16}$/,
                      message: t(TRANSLATION.CARD_NUMBER_PATTERN_ERROR),
                    },
                  }),
                  placeholder: 'ХХХХ-ХХХХ-ХХХХ-ХХХХ',
                }}
                label={t(TRANSLATION.CARD_NUMBER)}
                buttons={[{ src: images.photoCamera }]}
                error={errors.cardNumber?.message}
              />
              <Input
                inputProps={{
                  ...register('name', { required: t(TRANSLATION.REQUIRED_FIELD) }),
                  placeholder: t(TRANSLATION.NAME_AND_SURNAME_PLACEHOLDER),
                }}
                label={`${t(TRANSLATION.NAME_AND_SURNAME)}:`}
                error={errors.name?.message}
              />
              <div className="expiration-date">
                <div className="exp">
                  <span>{t(TRANSLATION.EXPIRES)}</span>
                  <Input
                    inputProps={{
                      ...register('month', { required: t(TRANSLATION.REQUIRED_FIELD) }),
                    }}
                    inputType={EInputTypes.Select}
                    options={months.map(item => ({ label: t(item.name), value: item.id.toString() }))}
                  />
                  <Input
                    inputProps={{
                      ...register('year', { required: t(TRANSLATION.REQUIRED_FIELD) }),
                    }}
                    inputType={EInputTypes.Select}
                    options={years.map(item => ({ label: item.name, value: item.id.toString() }))}
                  />
                </div>
                <div className="cvc">
                  <span>{t(TRANSLATION.CVC_CODE)}:</span>
                  <Input
                    inputProps={{
                      ...register('cvv', {
                        required: t(TRANSLATION.REQUIRED_FIELD),
                        pattern: {
                          value: /^\d{3}$/,
                          message: t(TRANSLATION.CVC_PATTERN_ERROR),
                        },
                      }),
                      placeholder: 'ХХХ',
                    }}
                    error={errors.cvv?.message}
                    buttons={[{ src: images.helpIcon }]}
                  />
                </div>
              </div>
              <Button
                text={t(TRANSLATION.SAVE)}
                className="details_save-btn"
                type='submit'
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(CardDetailsModal)

