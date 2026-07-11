import React, { useEffect } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import Button from '../../Button'
import * as API from '../../../API'
import '../styles.scss'
import { IRootState } from '../../../state'
import { modalsActionCreators, modalsSelectors } from '../../../state/modals'
import { userActionCreators } from '../../../state/user'
import Overlay from '../Overlay'
import { userSelectors } from '../../../state/user'
import Input from '../../Input'
import { defaultRefCodeModal } from '../../../state/modals/reducer'
import * as yup from 'yup'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import { t, TRANSLATION } from '../../../localization'
import { EStatuses } from '../../../types/types'
import { useVisibility } from '../../../tools/hooks'
import Alert from '../../Alert/Alert'
import { Intent } from '../../Alert'
import { ERegistrationType } from '../../../state/user/constants'
interface IFormValues {
  code: string,
}

const mapStateToProps = (state: IRootState) => ({
  payload: modalsSelectors.isRefCodeModalOpen(state),
  user: userSelectors.user(state),
  whatsappSignUpData: userSelectors.whatsappSignUpData(state),
  status: userSelectors.status(state),
})

const mapDispatchToProps = {
  googleLogin: userActionCreators.googleLogin,
  login: userActionCreators.login,
  whatsappSignUp: userActionCreators.whatsappSignUp,
  setRefCodeModal: modalsActionCreators.setRefCodeModal,
  setCancelModal: modalsActionCreators.setCancelModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const RefCodeModal: React.FC<IProps> = ({
  payload,
  setRefCodeModal,
  googleLogin,
  status,
  whatsappSignUp,
  whatsappSignUpData,
}) => {
  const [isVisible, toggleVisibility] = useVisibility(false)

  const navigate = useNavigate()

  const schema = yup.object({
    code: yup.string(),
  })
  useEffect(() => {
    if(status === EStatuses.Fail && !isVisible) {
      toggleVisibility()
    } else if (status === EStatuses.Success) {
      reset({})
      if(isVisible) toggleVisibility()
      setRefCodeModal({ ...defaultRefCodeModal })
    }
  }, [status])


  const {
    register: formRegister,
    handleSubmit,
    formState: { errors, isDirty },
    setError,
    reset,
  } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'all',
    resolver: yupResolver(schema),
  })

  const onSubmit = (formData : IFormValues) => {
    let data = payload.data
    if (!formData.code) {
      if(whatsappSignUpData?.u_phone) {
        whatsappSignUp({
          type: ERegistrationType.Whatsapp,
          login: whatsappSignUpData.u_phone,
          navigate,
        })
        return
      } else {
        googleLogin({ data, auth_hash: null, navigate })
        return
      }
    }

    API.checkRefCode(formData.code).then(isFreeCode => {
      if (isFreeCode) {
        setError('code', { type: 'custom', message: t(TRANSLATION.REF_CODE_NOT_FOUND) })
        return
      }
      data.ref_code = formData.code

      if(whatsappSignUpData?.u_phone) {
        whatsappSignUp({
          type: ERegistrationType.Whatsapp,
          login: whatsappSignUpData.u_phone,
          ref_code: formData.code,
          navigate,
        })
        return
      } else {
        googleLogin({ data, auth_hash: null, navigate })
        return
      }
    })
  }

  return (
    <Overlay
      isOpen={payload.isOpen}
    >
      <div
        className="modal refcode-modal"
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <fieldset>
            <div className="code-block">
              <p>{t(TRANSLATION.REF_CODE_INFO)}</p>
              <Input
                error={errors.code?.message}
                inputProps={{
                  ...formRegister('code'),
                }}
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
                text={t(TRANSLATION.SIGNUP)}
                className="refcode-modal-btn"
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(RefCodeModal)
