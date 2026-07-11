import React, { useCallback, useState, useEffect, useMemo } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { objectFromEntries } from '../../tools/compat'
import {
  EStatuses, EUserRoles, EUserCheckStates,
  IUser, ICar,
} from '../../types/types'
import images from '../../constants/images'
import { getBase64 } from '../../tools/utils'
import { formatPhoneNumber, normalizePhoneNumber } from '../../tools/phoneUtils'
import * as API from '../../API'
import {
  TEditClient,
  TEditDriverCheckRequired,
  TEditDriverCheckActive,
} from '../../API/user'
import { getImageFile } from '../../API'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { defaultProfileModal } from '../../state/modals/reducer'
import { userSelectors, userActionCreators } from '../../state/user'
import { carsSelectors, carsActionCreators } from '../../state/cars'
import { ordersSelectors } from '../../state/orders'
import { configSelectors, configActionCreators } from '../../state/config'
import {
  getDriverStatus,
  isDriverCarAdded,
  isDriverCarApproved,
  isDriverOnline,
  isDriverProfileApproved,
} from '../../tools/driverStatus'
import { t, TRANSLATION } from '../../localization'
import { getApiErrorMessage } from '../../tools/apiMessages'
import JSONForm from '../JSONForm'
import { TForm } from '../JSONForm/types'
import DriverStatusAvatar from '../DriverStatusAvatar'
import Overlay from './Overlay'
import './styles.scss'

const CLIENT_FIELDS = new Set<keyof TEditClient>([
  'u_role',
  'u_name',
  'u_family',
  'u_middle',
  'u_phone',
  'u_email',
  'u_photo',
  'u_lang',
  'u_currency',
  'ref_code',
  'u_details',
])
const DRIVER_CHECK_REQUIRED_FIELDS = new Set<
  keyof TEditDriverCheckRequired
>([
  'u_role',
  'u_name',
  'u_family',
  'u_middle',
  'u_phone',
  'u_email',
  'u_photo',
  'u_city',
  'u_lang_skills',
  'u_description',
  'u_birthday',
  'ref_code',
  'u_details',
])
const DRIVER_CHECK_ACTIVE_FIELDS = new Set<
  keyof TEditDriverCheckActive
>([
  'u_role',
  'u_lang',
  'u_currency',
  'u_gps_software',
  'u_active',
  'out_drive',
  'out_address',
  'out_latitude',
  'out_longitude',
  'out_est_datetime',
  'out_s_address',
  'out_s_latitude',
  'out_s_longitude',
  'out_passengers',
  'out_luggage',
  'ref_code',
  'u_details',
])
const CAR_FIELDS = new Set<keyof Parameters<typeof API.editCar>[1]>([
  'cm_id',
  'seats',
  'registration_plate',
  'color',
  'photo',
  'details',
  'cc_id',
])

const getCarFields = (uCar: ICar | null) =>
  uCar ?
    objectFromEntries(Object.entries(uCar)
      .filter(([key]) => CAR_FIELDS.has(key as any)),
    ) as Parameters<typeof API.createUserCar>[0] :
    null

const isDeepEqual = (left: any, right: any): boolean => {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right) return false
  if (!left || !right || typeof left !== 'object') return false

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) return false

  return leftKeys.every(key => (
    Object.prototype.hasOwnProperty.call(right, key) &&
    isDeepEqual(left[key], right[key])
  ))
}

const isNoChangesApiMessage = (message?: string) => {
  const text = String(message || '').toLowerCase()
  return text.includes('user or modified data not found') ||
    text.includes('modified data not found') ||
    text.includes('no modified data')
}

const getChangedFields = <T extends Record<string, any>>(
  values: T,
  defaultValues: Record<string, any>,
  allowedFields: Set<any>,
) => objectFromEntries(Object.entries(values)
  .filter(([key, value]) => (
    allowedFields.has(key as any) &&
    !isDeepEqual(value, defaultValues[key])
  )),
) as Record<string, any>

