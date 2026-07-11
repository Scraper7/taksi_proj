import React, { useEffect, useRef } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../../Button'
import '../styles.scss'
import { IRootState } from '../../../state'
import { modalsActionCreators, modalsSelectors } from '../../../state/modals'
import Overlay from '../Overlay'
import { userSelectors } from '../../../state/user'
import Input from '../../Input'
import { defaultWACodeModal } from '../../../state/modals/reducer'
import * as yup from 'yup'
import { useForm, useWatch } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { t, TRANSLATION } from '../../../localization'
import { EStatuses } from '../../../types/types'
import { useVisibility } from '../../../tools/hooks'
import Alert from '../../Alert/Alert'
import { Intent } from '../../Alert'


interface IFormValues {
  code: number,
}

const mapStateToProps = (state: IRootState) => ({
  payload: modalsSelectors.isWACodeModalOpen(state),
  user: userSelectors.user(state),
  status: userSelectors.status(state),
})

const mapDispatchToProps = {
  setWACodeModal: modalsActionCreators.setWACodeModal,
  setCancelModal: modalsActionCreators.setCancelModal,

}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const WACodeModal: React.FC<IProps> = ({
  payload,
  setWACodeModal,
  status,
}) => {

  const [isVisible, toggleVisibility] = useVisibility(false)

  const schema = yup.object({
    code: yup.number().required(),
  })
  useEffect(() => {
    if(status === EStatuses.Fail && !isVisible) {
      toggleVisibility()
    } else if (status === EStatuses.Success) {
      reset({})
      if(isVisible) toggleVisibility()
      setWACodeModal({ ...defaultWACodeModal })
    }
  }, [status])


  const {
    register: formRegister,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'all',
    resolver: yupResolver(schema),
  })

  const onSubmit = (formData : IFormValues) => {
    let data = payload.data
    data.password = formData.code
    payload.login(data)

  }

  return (
    <Overlay
      isOpen={payload.isOpen}
      onClick={() => setWACodeModal({ ...defaultWACodeModal })}
    >
      <div
        className="modal whatsapp-modal"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <fieldset>
            <div className="code-block">
              <p>{t(TRANSLATION.CODE_INFO)}</p>
              <Input
                // inputProps={{
                //   ...formRegister('password'),
                //   type: isPasswordShows ? 'text' : 'password',
                //   placeholder: t(TRANSLATION.PASSWORD),
                // }}
                error={errors.code?.message ? t(TRANSLATION.CODE_ERROR) : ''}
                inputProps={{
                  ...formRegister('code'),
                }}

                label={t(TRANSLATION.CODE_WRITE)}
              />

              {
                isVisible &&
                  <div className="alert-container">
                    <Alert
                      intent={Intent.ERROR}
                      message={t(TRANSLATION.LOGIN_FAIL)}
                      onClose={toggleVisibility}
                    />
                  </div>
              }

              <Button
                type={'submit'}
                skipHandler={true}
                disabled={!!Object.values(errors).length}
                text={t(TRANSLATION.SIGN_IN)}
                className="whatsapp-modal-btn"
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(WACodeModal)

