import React, { useMemo, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { EStatuses, EUserRoles } from '../../../types/types'
import { normalizePhoneNumber } from '../../../tools/phoneUtils'
import { IRootState } from '../../../state'
import { userSelectors, userActionCreators } from '../../../state/user'
import { modalsActionCreators } from '../../../state/modals'
import { t, TRANSLATION } from '../../../localization'
import JSONForm from '../../JSONForm'
import { TForm, TFormElement } from '../../JSONForm/types'
import ErrorFrame from '../../ErrorFrame'

const mapStateToProps = (state: IRootState) => {
  return {
    user: userSelectors.user(state),
    status: userSelectors.status(state),
    tab: userSelectors.tab(state),
    message: userSelectors.message(state),
    response: userSelectors.registerResponse(state),
  }
}

const mapDispatchToProps = {
  register: userActionCreators.register,
  setStatus: userActionCreators.setStatus,
  setMessage: userActionCreators.setMessage,
  setMessageModal: modalsActionCreators.setMessageModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  isOpen: boolean;
}

const hasPasswordField = (fields: TForm) => fields.some(field =>
  field.name === 'password' || field.name === 'data.password',
)

const hasPasswordConfirmField = (fields: TForm) => fields.some(field =>
  field.name === 'password_confirm',
)

const withPasswordField = (fields: TForm) => {
  const fieldsToAdd: TFormElement[] = []

  if (!hasPasswordField(fields)) {
    fieldsToAdd.push({
      name: 'password',
      label: TRANSLATION.PASSWORD,
      type: 'password',
      validation: {
        required: true,
        min: 8,
      },
    })
  }

  if (!hasPasswordConfirmField(fields)) {
    fieldsToAdd.push({
      name: 'password_confirm',
      label: TRANSLATION.PASSWORD_CONFIRM,
      type: 'password',
      validation: {
        required: true,
        min: 8,
      },
    })
  }

  if (!fieldsToAdd.length) return fields

  const isAgreementField = (field: TFormElement) => {
    if (field.type !== 'checkbox') return false

    const searchValue = [
      field.name,
      field.label,
      field.hint,
      field.props?.label,
      field.props?.hint,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    const isServiceCheckbox = [
      'agree',
      'agreement',
      'privacy',
      'policy',
      'offer',
      'rules',
      'consent',
      'informational',
      'message',
      'messages',
      'notification',
      'notifications',
      'public_offer',
      'hint_privacy_policy',
      'hint_submit',
    ].some(keyword => searchValue.includes(keyword))

    // В JSON-форме регистрации чекбоксы соглашений могут называться по-разному в разных конфигах.
    // Поэтому пароль вставляем перед первым обычным checkbox, но не трогаем служебные поля выбора типа регистрации.
    const isRegistrationTypeCheckbox = ['type', 'u_role', 'role'].includes(String(field.name ?? ''))

    return isServiceCheckbox || !isRegistrationTypeCheckbox
  }

  const agreementIndex = fields.findIndex(isAgreementField)
  const submitIndex = fields.findIndex(field => field.type === 'submit' || field.component === 'submit')
  const insertIndex = agreementIndex !== -1 ? agreementIndex : submitIndex

  if (insertIndex === -1)
    return [...fields, ...fieldsToAdd]

  return [
    ...fields.slice(0, insertIndex),
    ...fieldsToAdd,
    ...fields.slice(insertIndex),
  ]
}

const getCarDiagnostics = (car: any) => {
  const errors: Record<string, string> = {}
  const messages: string[] = []
  const data = (window as any).data ?? {}

  const addError = (field: string, message: string) => {
    errors[field] = message
    messages.push(message)
  }

  if (!car?.cm_id || !data.car_models?.[car.cm_id])
    addError('u_car.cm_id', t(TRANSLATION.CAR_ERROR_MODEL_INVALID))

  if (!car?.registration_plate || !String(car.registration_plate).trim())
    addError('u_car.registration_plate', t(TRANSLATION.CAR_ERROR_PLATE_INVALID))

  if (!car?.seats || Number.isNaN(Number(car.seats)) || Number(car.seats) < 1)
    addError('u_car.seats', t(TRANSLATION.CAR_ERROR_SEATS_INVALID))

  if (!car?.color || !data.car_colors?.[car.color])
    addError('u_car.color', t(TRANSLATION.CAR_ERROR_COLOR_INVALID))

  if (car?.photo) {
    const photo = Array.isArray(car.photo) ? car.photo[0]?.[1] : car.photo
    const isBase64Photo = typeof photo === 'string' && /^data:image\/[a-z0-9.+-]+;base64,/i.test(photo)
    const isImageFile = typeof File !== 'undefined' && photo instanceof File && photo.type.startsWith('image/')

    if (!isBase64Photo && !isImageFile)
      addError('u_car.photo', t(TRANSLATION.CAR_ERROR_PHOTO_INVALID))
  }

  if (car?.details != null && !Array.isArray(car.details))
    addError('u_car.details', t(TRANSLATION.CAR_ERROR_DETAILS_INVALID))

  if (!car?.cc_id || !data.car_classes?.[car.cc_id])
    addError('u_car.cc_id', t(TRANSLATION.CAR_ERROR_CLASS_INVALID))

  return { errors, messages }
}

function RegisterForm({
  status,
  message,
  register,
  setStatus,
  setMessage,
  setMessageModal,
}: IProps) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleSubmit = (values: any) => {
    setErrors({})
    const isDriver = Number(values.u_role) === EUserRoles.Driver
    const { password, password_confirm, data = {}, ...registerValues } = values
    const passwordValue = password || data.password

    if (passwordValue !== password_confirm) {
      setErrors({
        password_confirm: t(TRANSLATION.PASSWORDS_DO_NOT_MATCH),
      })
      setStatus(EStatuses.Fail)
      setMessage(t(TRANSLATION.PASSWORDS_DO_NOT_MATCH))
      return
    }

    if (isDriver) {
      const diagnostics = getCarDiagnostics(registerValues.u_car)

      if (diagnostics.messages.length) {
        const diagnosticsMessage = [
          t(TRANSLATION.CAR_SAVE_ERROR),
          ...diagnostics.messages,
        ].join(' ')

        setErrors(diagnostics.errors)
        setStatus(EStatuses.Fail)
        setMessage(diagnosticsMessage)
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: diagnosticsMessage,
        })
        return
      }

      const normalizedPhone = normalizePhoneNumber(registerValues.u_phone, true, true)
      registerValues.u_phone = normalizedPhone
    }

    registerValues.st = 1
    register({
      ...registerValues,
      data: {
        ...data,
        password: passwordValue,
      },
    })
  }

  let fields = useMemo(() => {
    try {
      const formStr = (window as any).data?.site_constants?.form_register?.value
      const parsedFields = (JSON.parse(formStr).fields as TForm) ?? null
      return parsedFields ? withPasswordField(parsedFields) : null
    } catch {
      return null
    }
  }, [])

  fields = useMemo(() =>
    fields &&
    message !== undefined &&
    message !== 'register_fail' &&
    status === EStatuses.Fail ?
      fields.map(field => field.component === 'alert' ?
        {
          ...field,
          props: {
            ...(field.props ?? {}),
            message: t(TRANSLATION.REGISTER_FAIL) + ': ' + message,
          },
        } :
        field,
      ) :
      fields
  , [message, status])

  if (fields === null)
    return <ErrorFrame title='Bad json in data.js' />

  return (
    <JSONForm
      fields={fields}
      onSubmit={handleSubmit}
      errors={errors}
      state={{
        success: status === EStatuses.Success,
        failed: status === EStatuses.Fail,
      }}
    />
  )
}

export default connector(RegisterForm)