const hasNewFiles = (files: [any, File][] = []) =>
  files.some(file => !file?.[0])

const getProfileDetailsForCompare = (details: any = {}) => {
  const {
    passport_photo,
    driver_license_photo,
    ...rest
  } = details || {}
  return rest
}

const normalizeImageIds = (value: unknown): any[] => {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value === null || value === undefined || value === '') return []
  return [value]
}

const loadImageFiles = (ids: unknown, setter: (value: [number, File][]) => void) => {
  Promise.all(normalizeImageIds(ids).map(getImageFile))
    .then(items => setter(items.filter(Boolean) as [number, File][]))
    .catch(error => {
      console.error(error)
      setter([])
    })
}

const getProfileFields = (): TForm | null => {
  try {
    const rawForm = (window as any).data?.site_constants?.form_profile?.value
    const form = typeof rawForm === 'string' ? JSON.parse(rawForm) : rawForm
    return Array.isArray(form?.fields) ? form.fields as TForm : null
  } catch (error) {
    console.error(error)
    return null
  }
}

const PROFILE_FALLBACK_FIELDS: TForm = [
  { name: 'u_name', label: TRANSLATION.NAME, type: 'text' },
  { name: 'u_family', label: TRANSLATION.SURNAME, type: 'text' },
  { name: 'u_phone', label: TRANSLATION.PHONE, type: 'phone' },
  { name: 'u_email', label: TRANSLATION.EMAIL, type: 'email' },
  { name: '_profile_submit', label: TRANSLATION.SAVE, type: 'submit', submit: false },
]

const ProfileInlineError = () => (
  <div className="profile-modal__inline-error">
    {t(TRANSLATION.ERROR)}
  </div>
)

const mapStateToProps = (state: IRootState) => ({
  tokens: userSelectors.tokens(state),
  user: userSelectors.user(state),
  car: carsSelectors.userPrimaryCar(state),
  activeOrders: ordersSelectors.activeOrders(state),
  language: configSelectors.language(state),
  isOpen: modalsSelectors.isProfileModalOpen(state),
})

const mapDispatchToProps = {
  setProfileModal: modalsActionCreators.setProfileModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  updateUser: userActionCreators.initUser,
  getUserCars: carsActionCreators.getUserCars,
  editCar: carsActionCreators.edit,
  createUserCar: carsActionCreators.createUserCar,
  setLanguage: configActionCreators.setLanguage,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function ProfileModalContent({
  tokens,
  user,
  car,
  activeOrders,
  language,
  isOpen,
  setProfileModal,
  setMessageModal,
  updateUser,
  getUserCars,
  editCar,
  createUserCar,
  setLanguage,
}: IProps) {
  const onChangeAvatar = useCallback((e: any) => {
    const file = e.target.files[0]
    if (!user || !tokens || !file) return
    getBase64(file)
      .then((base64: any) => API.editUser({ u_photo: base64 }))
      .then(() => updateUser())
      .catch(error => alert(JSON.stringify(error)))
  }, [user, tokens])

  useEffect(() => {
    getUserCars()
  }, [])

  const [passportPhoto, setPassportPhoto] =
    useState<[number, File][] | null>(null)
  const [driverLicensePhoto, setDriverLicensePhoto] =
    useState<[number, File][] | null>(null)
  useEffect(() => {
    if (!isOpen) return
    loadImageFiles(user?.u_details?.passport_photo, setPassportPhoto)
    loadImageFiles(user?.u_details?.driver_license_photo, setDriverLicensePhoto)
  }, [isOpen])

  type TFormValues = Omit<IUser, 'u_details'> & {
    u_details: Omit<IUser['u_details'],
      'passport_photo' |
      'driver_license_photo'
    > & {
      passport_photo: [number, File][],
      driver_license_photo: [number, File][]
    }
    u_car: ICar | null
  }

  const isValuesLoaded = !!(
    user &&
    car !== undefined &&
    passportPhoto &&
    driverLicensePhoto
  )
  const defaultValues: TFormValues | {} = useMemo(() => isValuesLoaded ?
    {
      ...user,
      u_phone: user.u_phone ? formatPhoneNumber(user.u_phone) : '',
      u_details: {
        ...user.u_details,
        passport_photo: passportPhoto,
        driver_license_photo: driverLicensePhoto,
      },
      u_car: car,
    } :
    {}
  , [isValuesLoaded, user, car, passportPhoto, driverLicensePhoto])

  const [ isSubmittingForm, setIsSubmittingForm ] = useState(false)
  const [ errors, setErrors ] = useState<Record<string, any>>({})

  const handleChange = useCallback((name: string, value: any) => {
    setErrors({
      ...errors,
      [name]: false,
    })
  }, [errors])

  async function handleSubmitForm(formValues: TFormValues) {
    if (isDeepEqual(formValues, defaultValues)) return

    const {
      u_details: { passport_photo, driver_license_photo, ...u_details },
      u_car,
      ...values
    } = formValues
    const defaultFormValues = defaultValues as TFormValues

    if ('u_phone' in values && values.u_phone) {
      values.u_phone = normalizePhoneNumber(
        values.u_phone,
        false,
        user!.u_role === EUserRoles.Driver,
      )
    }

    if (values.ref_code && values.ref_code !== user!.ref_code) {
      const res = await API.checkRefCode(values.ref_code)
      if (!res) {
        setErrors({
          ref_code: true,
        })
        return
      }
    }

    setIsSubmittingForm(true)

    if (user!.u_role === EUserRoles.Client) {
      const changedClientFields = getChangedFields(values, defaultFormValues, CLIENT_FIELDS)
      const defaultDetails = getProfileDetailsForCompare(defaultFormValues.u_details)
      if (!isDeepEqual(u_details, defaultDetails))
        changedClientFields.u_details = u_details as any

      if (!Object.keys(changedClientFields).length) {
        setIsSubmittingForm(false)
        return
      }

      try {
        const response = await API.editUser(changedClientFields as any)
        if (
          response?.status === 'error' ||
          (response?.code && String(response.code) !== '200')
        ) {
          if (isNoChangesApiMessage(response?.message)) {
            setIsSubmittingForm(false)
            return
          }
          throw new Error(response?.message)
        }
        updateUser()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.SUCCESS_PROFILE_UPDATE_MESSAGE),
        })
      } catch (error: any) {
        if (isNoChangesApiMessage(error?.message)) {
          setIsSubmittingForm(false)
          return
        }

        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: getApiErrorMessage({ message: error?.message || 'profile update failed' }),
        })
      }
      setIsSubmittingForm(false)
      return
    }

    const carFields = getCarFields(u_car)
    const defaultCarFields = getCarFields(defaultFormValues.u_car || null)
    const hasCarChanges = !isDeepEqual(carFields, defaultCarFields)
    const hasImageChanges = hasNewFiles(passport_photo) || hasNewFiles(driver_license_photo)
    const hasDetailsChanges = !isDeepEqual(
      u_details,
      getProfileDetailsForCompare(defaultFormValues.u_details),
    )

    if (car && carFields && hasCarChanges) {
      const res = await editCar(
        car.c_id,
        carFields as any,
      )
      if (String(res.code) !== '200' && !isNoChangesApiMessage(res.message)) {
        setErrors({
          ...errors,
          ...(res.message === 'busy registration plate' ? {
            'u_car.registration_plate': true,
          } : {}),
        })
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: getApiErrorMessage(res, { context: 'car-profile' }),
        })
        setIsSubmittingForm(false)
        return
      }
    } else if (!car && carFields && hasCarChanges) {
      const res = await createUserCar(carFields)
      if (String(res.code) !== '200' && !isNoChangesApiMessage(res.message)) {
        setErrors({
          ...errors,
          ...(res.message === 'busy registration plate' ? {
            'u_car.registration_plate': true,
          } : {}),
        })
        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: getApiErrorMessage(res, { context: 'car-profile' }),
        })
        setIsSubmittingForm(false)
        return
      }
      getUserCars()
    }

    const imagesKeys = ['passport_photo', 'driver_license_photo']
    const images = [passport_photo ?? [], driver_license_photo ?? []]
    const imagesMap: Record<string, any> = {}

    try {
      await Promise.all(images.map((imageList: [any, File][], i) => {
        const key: string = imagesKeys[i]
        if (!imagesMap[key]) imagesMap[key] = []
        return Promise.all(
          imageList
            .map((image: [any, File]) => {
              if (image[0]) imagesMap[key].push(image[0])
              return image
            })
            .filter((image: [any, File]) => !image[0])
            .map((image: [any, File]) =>
              API.uploadFile({
                file: image[1],
                u_id: user!.u_id,
                token: tokens?.token,
                u_hash: tokens?.u_hash,
              }).then(res => {
                if (res?.dl_id) imagesMap[key].push(res.dl_id)
              }),
            ),
        )
      }))

      const fields = user!.u_check_state === EUserCheckStates.Required ||
        !user!.u_check_state ?
        DRIVER_CHECK_REQUIRED_FIELDS :
        user!.u_check_state === EUserCheckStates.Active ?
          DRIVER_CHECK_ACTIVE_FIELDS :
          new Set()
      try {
        const changedDriverFields = getChangedFields(values, defaultFormValues, fields)
        if (hasDetailsChanges || hasImageChanges)
          changedDriverFields.u_details = { ...u_details, ...imagesMap } as any

        if (!Object.keys(changedDriverFields).length && !hasCarChanges) return

        const response = await API.editUser(changedDriverFields as any)
        if (
          response?.status === 'error' ||
          (response?.code && String(response.code) !== '200')
        ) {
          if (isNoChangesApiMessage(response?.message)) return
          throw new Error(response?.message)
        }
        updateUser()
        setMessageModal({
          isOpen: true,
          status: EStatuses.Success,
          message: t(TRANSLATION.SUCCESS_PROFILE_UPDATE_MESSAGE),
        })
      } catch (error: any) {
        if (isNoChangesApiMessage(error?.message)) return

        setMessageModal({
          isOpen: true,
          status: EStatuses.Fail,
          message: getApiErrorMessage({ message: error?.message || 'profile update failed' }),
        })
      }
    }

    finally {
      setIsSubmittingForm(false)
    }
  }

  const formState = useMemo(() => ({
    pending: isSubmittingForm,
  }), [isSubmittingForm])

  const [profileFieldsTick, setProfileFieldsTick] = useState(0)

  useEffect(() => {
    if (!isOpen) return

    const timers = [0, 250, 900, 1800].map(delay =>
      window.setTimeout(() => setProfileFieldsTick(value => value + 1), delay),
    )

    return () => {
      timers.forEach(timer => window.clearTimeout(timer))
    }
  }, [isOpen])

  const isClient = user?.u_role === EUserRoles.Client
  const isDriver = user?.u_role === EUserRoles.Driver
  const hasCar = isDriverCarAdded(car)
  const driverStatus = getDriverStatus({
    user,
    car,
    activeOrders,
  })

  const isProfileActivated = isDriverProfileApproved(user)
  const isCarActivated = isDriverCarApproved(car)
  const lineStatusText = !hasCar ?
    t('driver_line_no_car') :
    isProfileActivated && isCarActivated && isDriverOnline(user) ?
      t('driver_line_online') :
      t('driver_line_offline')
  const profileActivationText = isProfileActivated ? t('driver_profile_activated_label') : t('driver_profile_pending_label')
  const profileStatusHint = !hasCar ?
    t('driver_status_hint_add_car') :
    (!isProfileActivated || !isCarActivated) ? t('driver_status_hint_profile_check') :
    t('driver_status_hint_header_change')


  const profileFields = useMemo(() => {
    return getProfileFields() || PROFILE_FALLBACK_FIELDS
  }, [isOpen, language?.iso, profileFieldsTick])

  const fields = useMemo(() => profileFields && isClient ?
    profileFields.filter(field =>
      (field.name && CLIENT_FIELDS.has(field.name as any)) ||
      field.type === 'submit',
    ) :
    profileFields
  , [isClient, profileFields])

  return isOpen && (
    <Overlay
      isOpen={isOpen}
      onClick={() => setProfileModal({ ...defaultProfileModal })}
    >
      <div
        className="modal profile-modal"
      >
        <fieldset>
          <legend>{t(TRANSLATION.PROFILE)}</legend>
          <div className="avatar">
            {isValuesLoaded ?
              (
                <label>
                  {isDriver ? (
                    <DriverStatusAvatar
                      status={driverStatus}
                      src={user?.u_photo}
                      size="profile"
                      className="avatar_driver-status-avatar"
                      title={user?.u_name || ''}
                    />
                  ) : (
                    <div className="avatar_image">
                      <div
                        className="avatar_image_bg"
                        style={{
                          backgroundImage: `url(${user?.u_photo || images.driverAvatar})`,
                        }}
                        title={user?.u_name || ''}
                      />
                    </div>
                  )}
                  <input
                    onChange={onChangeAvatar}
                    type="file"
                    className="avatar_input"
                  />
                </label>
              ) :
              <svg width="100" height="100" viewBox="0 0 38 38" xmlns="http://www.w3.org/2000/svg" stroke="#000">
                <g fill="none" fillRule="evenodd">
                  <g transform="translate(1 1)" strokeWidth="2">
                    <circle strokeOpacity=".5" cx="18" cy="18" r="18"/>
                    <path d="M36 18c0-9.94-8.06-18-18-18">
                      <animateTransform
                        attributeName="transform"
                        type="rotate"
                        from="0 18 18"
                        to="360 18 18"
                        dur="1s"
                        repeatCount="indefinite"
                      />
                    </path>
                  </g>
                </g>
              </svg>
            }
            {isDriver && isValuesLoaded && (
              <>
                <div className="avatar_status-info">
                  <span className={`avatar_info-badge ${isProfileActivated ? 'avatar_info-badge--verified' : 'avatar_info-badge--pending'}`}>
                    {profileActivationText}
                  </span>
                  <span className={`avatar_info-badge ${driverStatus === 'active' ? 'avatar_info-badge--online' : 'avatar_info-badge--offline'}`}>
                    {lineStatusText}
                  </span>
                </div>
                <span className="avatar_status-hint">{profileStatusHint}</span>
              </>
            )}
          </div>
          {isValuesLoaded && (
            <JSONForm
              defaultValues={defaultValues}
              fields={fields}
              onSubmit={handleSubmitForm}
              onChange={handleChange}
              state={formState}
              errors={errors}
            />
          )}
        </fieldset>
      </div>
    </Overlay>
  )
}

type ProfileModalErrorBoundaryProps = React.PropsWithChildren<IProps>

class ProfileModalErrorBoundary extends React.Component<ProfileModalErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(prevProps: ProfileModalErrorBoundaryProps) {
    if (prevProps.isOpen !== this.props.isOpen && !this.props.isOpen && this.state.hasError)
      this.setState({ hasError: false })
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.hasError)
      return this.props.children

    if (!this.props.isOpen)
      return null

    return (
      <Overlay
        isOpen={this.props.isOpen}
        onClick={() => this.props.setProfileModal({ ...defaultProfileModal })}
      >
        <div className="modal profile-modal">
          <fieldset>
            <legend>{t(TRANSLATION.PROFILE)}</legend>
            <ProfileInlineError />
          </fieldset>
        </div>
      </Overlay>
    )
  }
}

function ProfileModal(props: IProps) {
  return (
    <ProfileModalErrorBoundary {...props}>
      <ProfileModalContent {...props} />
    </ProfileModalErrorBoundary>
  )
}

export default connector(ProfileModal)
