import React, {
  useState, useRef, useLayoutEffect,
  useMemo, useCallback, useImperativeHandle, useEffect,
} from 'react'
import { connect, ConnectedProps, useStore } from 'react-redux'
import moment from 'moment'
import {
  EBookingDriverState,
  EBookingLocationKinds,
  EPointType,
  EPaymentWays,
  EStatuses,
  ICar,
  IAddressPoint,
  IDriver,
  IOrder,
  IUser,
} from '../../types/types'
import images from '../../constants/images'
import SITE_CONSTANTS, { CURRENCY } from '../../siteConstants'
import { distanceBetweenEarthCoordinates, getPhoneNumberError, shortenAddress, stripLeadingEmoji } from '../../tools/utils'
import { candidateMode } from '../../tools/order'
import { getDriverOfferCommentLabels, getDriverOfferEtaLabels } from '../../tools/siteConstantOptions'
import {
  getOfferResponseBookingCommentIds,
  addPassengerRejectedChoice,
  clearPassengerConfirmedChoice,
  getPassengerConfirmedChoice,
  getPassengerConfirmedChoiceStartedAt,
  getPassengerChoiceSearchRestartedAt,
  clearPassengerChoiceWaitingExtension,
  getPassengerPickupEta,
  getPassengerRejectedChoices,
  getChoiceDriverIdsToReleaseBeforeChoosing,
  isChoiceDriverSelectionBlockedError,
  isChoiceOrder,
  isOfferOrder,
  isStoredSimpleOrderMode,
  isVotingOrder,
  isVisibleChoiceDriverState,
  restartPassengerChoiceSearch,
  setPassengerConfirmedChoice,
  setStoredChoiceOrderMode,
} from '../../tools/driverOffer'
import * as API from '../../API'
import { t, TRANSLATION } from '../../localization'
import { IRootState } from '../../state'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import { ordersActionCreators } from '../../state/orders'
import { configSelectors } from '../../state/config'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import Icon from '../../components/Icon'
import Input, { EInputTypes, EInputStyles } from '../../components/Input'
import Button, { EButtonStyles } from '../../components/Button'
import LocationInput from '../../components/LocationInput'
import ShortInfo from '../../components/ShortInfo'
import SeatSlider from '../../components/SeatSlider'
import CarClassSlider from '../../components/CarClassSlider'
import PriceInput from '../../components/PriceInput'
import CarClassBadge, { getCandidateCarClassKind } from '../../components/CarClassBadge'
import DriverChoiceCancelReasonModal from '../../components/modals/DriverChoiceCancelReasonModal'
import { useReliableNow } from '../../tools/hooks'
import { getStableRemainingLifetimeSeconds, getTimestamp as getReliableTimestamp } from '../../tools/reliableTime'
import { getDriverTripStartedAt } from '../../tools/tripTimer'
import { getDriverColor } from '../../tools/driverColors'
import { getDriverDoorNumber, normalizeDriverDoorNumber, shouldShowDriverDoorNumber } from '../../tools/driverDoorNumber'
import { writeFlowEvent } from '../../tools/flowLog'
import { PassengerUiConfig } from '../../types/passengerUi'
import './voting-form.scss'

const DRIVER_AVATAR_FALLBACK = '/assets/images/default/driver-avatar-default.png'
const PASSENGER_SAVED_PHONE_KEY = 'gruzvill_passenger_saved_phone'

type TClientOrderMode = 'vote' | 'offer' | 'order'

export interface IRequestOrderDraft {
  fromAddress?: string
  toAddress?: string
  phone?: string | number | null
  price?: string | number | null
  buttonText?: string
  isVoting?: boolean
  isOffer?: boolean
}

const mapStateToProps = (state: IRootState) => ({
  from: clientOrderSelectors.from(state),
  to: clientOrderSelectors.to(state),
  comments: clientOrderSelectors.comments(state),
  time: clientOrderSelectors.time(state),
  phone: clientOrderSelectors.phone(state),
  user: userSelectors.user(state),
  locationClass: clientOrderSelectors.locationClass(state),
  locationClassSelectionMode: clientOrderSelectors.locationClassSelectionMode(state),
  algorithmLocationClass: clientOrderSelectors.algorithmLocationClass(state),
  locationClasses: clientOrderSelectors.availableLocationClasses(state),
  orderFormLayout: clientOrderSelectors.orderFormLayout(state),
  pickupPrice: clientOrderSelectors.pickupPrice(state),
  customerPrice: clientOrderSelectors.customerPrice(state),
  language: configSelectors.language(state),
})

const mapDispatchToProps = {
  setPickTimeModal: modalsActionCreators.setPickTimeModal,
  setCommentsModal: modalsActionCreators.setCommentsModal,
  setLoginModal: modalsActionCreators.setLoginModal,
  setMessageModal: modalsActionCreators.setMessageModal,
  setRatingModal: modalsActionCreators.setRatingModal,
  createOrder: ordersActionCreators.create,
  refreshActiveOrders: ordersActionCreators.refreshActiveOrders,
  setPhone: clientOrderActionCreators.setPhone,
  setPickupPrice: clientOrderActionCreators.setPickupPrice,
  setCustomerPrice: clientOrderActionCreators.setCustomerPrice,
  resetClientOrder: clientOrderActionCreators.reset,
  setFrom: clientOrderActionCreators.setFrom,
  setTo: clientOrderActionCreators.setTo,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  isExpanded: boolean
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>
  syncFrom: () => void
  syncTo: () => void
  onSubmit: (data: Awaited<ReturnType<typeof API.postDrive>>, draft?: IRequestOrderDraft) => void
  lockedOrder?: IOrder | null
  lockedDraft?: IRequestOrderDraft | null
  lockedOrderId?: IOrder['b_id'] | null
  onLockedCancel?: (orderId: IOrder['b_id']) => Promise<void> | void
  onNewOrder?: () => void
  minimizedPartRef: React.Ref<HTMLElement>
  noSwipeElementsRef: React.Ref<HTMLElement[]>
  uiConfig?: PassengerUiConfig
}

const VotingForm = function VotingForm({
  from,
  to,
  comments,
  time,
  phone,
  user,
  locationClass,
  locationClassSelectionMode,
  algorithmLocationClass,
  locationClasses,
  orderFormLayout,
  language,
  setPickTimeModal,
  setCommentsModal,
  setLoginModal,
  setMessageModal,
  setRatingModal,
  createOrder,
  refreshActiveOrders,
  setPhone,
  setPickupPrice,
  setCustomerPrice,
  resetClientOrder,
  setFrom,
  setTo,
  isExpanded,
  setIsExpanded,
  syncFrom,
  syncTo,
  onSubmit,
  lockedOrder,
  lockedDraft,
  lockedOrderId,
  onLockedCancel,
  onNewOrder,
  minimizedPartRef,
  noSwipeElementsRef,
  uiConfig,
}: IProps) {

  const languageIso = language?.iso
  const activeUiConfig = uiConfig && !uiConfig.legacy ? uiConfig : null
  const isBlockVisible = useCallback((block: string) => (
    !activeUiConfig || activeUiConfig.visibleBlocks.includes(block)
  ), [activeUiConfig])

  const carSliderRef = useRef<HTMLDivElement>(null)
  const seatSliderRef = useRef<HTMLDivElement>(null)
  const priceInputRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(noSwipeElementsRef, () => [
    carSliderRef.current!,
    seatSliderRef.current!,
    priceInputRef.current!,
  ].filter(Boolean))

  const effectiveLocationClassId = locationClassSelectionMode === 'auto' &&
    algorithmLocationClass !== null &&
    algorithmLocationClass !== undefined ?
    algorithmLocationClass :
    locationClass

  const selectedLocationClass = useMemo(() =>
    locationClasses?.find(item => String(item.id) === String(effectiveLocationClassId)) ?? null,
  [locationClasses, effectiveLocationClassId])

  const intercityMode = selectedLocationClass?.kind === EBookingLocationKinds.Intercity
  const delayedPickupMode = isDelayedPickupTime(time)
  const preferOfferMode = Boolean(orderFormLayout?.orderModeResolution?.preferOfferMode ?? (intercityMode || delayedPickupMode))

  const locked = Boolean(lockedOrder || lockedDraft)
  const available = !locked

  const [fromError, setFromError] = useState<string | null>(null)
  useLayoutEffect(() => { setFromError(null) }, [from])
  const [toError, setToError] = useState<string | null>(null)
  useLayoutEffect(() => { setToError(null) }, [to])
  const [phoneError, setPhoneError] = useState<string | null>(null)
  useLayoutEffect(() => { setPhoneError(null) }, [phone])

  useEffect(() => {
    if (phone)
      return

    try {
      const savedPhone = window.localStorage.getItem(PASSENGER_SAVED_PHONE_KEY)
      const normalizedPhone = savedPhone?.replace(/\D/g, '')
      if (normalizedPhone)
        setPhone(Number(normalizedPhone))
    } catch (error) {
      console.error(error)
    }
  }, [])

  const store = useStore<IRootState>()

  const hasPointCoordinates = (point: typeof from | typeof to) => {
    const latitude = Number(point?.latitude)
    const longitude = Number(point?.longitude)
    return Number.isFinite(latitude) && Number.isFinite(longitude)
  }

  const getPointAddressForOrder = (point: typeof from | typeof to, fallback: string) => {
    const address = String(point?.address || point?.shortAddress || '').trim()
    if (address && !point?.isAddressResolving)
      return address

    return fallback
  }

  const getAddressCityPartFromGeocode = (address: any) =>
    address?.city ||
    address?.country ||
    address?.village ||
    address?.town ||
    address?.state

  const resolveManualPointForSubmit = async(
    point: IAddressPoint | null,
    setPoint: (payload: IAddressPoint | { isCurrent?: boolean } | null) => unknown,
    searchCenter?: IAddressPoint | null,
  ) => {
    if (hasPointCoordinates(point))
      return point

    const query = String(point?.address || point?.shortAddress || '').trim()
    if (!query)
      return point

    try {
      const address = await API.geocode(query, { details: true, searchCenter: searchCenter || undefined })
      if (!address?.display_name || !address.lat || !address.lon)
        return point

      const displayName = address.display_name
      const resolvedPoint: IAddressPoint = {
        ...point,
        address: displayName,
        shortAddress: shortenAddress(
          displayName,
          getAddressCityPartFromGeocode(address.address),
        ) || displayName,
        latitude: Number(address.lat),
        longitude: Number(address.lon),
        resolveAddress: false,
      }
      setPoint(resolvedPoint)
      return resolvedPoint
    } catch (error) {
      console.warn('Manual address submit resolve failed', error)
      return point
    }
  }

  const submit = useCallback(async(mode: TClientOrderMode = 'order') => {
    if (locked)
      return

    setSubmitError(null)

    const state = store.getState()
    const carClass = clientOrderSelectors.carClass(state)
    const seats = clientOrderSelectors.seats(state)
    const currentPickupPrice = clientOrderSelectors.pickupPrice(state)
    const currentCustomerPrice = clientOrderSelectors.customerPrice(state)
    const currentPickupPriceNumber = Number(currentPickupPrice ?? 0)
    const currentCustomerPriceNumber = Number(currentCustomerPrice ?? 0)
    const safePickupPrice = Number.isFinite(currentPickupPriceNumber) ?
      Math.max(0, currentPickupPriceNumber) :
      0
    const safeCustomerOfferPrice = Number.isFinite(currentCustomerPriceNumber) ?
      Math.max(0, currentCustomerPriceNumber) :
      0
    const isVoting = mode === 'vote'
    const isOffer = mode === 'offer'
    const safeOrderPrice = isOffer ? safeCustomerOfferPrice : safePickupPrice

    const submitFrom = await resolveManualPointForSubmit(from, setFrom, hasPointCoordinates(to) ? to : null)
    const submitTo = await resolveManualPointForSubmit(to, setTo, hasPointCoordinates(submitFrom) ? submitFrom : hasPointCoordinates(from) ? from : null)

    let error = false
    if (!hasPointCoordinates(submitFrom)) {
      setFromError(t(TRANSLATION.POINT_MUST_BE_SELECTED_ERROR))
      error = true
    } else if (submitFrom?.isAddressResolving) {
      setFromError(t(TRANSLATION.MAP_ADDRESS_LOADING))
      error = true
    }
    if (!hasPointCoordinates(submitTo)) {
      setToError(t(TRANSLATION.POINT_MUST_BE_SELECTED_ERROR))
      error = true
    } else if (submitTo?.isAddressResolving) {
      setToError(t(TRANSLATION.MAP_ADDRESS_LOADING))
      error = true
    }
    const currentPhoneError = getPhoneNumberError(phone)
    if (currentPhoneError) {
      setPhoneError(currentPhoneError)
      setIsExpanded(true)
      error = true
    }
    if (error)
      return

    if (!user) {
      setLoginModal(true)
      return
    }

    const commentObj: any = {}
    commentObj['b_comments'] = comments.ids || []
    comments.custom &&
      (commentObj['b_custom_comment'] = comments.custom)
    comments.flightNumber &&
      (commentObj['b_flight_number'] = comments.flightNumber)
    comments.placard && (commentObj['b_placard'] = comments.placard)

    const startTime = moment(isVoting || time === 'now' ? undefined : time)
    const buttonText = isOffer ?
      t(TRANSLATION.CLIENT_OFFER_ORDER_BUTTON, { toUpper: false }) :
      isVoting ?
        t(TRANSLATION.VOTE, { toUpper: false }) :
        t(TRANSLATION.TO_ORDER, { toUpper: false })

    const orderFromAddress = getPointAddressForOrder(submitFrom, t(TRANSLATION.START_POINT))
    const orderToAddress = getPointAddressForOrder(submitTo, t(TRANSLATION.DESTINATION_POINT))

    const draft: IRequestOrderDraft = {
      fromAddress: orderFromAddress,
      toAddress: orderToAddress,
      phone,
      price: safeOrderPrice,
      buttonText,
      isVoting,
      isOffer,
    }

    const payload: any = {
      b_start_address: orderFromAddress,
      b_start_latitude: submitFrom!.latitude,
      b_start_longitude: submitFrom!.longitude,
      b_destination_address: orderToAddress,
      b_destination_latitude: submitTo?.latitude,
      b_destination_longitude: submitTo?.longitude,
      ...commentObj,
      b_contact: phone! + '',
      b_start_datetime: startTime,
      b_passengers_count: seats,
      b_car_class: carClass,
      b_payment_way: EPaymentWays.Cash,
      b_location_class: algorithmLocationClass ?? locationClass,
      b_max_waiting: isVoting ? getChoiceWaitingIntervalSeconds() : 7200,
      b_options: {
        fromShortAddress: submitFrom?.shortAddress || orderFromAddress,
        toShortAddress: submitTo?.shortAddress || orderToAddress,
        customer_price: safeOrderPrice,
      },
      b_voting: isVoting,
    }

    if (isOffer) {
      // Offer order is still created through the old backend schema.
      // gruzvill validates b_options values as arrays. Do not send helper keys
      // like fromShortAddress/toShortAddress here; they can be rejected by backend.
      payload.b_cars_count = 0
      delete payload.b_options

      if (safeOrderPrice > 0) {
        payload.b_options = {
          customer_price: [safeOrderPrice],
        }
      }

      const offerMarkerComments = getOfferResponseBookingCommentIds()
      if (offerMarkerComments.length) {
        payload.b_comments = Array.from(new Set([
          ...((payload.b_comments || []) as string[]),
          ...offerMarkerComments,
        ]))
      }
    }

    setSubmitting(true)
    try {
      const data = await createOrder(payload)
      setStoredChoiceOrderMode(data.b_id, isVoting ? 'voting' : isOffer ? 'offer' : 'order')

      if (!isVoting && !isOffer)
        resetClientOrder()
      onSubmit(data, draft)
    } catch (error) {
      setSubmitError(getSafeSubmitErrorMessage(error))
      console.error(error)
    }
    setSubmitting(false)
  }, [
    locked,
    from, to, comments, time, phone, user,
    locationClass, algorithmLocationClass, store, setLoginModal, createOrder,
    setIsExpanded, onSubmit, resetClientOrder,
  ])

  const [submitting, setSubmitting] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [candidateUsers, setCandidateUsers] = useState<IUser[]>([])
  const [candidateCars, setCandidateCars] = useState<ICar[]>([])
  const [selectedDriverUser, setSelectedDriverUser] = useState<IUser | null>(null)
  const [selectedDriverCar, setSelectedDriverCar] = useState<ICar | null>(null)
  const [selectedDoorNumber, setSelectedDoorNumber] = useState('')
  const [activeCandidate, setActiveCandidate] = useState<IUser['u_id'] | null>(null)
  const [heldCandidate, setHeldCandidate] = useState<IUser['u_id'] | null>(null)
  const [driverCancelReasonModalOpen, setDriverCancelReasonModalOpen] = useState(false)
  const [driverCancelTarget, setDriverCancelTarget] = useState<{ orderId: IOrder['b_id'], driverId: IUser['u_id'] } | null>(null)
  const [savingLockedCustomerPrice, setSavingLockedCustomerPrice] = useState(false)
  const [lockedCustomerPriceOverride, setLockedCustomerPriceOverride] = useState<{ orderId: IOrder['b_id'], price: number } | null>(null)
  const expiredChoiceOrdersRef = useRef<Record<string, true>>({})
  const lastCandidateRankingLogKeyRef = useRef('')
  const lastCandidateBestDriverIdRef = useRef<string | null>(null)
  const lastCandidateIdsRef = useRef<string[]>([])


  const [submitError, setSubmitError] = useState<string | null>(null)
  const [selectedMode, setSelectedMode] = useState<TClientOrderMode | null>(null)
  const requestIsOffer = selectedMode === 'offer' || Boolean(lockedDraft?.isOffer || (lockedOrder && isOfferOrder(lockedOrder)))
  const showPriceFields = SITE_CONSTANTS.ENABLE_CUSTOMER_PRICE || preferOfferMode || selectedMode === 'offer' || Boolean(lockedDraft?.isOffer || (lockedOrder && isOfferOrder(lockedOrder)))

  const lockedCustomerPriceFromOrder = useMemo(() => getLockedCustomerPrice(lockedOrder ?? null, lockedDraft ?? null), [lockedOrder, lockedDraft])
  const lockedCustomerPrice = useMemo(() => {
    const overridePrice = lockedCustomerPriceOverride && String(lockedCustomerPriceOverride.orderId) === String(lockedOrder?.b_id) ?
      lockedCustomerPriceOverride.price :
      null

    return Math.max(0, lockedCustomerPriceFromOrder ?? 0, overridePrice ?? 0)
  }, [lockedCustomerPriceFromOrder, lockedCustomerPriceOverride, lockedOrder?.b_id])
  const lockedInfo = useMemo(() => getLockedInfo(lockedOrder ?? null, lockedDraft ?? null), [lockedOrder, lockedDraft])

  useEffect(() => {
    setLockedCustomerPriceOverride(prev => (
      !prev || String(prev.orderId) === String(lockedOrder?.b_id) ? prev : null
    ))
  }, [lockedOrder?.b_id])

  const [confirmedChoiceId, setConfirmedChoiceId] = useState<IUser['u_id'] | null>(() => getPassengerConfirmedChoice(lockedOrder?.b_id))
  const [pickupEtaVersion, setPickupEtaVersion] = useState(0)

  const [rejectedChoiceIds, setRejectedChoiceIds] = useState<IUser['u_id'][]>(() => getPassengerRejectedChoices(lockedOrder?.b_id))
  const [lockedWaitingExtensionSeconds, setLockedWaitingExtensionSeconds] = useState(0)
  const [extendingLockedWaiting, setExtendingLockedWaiting] = useState(false)
  const [lockedWaitingExtendSuccess, setLockedWaitingExtendSuccess] = useState(false)
  const [lockedDriverOfferExpanded, setLockedDriverOfferExpanded] = useState(false)
  const lockedWaitingExtendSuccessTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    setRejectedChoiceIds(getPassengerRejectedChoices(lockedOrder?.b_id))
  }, [lockedOrder?.b_id])

  useEffect(() => {
    setLockedWaitingExtensionSeconds(0)
    setLockedWaitingExtendSuccess(false)
    if (lockedWaitingExtendSuccessTimeoutRef.current !== null) {
      window.clearTimeout(lockedWaitingExtendSuccessTimeoutRef.current)
      lockedWaitingExtendSuccessTimeoutRef.current = null
    }
    clearPassengerChoiceWaitingExtension(lockedOrder?.b_id)
  }, [lockedOrder?.b_id, lockedOrder?.b_max_waiting])

  useEffect(() => () => {
    if (lockedWaitingExtendSuccessTimeoutRef.current !== null)
      window.clearTimeout(lockedWaitingExtendSuccessTimeoutRef.current)
  }, [])


  useEffect(() => {
    setConfirmedChoiceId(getPassengerConfirmedChoice(lockedOrder?.b_id))
  }, [lockedOrder?.b_id])

  useEffect(() => {
    const handlePickupEtaChange = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.orderId && String(detail.orderId) !== String(lockedOrder?.b_id ?? ''))
        return

      setPickupEtaVersion(version => version + 1)
    }

    window.addEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
    return () => window.removeEventListener('passengerPickupEtaChanged', handlePickupEtaChange)
  }, [lockedOrder?.b_id])

  useEffect(() => {
    const handlePassengerChoiceChange = (event: Event) => {
      const detail = (event as CustomEvent).detail || {}
      if (detail.orderId && String(detail.orderId) !== String(lockedOrder?.b_id ?? ''))
        return

      setRejectedChoiceIds(getPassengerRejectedChoices(lockedOrder?.b_id))
      setConfirmedChoiceId(getPassengerConfirmedChoice(lockedOrder?.b_id))
    }

    window.addEventListener('passengerRejectedChoicesChanged', handlePassengerChoiceChange)
    window.addEventListener('passengerCanceledDriverChoice', handlePassengerChoiceChange)
    window.addEventListener('passengerConfirmedDriverChoice', handlePassengerChoiceChange)
    return () => {
      window.removeEventListener('passengerRejectedChoicesChanged', handlePassengerChoiceChange)
      window.removeEventListener('passengerCanceledDriverChoice', handlePassengerChoiceChange)
      window.removeEventListener('passengerConfirmedDriverChoice', handlePassengerChoiceChange)
    }
  }, [lockedOrder?.b_id])

  const candidateDriversCacheRef = React.useRef<Record<string, IDriver[]>>({})
  const candidateDrivers = useMemo(() => {
    const rejected = new Set(rejectedChoiceIds.map(String))
    const orderKey = lockedOrder?.b_id ? String(lockedOrder.b_id) : ''

    if (confirmedChoiceId || !lockedOrder || !orderKey) {
      if (orderKey)
        candidateDriversCacheRef.current[orderKey] = []
      return []
    }

    const currentCandidates = getCandidateDrivers(lockedOrder, confirmedChoiceId)
    const cachedCandidates = candidateDriversCacheRef.current[orderKey] || []
    const mergedCandidates = [...currentCandidates]

    cachedCandidates.forEach(candidate => {
      const candidateUserId = String(candidate.u_id ?? '')
      const candidateCarId = String(candidate.c_id ?? '')
      const exists = mergedCandidates.some(item =>
        (candidateUserId && String(item.u_id ?? '') === candidateUserId) ||
        (candidateCarId && String(item.c_id ?? '') === candidateCarId),
      )

      if (!exists)
        mergedCandidates.push(candidate)
    })

    const visibleCandidates = mergedCandidates.filter(driver =>
      !rejected.has(String(driver.u_id)) &&
      !rejected.has(String(driver.c_id ?? '')) &&
      isVisibleChoiceDriverState(driver.c_state),
    )

    candidateDriversCacheRef.current[orderKey] = visibleCandidates

    return sortCandidateDriversByEta(visibleCandidates, lockedOrder)
  }, [
    lockedOrder?.b_id,
    confirmedChoiceId,
    rejectedChoiceIds.map(String).sort().join('|'),
    pickupEtaVersion,
    lockedOrder?.drivers?.map(driver => `${driver.u_id}:${driver.c_id}:${driver.c_state}:${JSON.stringify(driver.c_options ?? {})}`).join('|'),
    languageIso,
  ])
  const lockedActivityLabel = ''
  const selectedDriver = useMemo(() => getSelectedDriver(lockedOrder ?? null, confirmedChoiceId), [
    lockedOrder?.b_id,
    confirmedChoiceId,
    lockedOrder?.drivers?.map(driver => `${driver.u_id}:${driver.c_id}:${driver.c_state}`).join('|'),
    languageIso,
  ])
  useEffect(() => {
    if (!lockedOrder?.b_id || selectedDriver) {
      lastCandidateRankingLogKeyRef.current = ''
      lastCandidateBestDriverIdRef.current = null
      lastCandidateIdsRef.current = []
      return
    }

    const orderId = lockedOrder.b_id
    const evaluatedCandidates = candidateDrivers.map((candidate, index) => {
      const etaMinutes = getCandidatePickupEtaMinutes(candidate, lockedOrder)
      const distanceKm = getCandidateDistanceToPickupKm(candidate, lockedOrder)

      return {
        driverId: candidate.u_id,
        carId: candidate.c_id,
        state: candidate.c_state,
        rank: index + 1,
        etaMinutes: etaMinutes === Number.POSITIVE_INFINITY ? null : etaMinutes,
        distanceKm,
      }
    })
    const nextCandidateIds = evaluatedCandidates
      .map(candidate => String(candidate.driverId))
      .filter(Boolean)
    const removedCandidateIds = lastCandidateIdsRef.current
      .filter(driverId => !nextCandidateIds.includes(driverId))
    const bestDriverId = nextCandidateIds[0] || null
    const rankingKey = `${orderId}|${evaluatedCandidates
      .map(candidate => [
        candidate.driverId,
        candidate.state,
        candidate.rank,
        candidate.etaMinutes ?? 'no-eta',
        candidate.distanceKm ?? 'no-distance',
      ].join(':'))
      .join('|')}`

    removedCandidateIds.forEach(driverId => {
      writeFlowEvent('DRIVER_REMOVED_FROM_CANDIDATES', {
        orderId,
        driverId,
        screen: 'PassengerVotingForm',
        uiState: 'CandidateRanking',
        data: {
          reason: 'not_in_visible_candidate_list',
          previousRank: lastCandidateIdsRef.current.indexOf(driverId) + 1,
          remainingCandidateIds: nextCandidateIds,
        },
      })
    })

    if (rankingKey !== lastCandidateRankingLogKeyRef.current) {
      evaluatedCandidates.forEach(candidate => {
        writeFlowEvent('DRIVER_CANDIDATE_EVALUATED', {
          orderId,
          driverId: candidate.driverId,
          screen: 'PassengerVotingForm',
          uiState: 'CandidateRanking',
          data: {
            carId: candidate.carId,
            driverState: candidate.state,
            rank: candidate.rank,
            etaMinutes: candidate.etaMinutes,
            distanceKm: candidate.distanceKm,
            reason: 'eta_distance_sort',
          },
        })
      })

      writeFlowEvent('DRIVER_RANKING_UPDATED', {
        orderId,
        screen: 'PassengerVotingForm',
        uiState: 'CandidateRanking',
        data: {
          reason: 'candidate_list_or_eta_changed',
          candidates: evaluatedCandidates,
          bestDriverId,
          previousBestDriverId: lastCandidateBestDriverIdRef.current,
        },
      })

      if (lastCandidateBestDriverIdRef.current && bestDriverId && lastCandidateBestDriverIdRef.current !== bestDriverId) {
        const previousCandidate = evaluatedCandidates.find(candidate =>
          String(candidate.driverId) === String(lastCandidateBestDriverIdRef.current),
        )
        const newCandidate = evaluatedCandidates.find(candidate =>
          String(candidate.driverId) === String(bestDriverId),
        )

        writeFlowEvent('BEST_DRIVER_CHANGED', {
          orderId,
          driverId: bestDriverId,
          screen: 'PassengerVotingForm',
          uiState: 'CandidateRanking',
          data: {
            previousDriverId: lastCandidateBestDriverIdRef.current,
            newDriverId: bestDriverId,
            reason: getBestDriverChangedReason(previousCandidate, newCandidate),
            previousRank: previousCandidate?.rank ?? null,
            newRank: newCandidate?.rank ?? null,
            previousEtaMinutes: previousCandidate?.etaMinutes ?? null,
            newEtaMinutes: newCandidate?.etaMinutes ?? null,
          },
        })
      }

      lastCandidateRankingLogKeyRef.current = rankingKey
    }

    lastCandidateBestDriverIdRef.current = bestDriverId
    lastCandidateIdsRef.current = nextCandidateIds
  }, [
    lockedOrder?.b_id,
    selectedDriver?.u_id,
    candidateDrivers.map(candidate => `${candidate.u_id}:${candidate.c_id}:${candidate.c_state}`).join('|'),
    candidateDrivers.map(candidate => getCandidatePickupEtaMinutes(candidate, lockedOrder)).join('|'),
  ])


  const canOpenLockedActivity = Boolean(lockedOrder && !selectedDriver)
  const canIncreaseLockedCustomerPrice = Boolean(lockedOrder && !selectedDriver)
  const isLockedCustomerPriceDisabled = savingLockedCustomerPrice || Boolean(selectedDriver)

  useEffect(() => {
    let cancelled = false

    if (!candidateDrivers.length || selectedDriver) {
      setCandidateUsers([])
      setCandidateCars([])
      setActiveCandidate(null)
      return
    }

    API.getUsers(candidateDrivers.map(candidate => candidate.u_id))
      .then(users => {
        if (!cancelled) setCandidateUsers(users)
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) setCandidateUsers([])
      })

    API.getCars(candidateDrivers.map(candidate => candidate.c_id).filter(Boolean))
      .then(cars => {
        if (!cancelled) setCandidateCars(cars)
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) setCandidateCars([])
      })

    setActiveCandidate(prev => (
      prev && candidateDrivers.some(candidate => candidate.u_id === prev) ?
        prev :
        null
    ))

    return () => {
      cancelled = true
    }
  }, [
    selectedDriver?.u_id,
    candidateDrivers.map(candidate => `${candidate.u_id}_${candidate.c_id}`).sort().join('|'),
  ])

  useEffect(() => {
    let cancelled = false

    if (!selectedDriver) {
      setSelectedDriverUser(null)
      setSelectedDriverCar(null)
      return
    }

    API.getUser(selectedDriver.u_id)
      .then(user => {
        if (!cancelled) setSelectedDriverUser(user)
      })
      .catch(error => {
        console.error(error)
        if (!cancelled) setSelectedDriverUser(null)
      })

    if (selectedDriver.c_id) {
      API.getCar(selectedDriver.c_id)
        .then(car => {
          if (!cancelled) setSelectedDriverCar(car)
        })
        .catch(error => {
          console.error(error)
          if (!cancelled) setSelectedDriverCar(null)
        })
    } else {
      setSelectedDriverCar(null)
    }

    return () => {
      cancelled = true
    }
  }, [selectedDriver?.u_id, selectedDriver?.c_id])

  useEffect(() => {
    if (!selectedDriver) {
      setSelectedDoorNumber('')
      return
    }

    setSelectedDoorNumber(getDriverDoorNumber(selectedDriver, selectedDriverCar))
  }, [
    lockedOrder?.b_id,
    selectedDriver?.u_id,
    selectedDriver?.c_id,
    selectedDriverCar?.c_id,
    selectedDriverCar?.registration_plate,
  ])

  const shouldRunLiveTimer = Boolean(
    lockedOrder && (
      (isVotingOrder(lockedOrder) && !selectedDriver) ||
      selectedDriver?.c_state === EBookingDriverState.Performer ||
      selectedDriver?.c_state === EBookingDriverState.Started
    ),
  )
  const now = useReliableNow(shouldRunLiveTimer, 1000)
  const lockedVotingRemainingSeconds = useMemo(() =>
    lockedOrder && isVotingOrder(lockedOrder) && !selectedDriver ?
      getChoiceOrderRemainingSeconds(lockedOrder, now, lockedWaitingExtensionSeconds) :
      null,
  [lockedOrder, selectedDriver?.u_id, now, lockedWaitingExtensionSeconds])
  const lockedVotingRemainingText = lockedVotingRemainingSeconds !== null ?
    formatChoiceRemainingSeconds(lockedVotingRemainingSeconds) :
    ''
  const lockedVotingTimerState = useMemo(() => {
    if (lockedVotingRemainingSeconds === null)
      return 'normal'
    if (lockedVotingRemainingSeconds <= 5)
      return 'critical'
    if (lockedVotingRemainingSeconds <= 10)
      return 'warning'
    if (lockedVotingRemainingSeconds <= 20)
      return 'attention'
    return 'normal'
  }, [lockedVotingRemainingSeconds])

  useEffect(() => {
    if (
      !lockedOrder?.b_id ||
      !isVotingOrder(lockedOrder) ||
      selectedDriver ||
      lockedVotingRemainingSeconds === null ||
      lockedVotingRemainingSeconds > 0 ||
      canceling
    )
      return

    const orderId = lockedOrder.b_id
    if (expiredChoiceOrdersRef.current[String(orderId)])
      return

    expiredChoiceOrdersRef.current[String(orderId)] = true
    ;(async() => {
      try {
        if (onLockedCancel)
          await onLockedCancel(orderId)
        else
          await API.cancelDrive(orderId)
      } catch (error) {
        console.error(error)
      } finally {
        refreshActiveOrders()
      }
    })()
  }, [
    lockedOrder?.b_id,
    selectedDriver?.u_id,
    lockedVotingRemainingSeconds,
    canceling,
    onLockedCancel,
    refreshActiveOrders,
  ])

  const handleOpenLockedVotingDetails = useCallback((event?: React.MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    event?.stopPropagation()

    if (!lockedOrder?.b_id || selectedDriver || extendingLockedWaiting)
      return

    const additionalTime = getChoiceWaitingIntervalSeconds()
    const previousWaitingTime = getChoiceOrderMaxWaitingSeconds(lockedOrder) + lockedWaitingExtensionSeconds

    setExtendingLockedWaiting(true)
    API.setWaitingTime(lockedOrder.b_id, previousWaitingTime, additionalTime)
      .then(() => {
        setLockedWaitingExtensionSeconds(prev => prev + additionalTime)
        setLockedWaitingExtendSuccess(true)
        if (lockedWaitingExtendSuccessTimeoutRef.current !== null)
          window.clearTimeout(lockedWaitingExtendSuccessTimeoutRef.current)
        lockedWaitingExtendSuccessTimeoutRef.current = window.setTimeout(() => {
          setLockedWaitingExtendSuccess(false)
          lockedWaitingExtendSuccessTimeoutRef.current = null
        }, 600)
        setIsExpanded(true)
        refreshActiveOrders()
      })
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
      .finally(() => setExtendingLockedWaiting(false))
  }, [
    lockedOrder,
    lockedWaitingExtensionSeconds,
    selectedDriver?.u_id,
    extendingLockedWaiting,
    refreshActiveOrders,
    setIsExpanded,
    setMessageModal,
  ])

  const handleChooseCandidate = useCallback(async(event: React.MouseEvent, candidateId: IUser['u_id']) => {
    event.preventDefault()
    event.stopPropagation()

    const nextCandidateId = candidateId

    if (!lockedOrder?.b_id || !nextCandidateId || submitting || canceling)
      return

    writeFlowEvent('SELECT_DRIVER', {
      orderId: lockedOrder.b_id,
      driverId: nextCandidateId,
      screen: 'PassengerVotingForm',
      uiState: 'DriverSelectionRequested',
      data: {
        orderId: lockedOrder.b_id,
        driverId: nextCandidateId,
        candidatesCount: lockedOrder.drivers?.length ?? 0,
      },
    })

    setSubmitting(true)
    try {
      const releaseIds = Array.from(new Set([
        ...getChoiceDriverIdsToReleaseBeforeChoosing(lockedOrder, nextCandidateId),
        ...rejectedChoiceIds
          .map(String)
          .filter(rejectedId => rejectedId && rejectedId !== String(nextCandidateId)),
      ]))

      // Сначала пробуем снять назначение на уровне заказа.
      // На части backend-версий после отмены выбранного водителя заказ всё ещё
      // считается занятым старым performer, и следующий выбор падает с ошибкой.
      try {
        await API.releaseCandidateChoice(lockedOrder.b_id)
      } catch (error) {
        console.error(error)
      }

      for (const releaseId of releaseIds) {
        try {
          await API.releaseCandidateChoice(lockedOrder.b_id, releaseId)
        } catch (error) {
          console.error(error)
        }
      }

      try {
        await API.chooseCandidate(lockedOrder.b_id, nextCandidateId)
      } catch (error) {
        if (!isChoiceDriverSelectionBlockedError(error))
          throw error

        const hardReleaseIds = Array.from(new Set([
          ...releaseIds,
          ...(lockedOrder.drivers ?? [])
            .filter(driver =>
              String(driver.u_id ?? '') &&
              String(driver.u_id) !== String(nextCandidateId) &&
              [
                EBookingDriverState.Performer,
                EBookingDriverState.Arrived,
                EBookingDriverState.Started,
              ].includes(driver.c_state),
            )
            .map(driver => String(driver.u_id)),
        ]))

        try {
          await API.releaseCandidateChoice(lockedOrder.b_id)
        } catch (releaseError) {
          console.error(releaseError)
        }

        for (const releaseId of hardReleaseIds) {
          try {
            await API.releaseCandidateChoice(lockedOrder.b_id, releaseId)
          } catch (releaseError) {
            console.error(releaseError)
          }
        }

        await wait(650)
        await API.chooseCandidate(lockedOrder.b_id, nextCandidateId)
      }

      setPassengerConfirmedChoice(lockedOrder.b_id, nextCandidateId)
      setConfirmedChoiceId(nextCandidateId)
      writeFlowEvent('ORDER_SEARCH_FINISHED', {
        orderId: lockedOrder.b_id,
        driverId: nextCandidateId,
        screen: 'PassengerVotingForm',
        uiState: 'DriverSelected',
        data: {
          orderId: lockedOrder.b_id,
          driverId: nextCandidateId,
          reason: 'client_selected_driver',
        },
      })
      refreshActiveOrders()
      setIsExpanded(false)
    } catch (error) {
      console.error(error)

      if (canUseLocalChoiceFallback(lockedOrder, nextCandidateId, rejectedChoiceIds)) {
        setPassengerConfirmedChoice(lockedOrder.b_id, nextCandidateId)
        setConfirmedChoiceId(nextCandidateId)
        writeFlowEvent('ORDER_SEARCH_FINISHED', {
          orderId: lockedOrder.b_id,
          driverId: nextCandidateId,
          screen: 'PassengerVotingForm',
          uiState: 'DriverSelectedLocalFallback',
          data: {
            orderId: lockedOrder.b_id,
            driverId: nextCandidateId,
            reason: 'local_choice_fallback',
          },
        })
        refreshActiveOrders()
        setIsExpanded(false)
        return
      }

      writeFlowEvent('ERROR_SHOWN_TO_CLIENT', {
        orderId: lockedOrder.b_id,
        driverId: nextCandidateId,
        screen: 'PassengerVotingForm',
        uiState: 'DriverSelectionError',
        data: {
          orderId: lockedOrder.b_id,
          driverId: nextCandidateId,
          message: t(TRANSLATION.CLIENT_DRIVER_SELECT_ERROR),
        },
      })
      setMessageModal({
        isOpen: true,
        status: EStatuses.Fail,
        message: t(TRANSLATION.CLIENT_DRIVER_SELECT_ERROR),
      })
    } finally {
      setSubmitting(false)
    }
  }, [
    lockedOrder,
    submitting,
    canceling,
    rejectedChoiceIds.map(String).sort().join('|'),
    refreshActiveOrders,
    setIsExpanded,
    setMessageModal,
  ])


  const handleCancelSelectedDriverClick = useCallback((event?: React.MouseEvent) => {
    event?.preventDefault()
    event?.stopPropagation()

    if (!lockedOrder?.b_id || !selectedDriver?.u_id || canceling)
      return

    setDriverCancelTarget({ orderId: lockedOrder.b_id, driverId: selectedDriver.u_id })
    setDriverCancelReasonModalOpen(true)
  }, [
    lockedOrder?.b_id,
    selectedDriver?.u_id,
    canceling,
  ])

  const handleCloseDriverCancelReasonModal = useCallback(() => {
    if (canceling)
      return

    setDriverCancelReasonModalOpen(false)
    setDriverCancelTarget(null)
  }, [canceling])

  const handleConfirmCancelSelectedDriver = useCallback((reason?: string) => {
    const orderId = driverCancelTarget?.orderId ?? lockedOrder?.b_id
    const driverId = driverCancelTarget?.driverId ?? selectedDriver?.u_id

    if (!orderId || !driverId || canceling)
      return

    setSubmitError(null)
    setCanceling(true)

    ;(async() => {
      let releasedByBackend = false
      try {
        await API.releaseCandidateChoice(orderId, driverId)
        releasedByBackend = true
      } catch (error) {
        console.error(error, reason)
      }

      if (!releasedByBackend) {
        try {
          await API.releaseCandidateChoice(orderId)
          releasedByBackend = true
        } catch (error) {
          console.error(error)
        }
      }

      if (!releasedByBackend)
        throw new Error('backend_release_candidate_failed')

      addPassengerRejectedChoice(orderId, driverId)
      restartPassengerChoiceSearch(orderId)
      clearPassengerConfirmedChoice(orderId, driverId)
      setRejectedChoiceIds(getPassengerRejectedChoices(orderId))
      setConfirmedChoiceId(null)
      clearPassengerChoiceWaitingExtension(orderId)
      setLockedWaitingExtensionSeconds(0)
      setIsExpanded(true)
      setDriverCancelReasonModalOpen(false)
    })()
      .catch(error => {
        console.error(error)
        setMessageModal({
          isOpen: true,
          message: t(TRANSLATION.ERROR),
          status: EStatuses.Fail,
        })
      })
      .finally(() => {
        refreshActiveOrders()
        setCanceling(false)
        setDriverCancelTarget(null)
      })
  }, [
    driverCancelTarget,
    lockedOrder,
    selectedDriver?.u_id,
    canceling,
    setIsExpanded,
    refreshActiveOrders,
    setMessageModal,
  ])


  const handleLockedCustomerPriceCommit = useCallback((value: number) => {
    const safeValue = Math.max(0, Math.round(Number(value) || 0))
    const floorValue = Math.max(0, lockedCustomerPrice)

    if (!lockedOrder || selectedDriver || savingLockedCustomerPrice || safeValue <= floorValue) {
      setCustomerPrice(floorValue)
      return
    }

    setSubmitError(null)
    setSavingLockedCustomerPrice(true)
    setLockedCustomerPriceOverride({ orderId: lockedOrder.b_id, price: safeValue })
    setCustomerPrice(safeValue)

    API.updateOrderCustomerPrice(lockedOrder, safeValue)
      .then(() => {
        refreshActiveOrders()
      })
      .catch(error => {
        console.error(error)
        setLockedCustomerPriceOverride(null)
        setCustomerPrice(floorValue)
        setSubmitError(getSafeSubmitErrorMessage(error))
        refreshActiveOrders()
      })
      .finally(() => setSavingLockedCustomerPrice(false))
  }, [
    lockedOrder,
    selectedDriver,
    savingLockedCustomerPrice,
    lockedCustomerPrice,
    setCustomerPrice,
    refreshActiveOrders,
  ])

  const handleLockedCancelClick = useCallback(async(event?: React.MouseEvent) => {
    event?.preventDefault()
    event?.stopPropagation()

    if (!lockedOrderId || canceling || !onLockedCancel)
      return

    setSubmitError(null)
    setCanceling(true)
    try {
      await onLockedCancel(lockedOrderId)
    } catch (error) {
      console.error(error)
      setSubmitError(getSafeSubmitErrorMessage(error))
    }
    setCanceling(false)
  }, [lockedOrderId, canceling, onLockedCancel])

  const handleLockedFinishClick = useCallback(async(event?: React.MouseEvent) => {
    event?.preventDefault()
    event?.stopPropagation()

    if (!lockedOrderId || finishing)
      return

    setSubmitError(null)
    setFinishing(true)
    try {
      await API.setOrderState(lockedOrderId, EBookingDriverState.Finished)
      setPickupPrice(null)
      refreshActiveOrders()
      setRatingModal({ isOpen: true, orderID: lockedOrderId })
    } catch (error) {
      console.error(error)
      setSubmitError(getSafeSubmitErrorMessage(error))
    }
    setFinishing(false)
  }, [lockedOrderId, finishing, refreshActiveOrders, setPickupPrice, setRatingModal])

  const handleNewOrderClick = useCallback((event?: React.MouseEvent) => {
    event?.preventDefault()
    event?.stopPropagation()
    onNewOrder && onNewOrder()
  }, [onNewOrder])

  const handleSavePhoneClick = useCallback((event?: React.MouseEvent) => {
    event?.preventDefault()
    event?.stopPropagation()

    const normalizedPhone = String(phone ?? '').replace(/\D/g, '')
    if (!normalizedPhone) {
      setPhoneError(t(TRANSLATION.PHONE_PATTERN_ERROR))
      return
    }

    try {
      window.localStorage.setItem(PASSENGER_SAVED_PHONE_KEY, normalizedPhone)
      setPhone(Number(normalizedPhone))
    } catch (error) {
      console.error(error)
    }
  }, [phone, setPhone])

  const modeButtons = getClientModeButtons(preferOfferMode)

  const submitButtons = (
    <div className="passenger-voting-form__order-button-wrapper passenger-voting-form__order-button-wrapper--modes">
      {modeButtons.map(button => {
        const selected = selectedMode === button.mode
        const compact = button.compact
        const text = compact ? undefined : button.text

        return (
          <Button
            key={button.mode}
            wrapperProps={{
              className: [
                'passenger-voting-form__order-button',
                'passenger-voting-form__mode-button',
                `passenger-voting-form__mode-button--${button.mode}`,
                button.recommended ? 'passenger-voting-form__mode-button--recommended' : '',
                compact ? 'passenger-voting-form__mode-button--compact' : '',
                selected ? 'passenger-voting-form__mode-button--selected' : '',
              ].filter(Boolean).join(' '),
            }}
            imageProps={{
              src: button.icon,
              className: 'passenger-voting-form__mode-button-icon',
            }}
            buttonStyle={EButtonStyles.RedDesign}
            type="submit"
            checkLogin={false}
            text={text}
            title={button.text}
            aria-label={button.text}
            onClick={() => {
              setSelectedMode(button.mode)
              submit(button.mode)
            }}
            disabled={!available || submitting}
          />
        )
      })}
      {submitError &&
        <span className="passenger-voting-form__order-button-error">
          {submitError}
        </span>
      }
    </div>
  )

  const showLockedDriverPanel = Boolean(selectedDriver) && isBlockVisible('driverCard')
  const isLockedTripStarted = selectedDriver?.c_state === EBookingDriverState.Started
  const selectedDriverColor = selectedDriver ? getDriverColor(selectedDriver, lockedOrder?.drivers ?? [selectedDriver]) : ''
  const selectedDriverOffer = selectedDriver ? getDriverOfferInfo(selectedDriver, lockedOrder ?? null) : null
  const selectedDriverOfferExpanded = Boolean(lockedDriverOfferExpanded || isLockedTripStarted)
  const shouldShowSelectedOfferDetails = Boolean(lockedOrder && selectedDriver && isOfferOrder(lockedOrder))
  const canCancelSelectedDriver = Boolean(selectedDriver && [
    EBookingDriverState.Considering,
    EBookingDriverState.Performer,
  ].includes(selectedDriver.c_state))

  const lockedDriverPanel = locked && lockedOrder && selectedDriver && showLockedDriverPanel ? (
    <div className={`passenger-voting-form__driver-panel passenger-voting-form__driver-panel--${getLockedDriverStatusKey(selectedDriver)}`}>
      <div className="passenger-voting-form__driver-status-row">
        <span className="passenger-voting-form__driver-status-icon" aria-hidden="true">
          <DriverMiniStatusIcon state={selectedDriver.c_state} />
        </span>
        <div className="passenger-voting-form__driver-status-copy">
          <b>{getLockedDriverStatusText(selectedDriver)}</b>
          <small>{getLockedDriverStatusSubtitle(selectedDriver, lockedOrder, now)}</small>
        </div>
      </div>
      <div className="passenger-voting-form__driver-card">
        <button
          type="button"
          className="passenger-voting-form__driver-avatar-button"
          onClick={event => {
            event.preventDefault()
            event.stopPropagation()
            if (shouldShowSelectedOfferDetails)
              setLockedDriverOfferExpanded(prev => !prev)
          }}
          aria-label={shouldShowSelectedOfferDetails ? t(TRANSLATION.DRIVER_OFFER_COMMENT) : getDriverName(selectedDriver, selectedDriverUser)}
        >
          <img
            src={getAvatarSrc(selectedDriverUser, selectedDriver)}
            alt={getDriverName(selectedDriver, selectedDriverUser)}
            onError={event => {
              event.currentTarget.onerror = null
              event.currentTarget.src = DRIVER_AVATAR_FALLBACK
            }}
          />
          {shouldShowSelectedOfferDetails && <span aria-hidden="true">•••</span>}
        </button>
        <div className="passenger-voting-form__driver-main">
          <strong>{getDriverName(selectedDriver, selectedDriverUser)}</strong>
          <span>{getCarText(selectedDriverCar)}</span>
          {selectedDriverCar?.registration_plate || selectedDriver.c_id ? <em>{selectedDriverCar?.registration_plate || selectedDriver.c_id}</em> : null}
        </div>
        <span className="passenger-voting-form__driver-class-row">
          {selectedDriverColor && (
            <span
              className="passenger-voting-form__driver-color-dot"
              style={{ backgroundColor: selectedDriverColor }}
              aria-hidden="true"
            />
          )}
          <CarClassBadge kind={getCandidateCarClassKind(selectedDriverCar, lockedOrder)} compact className="passenger-voting-form__driver-class" />
        </span>
        {canCancelSelectedDriver && (
          <button
            type="button"
            className="passenger-voting-form__driver-cancel"
            disabled={canceling}
            onClick={handleCancelSelectedDriverClick}
          >
            {canceling ? t(TRANSLATION.LOADING) : t(TRANSLATION.CANCEL, { toUpper: false })}
          </button>
        )}
        {(selectedDriverUser?.u_phone || selectedDriver.user?.u_phone) && (
          <button
            type="button"
            className="passenger-voting-form__driver-call"
            onClick={event => {
              event.preventDefault()
              event.stopPropagation()
              const driverPhone = selectedDriverUser?.u_phone || selectedDriver.user?.u_phone
              if (driverPhone) window.location.href = `tel:${driverPhone}`
            }}
            aria-label={t(TRANSLATION.PHONE_TO_CALL)}
          >
            <PhoneMiniIcon />
          </button>
        )}
      </div>
      {shouldShowSelectedOfferDetails && (
        <div className="passenger-voting-form__selected-offer">
          <div className="passenger-voting-form__selected-offer-row">
            <span>{t(TRANSLATION.CUSTOMER_PRICE)}</span>
            <strong>{formatOfferPrice(lockedCustomerPrice)}</strong>
          </div>
          {selectedDriverOfferExpanded && (
            <>
              <div className="passenger-voting-form__selected-offer-row">
                <span>{t(TRANSLATION.DRIVER_OFFER_PRICE)}</span>
                <strong>{formatOfferPrice(selectedDriverOffer?.price) || '—'}</strong>
              </div>
              <div className="passenger-voting-form__selected-offer-row">
                <span>{t(TRANSLATION.DRIVER_OFFER_ETA)}</span>
                <strong>{selectedDriverOffer?.eta || '—'}</strong>
              </div>
              <div className="passenger-voting-form__selected-offer-row">
                <span>{t(TRANSLATION.DRIVER_OFFER_COMMENT)}</span>
                <strong>{selectedDriverOffer?.comment || '—'}</strong>
              </div>
            </>
          )}
        </div>
      )}
      {shouldShowDriverDoorNumber(selectedDriver) && (
        <div className="passenger-voting-form__boarding-code passenger-voting-form__boarding-code--door-number">
          <span className="passenger-voting-form__boarding-code-icon" aria-hidden="true">
            <BoardingCodeMiniIcon />
          </span>
          <span className="passenger-voting-form__boarding-code-label">{t(TRANSLATION.DRIVE_NUMBER)}</span>
          <input
            className="passenger-voting-form__door-number-input"
            value={selectedDoorNumber}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="000"
            aria-label={t(TRANSLATION.DRIVE_NUMBER)}
            onChange={event => setSelectedDoorNumber(normalizeDriverDoorNumber(event.target.value))}
          />
        </div>
      )}
    </div>
  ) : null

  const lockedButtons = locked && (
    <div className="passenger-voting-form__order-button-wrapper passenger-voting-form__order-button-wrapper--locked">
      {(!activeUiConfig ? !isLockedTripStarted : activeUiConfig.showCancel) && (
        <Button
          wrapperProps={{ className: 'passenger-voting-form__order-button passenger-voting-form__order-button--cancel' }}
          buttonStyle={EButtonStyles.RedDesign}
          type="button"
          checkLogin={false}
          text={canceling ? t(TRANSLATION.LOADING) : t(TRANSLATION.CANCEL, { toUpper: false })}
          onClick={handleLockedCancelClick}
          disabled={!lockedOrderId || canceling}
        />
      )}
      <Button
        wrapperProps={{ className: 'passenger-voting-form__order-button passenger-voting-form__order-button--new-order' }}
        buttonStyle={EButtonStyles.RedDesign}
        type="button"
        checkLogin={false}
        text="↔"
        onClick={handleNewOrderClick}
      />
      {submitError &&
        <span className="passenger-voting-form__order-button-error">
          {submitError}
        </span>
      }
    </div>
  )

  const lockedCandidates = locked && lockedOrder && !selectedDriver && isBlockVisible('candidateList') && (isExpanded || candidateDrivers.length > 0) ? (
    <div className="passenger-voting-form__candidates">
      <div className={`passenger-voting-form__candidates-title${lockedVotingRemainingText ? ' passenger-voting-form__candidates-title--with-waiting-timer' : ''}`}>
        {t(TRANSLATION.CLIENT_CHOOSE_DRIVER)}
        <span>
          {t(TRANSLATION.CLIENT_RESPONSES_COUNT)}: {candidateDrivers.length}
          {lockedVotingRemainingText ? (
            <button
              type="button"
              className={`passenger-voting-form__waiting-extend passenger-voting-form__waiting-extend--${lockedVotingTimerState}${lockedWaitingExtendSuccess ? ' passenger-voting-form__waiting-extend--success' : ''}`}
              onClick={handleOpenLockedVotingDetails}
              disabled={extendingLockedWaiting}
              title={t(TRANSLATION.CLIENT_CHOOSE_DRIVER)}
            >
              <span className="passenger-voting-form__waiting-extend-time">{lockedVotingRemainingText}</span>
              <span
                aria-hidden="true"
                className="passenger-voting-form__waiting-extend-arrow"
              >
                <span className="passenger-voting-form__waiting-extend-arrow-symbol">↑</span>
              </span>
            </button>
          ) : null}
        </span>
      </div>
      {candidateDrivers.length ? (
        <>
          <div className="passenger-voting-form__candidate-list">
            {candidateDrivers.map(candidate => {
              const candidateUser = candidateUsers.find(item => item.u_id === candidate.u_id) ??
                (candidate.user?.u_id ? candidate.user as IUser : null)
              const candidateCar = candidateCars.find(item => item.c_id === candidate.c_id) ?? null
              const isActive = activeCandidate === candidate.u_id
              const isHeld = heldCandidate === candidate.u_id
              const isExpandedCandidate = isActive || isHeld
              const offer = getDriverOfferInfo(candidate, lockedOrder ?? null)
              const pickupEta = getCandidatePickupEtaText(candidate, lockedOrder ?? null, getPassengerPickupEta(lockedOrder?.b_id, candidate))
              const seatsText = getFirstFilledOfferValue(offer.seats) || '—'
              const candidateCarClassKind = getCandidateCarClassKind(candidateCar, lockedOrder ?? null)
              const candidateColor = getDriverColor(candidate, lockedOrder?.drivers ?? candidateDrivers)
              const sideValue = requestIsOffer ? formatOfferPrice(offer.price) : pickupEta
              const sideLabel = requestIsOffer ? '' : t(TRANSLATION.CLIENT_PICKUP_ETA)

              return (
                <div
                  key={candidate.u_id}
                  className={`passenger-voting-form__candidate${isActive ? ' is-active' : ''}${isExpandedCandidate ? ' is-held' : ''}`}
                  onClick={() => setActiveCandidate(prev => prev === candidate.u_id ? null : candidate.u_id)}
                  onPointerDown={() => setHeldCandidate(candidate.u_id)}
                  onPointerUp={() => setHeldCandidate(null)}
                  onPointerCancel={() => setHeldCandidate(null)}
                  onPointerLeave={() => setHeldCandidate(null)}
                  onMouseDown={() => setHeldCandidate(candidate.u_id)}
                  onMouseUp={() => setHeldCandidate(null)}
                  onMouseLeave={() => setHeldCandidate(null)}
                  onTouchStart={() => setHeldCandidate(candidate.u_id)}
                  onTouchEnd={() => setHeldCandidate(null)}
                  onTouchCancel={() => setHeldCandidate(null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                    }
                  }}
                >
                  <img
                    src={getAvatarSrc(candidateUser, candidate)}
                    onError={event => {
                      event.currentTarget.onerror = null
                      event.currentTarget.src = DRIVER_AVATAR_FALLBACK
                    }}
                    alt={getDriverName(candidate, candidateUser)}
                  />
                  <span className="passenger-voting-form__candidate-main">
                    <b>{getDriverName(candidate, candidateUser)}</b>
                    <small>{getDriverCarText(candidate, candidateCar)}</small>
                    {!isExpandedCandidate && (
                      <small className="passenger-voting-form__candidate-hint">
                        {t(TRANSLATION.CLIENT_CANDIDATE_HOLD_HINT)}
                      </small>
                    )}
                    {isExpandedCandidate && (
                      <>
                        <em>
                          {[
                            `${t(TRANSLATION.CLIENT_PICKUP_ETA)}: ${pickupEta}`,
                            `${t(TRANSLATION.CLIENT_ROUTE_DURATION)}: ${getOrderTravelTimeText(lockedOrder)}`,
                            `${t(TRANSLATION.DRIVER_OFFER_SEATS)}: ${seatsText}`,
                          ].join(' · ')}
                        </em>
                        <i className="passenger-voting-form__candidate-comment">
                          {t(TRANSLATION.DRIVER_OFFER_COMMENT)}: {offer.comment || getCandidateFallbackComment(candidate, lockedOrder ?? null)}
                        </i>
                      </>
                    )}
                  </span>
                  <span className="passenger-voting-form__candidate-side">
                    {sideValue ? (
                      <span className={`passenger-voting-form__candidate-side-value${requestIsOffer ? ' passenger-voting-form__candidate-side-value--price' : ' passenger-voting-form__candidate-side-value--eta'}`}>
                        <strong>{sideValue}</strong>
                        {sideLabel ? <small>{sideLabel}</small> : null}
                      </span>
                    ) : null}
                    <span className="passenger-voting-form__candidate-actions">
                      <span
                        className="passenger-voting-form__driver-color-dot passenger-voting-form__driver-color-dot--candidate"
                        style={{ backgroundColor: candidateColor }}
                        aria-hidden="true"
                      />
                      <CarClassBadge
                        kind={candidateCarClassKind}
                        compact
                        className="passenger-voting-form__candidate-class"
                      />
                      <button
                        type="button"
                        className="passenger-voting-form__candidate-select"
                        disabled={submitting || canceling}
                        onPointerDown={event => event.stopPropagation()}
                        onMouseDown={event => event.stopPropagation()}
                        onTouchStart={event => event.stopPropagation()}
                        onClick={event => handleChooseCandidate(event, candidate.u_id)}
                      >
                        {(submitting && isActive) || canceling ? t(TRANSLATION.LOADING) : t(TRANSLATION.SELECT)}
                      </button>
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="passenger-voting-form__empty">
          {t(TRANSLATION.CLIENT_NO_DRIVER_RESPONSES)}
        </div>
      )}
    </div>
  ) : null

  return (
    <>
      <form
      className={`passenger-voting-form${locked ? ' passenger-voting-form--locked' : ''}`}
      data-ui-state={activeUiConfig?.state}
      data-ui-sheet={activeUiConfig?.bottomSheet}
      onSubmit={event => {
        event.preventDefault()
      }}
    >
      <div
        ref={minimizedPartRef as React.Ref<HTMLDivElement>}
        className="passenger-voting-form__group"
      >
        <div className="passenger-voting-form__location-wrapper">
          {locked ? (
            <>
              <ReadonlyLocationInput
                className="passenger-voting-form__input"
                value={lockedInfo.fromAddress}
                placeholder={t(TRANSLATION.START_POINT)}
              />
              <ReadonlyLocationInput
                className="passenger-voting-form__input"
                value={lockedInfo.toAddress}
                placeholder={t(TRANSLATION.DESTINATION_POINT)}
              />
            </>
          ) : (
            <>
              <LocationInput
                className="passenger-voting-form__input"
                type={EPointType.From}
                onOpenMap={syncFrom}
                error={fromError ?? undefined}
              />
              <LocationInput
                className="passenger-voting-form__input"
                type={EPointType.To}
                onOpenMap={syncTo}
                error={toError ?? undefined}
              />
            </>
          )}
        </div>

        {lockedCandidates}
        {lockedDriverPanel}

        {!locked && !isExpanded && <ShortInfo />}
        {locked && !isExpanded && (
          <ShortInfo
            className="passenger-voting-form__activity-info"
            showActivityDot={!selectedDriver}
            activityCount={!selectedDriver ? candidateDrivers.length : undefined}
            activityLabel={!selectedDriver ? lockedActivityLabel : ''}
            onActivityClick={canOpenLockedActivity ? () => setIsExpanded(true) : undefined}
          />
        )}

        {!isExpanded && (locked ? lockedButtons : submitButtons)}
      </div>

      {!locked && isExpanded && <div className="passenger-voting-form__seats-and-time">
        <div className="passenger-voting-form__seats">
          <span className="passenger-voting-form__seats-title">
            {t(TRANSLATION.SEATS)}
          </span>
          <div ref={seatSliderRef}>
            <SeatSlider />
          </div>
        </div>

        <div className="passenger-voting-form__time">
          <div className="passenger-voting-form__time-wrapper">
            <span className="passenger-voting-form__time-title">
              {t(TRANSLATION.START_TIME)}
            </span>
            <span className="passenger-voting-form__time-value">
              {time === 'now' ?
                t(TRANSLATION.NOW) :
                time.format('DD.MM.YYYY HH:mm')
              }
            </span>
          </div>
          <button
            type="button"
            className="passenger-voting-form__time-btn"
            onClick={() => setPickTimeModal(true)}
          >
            <Icon src="alarm" className="passenger-voting-form__time-icon" />
          </button>
        </div>
      </div>}

      {!locked && isExpanded && (
        <div className="passenger-voting-form__car-class">
          <div className="passenger-voting-form__car-class-header">
            <span className="passenger-voting-form__car-class-title">
              {t(TRANSLATION.AUTO_CLASS)}
            </span>
            <div className="passenger-voting-form__car-nearby-info">
              <Icon
                src="carNearby"
                className="passenger-voting-form__car-nearby-icon"
              />
              <span className="passenger-voting-form__car-nearby-info-text">{7} {t(TRANSLATION.CLIENT_NEARBY_CARS)}</span>
            </div>
            <div className="passenger-voting-form__car-nearby-info">
              <Icon
                src="timeWait"
                className="passenger-voting-form__waiting-time-icon"
              />
              <span className="passenger-voting-form__car-nearby-info-text">{t(TRANSLATION.CLIENT_ROUTE_DURATION)} ~{5} {t(TRANSLATION.MINUTES)}</span>
            </div>
          </div>
          <div ref={carSliderRef}>
            <CarClassSlider />
          </div>
        </div>
      )}

      {!locked && isExpanded && (
        <div className="passenger-voting-form__comments">
          <div className="passenger-voting-form__comments-wrapper">
            <span className="passenger-voting-form__comments-title">
              {t(TRANSLATION.COMMENT)}
            </span>
            <span className="passenger-voting-form__comments-value">
              {comments.ids.map(id =>
                stripLeadingEmoji(t(TRANSLATION.BOOKING_COMMENTS[id])),
              ).join(', ') || '-'}
            </span>
          </div>
          <button
            type="button"
            className="passenger-voting-form__comments-btn"
            onClick={() => setCommentsModal(true)}
          >
            <img src={images.seatSliderArrowRight} width={16} />
          </button>
        </div>
      )}

      {!locked && isExpanded && (
        <Input
          fieldWrapperClassName="passenger-voting-form__input"
          inputProps={{
            value: phone ?? '',
          }}
          inputType={EInputTypes.MaskedPhone}
          style={EInputStyles.RedDesign}
          buttons={[
            ...(user?.u_phone ? [{
              src: images.checkMarkRed,
              title: t(TRANSLATION.PHONE),
              onClick() {
                setPhone(+user!.u_phone!)
              },
            }] : []),
            {
              text: '*',
              title: t(TRANSLATION.SAVE),
              className: 'passenger-voting-form__phone-save-button',
              onClick: handleSavePhoneClick,
              checkLogin: false,
              fixedSize: false,
            },
          ]}
          error={phoneError ?? undefined}
          onChange={(e) => {
            setPhone(e as number)
          }}
        />
      )}
      {!locked && isExpanded && showPriceFields &&
        <div
          ref={priceInputRef}
          className="passenger-voting-form__input passenger-voting-form__price-input-touch-zone"
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <PriceInput
            forceCustomerPrice
            customerOfferEditable={selectedMode === null || selectedMode === 'offer'}
          />
        </div>
      }

      {locked && isExpanded && lockedButtons}

      {locked && isExpanded && showPriceFields &&
        <div
          ref={priceInputRef}
          className="passenger-voting-form__input passenger-voting-form__price-input-touch-zone"
          onPointerDown={event => event.stopPropagation()}
          onMouseDown={event => event.stopPropagation()}
          onTouchStart={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          <PriceInput
            disabled={isLockedCustomerPriceDisabled}
            forceCustomerPrice
            customerOfferEditable={requestIsOffer}
            pickupIncreaseOnly={canIncreaseLockedCustomerPrice && !requestIsOffer}
            minPickupPrice={requestIsOffer ? null : lockedCustomerPrice}
            increaseOnly={canIncreaseLockedCustomerPrice}
            minCustomerPrice={lockedCustomerPrice}
            onCustomerPriceCommit={handleLockedCustomerPriceCommit}
          />
        </div>
      }


      {isExpanded && !locked && submitButtons}

      </form>
      <DriverChoiceCancelReasonModal
        isOpen={driverCancelReasonModalOpen}
        isSubmitting={canceling}
        onClose={handleCloseDriverCancelReasonModal}
        onConfirm={handleConfirmCancelSelectedDriver}
      />
    </>
  )
}

export default connector(VotingForm)


function getLockedCustomerPrice(order: IOrder | null, draft: IRequestOrderDraft | null) {
  return normalizeCustomerPriceValue(
    order?.b_options?.customer_price ??
    (order?.b_options as any)?.customerPrice ??
    (order as any)?.customer_price ??
    (order as any)?.b_customer_price ??
    draft?.price ??
    null,
  )
}

function normalizeCustomerPriceValue(value?: number | string | null) {
  if (value === undefined || value === null || value === '')
    return null

  const numberValue = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''))

  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : null
}

function formatChoiceRemainingSeconds(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60

  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function getChoiceOrderRemainingSeconds(order: IOrder, now: number = Date.now(), extraSeconds: number = 0) {
  const restartedAt = getPassengerChoiceSearchRestartedAt(order.b_id)
  if (restartedAt) {
    return getChoiceOrderEffectiveMaxWaitingSeconds(order, extraSeconds) - Math.max(0, (now - restartedAt) / 1000)
  }

  const maxWaiting = getChoiceOrderEffectiveMaxWaitingSeconds(order, extraSeconds)
  const startedAt = getOrderCreatedTimestamp(order)

  if (startedAt && maxWaiting)
    return maxWaiting - Math.max(0, (now - startedAt) / 1000)

  const stableRemaining = getStableRemainingLifetimeSeconds(order, now)
  if (stableRemaining !== null)
    return Math.min(MAX_CHOICE_WAITING_SECONDS, stableRemaining)

  return null
}

const MAX_CHOICE_WAITING_SECONDS = 1800
const MAX_TRUSTED_BACKEND_CHOICE_WAITING_SECONDS = 900

function getChoiceOrderMaxWaitingSeconds(_order: IOrder | null | undefined) {
  const backendWaiting = normalizeSeconds(_order?.b_max_waiting, 0)
  return backendWaiting > 0 && backendWaiting <= MAX_TRUSTED_BACKEND_CHOICE_WAITING_SECONDS ?
    backendWaiting :
    getChoiceWaitingIntervalSeconds()
}

function getChoiceOrderEffectiveMaxWaitingSeconds(order: IOrder | null | undefined, extraSeconds: number = 0) {
  const baseWaiting = getChoiceOrderMaxWaitingSeconds(order)
  return Math.min(MAX_CHOICE_WAITING_SECONDS, baseWaiting + normalizeSeconds(extraSeconds))
}

function getChoiceWaitingIntervalSeconds() {
  return 180
}

function getChoiceOrderElapsedSeconds(order: IOrder) {
  const startedAt = getOrderCreatedTimestamp(order)
  if (!startedAt)
    return null

  return Math.max(0, Math.round((Date.now() - startedAt) / 1000))
}

function normalizeSeconds(value: unknown, fallback: number = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.max(0, Math.round(numberValue)) : fallback
}

function getOrderCreatedTimestamp(order: IOrder) {
  return getReliableTimestamp(order.b_created || order.b_start_datetime)
}

function getLockedDriverStatusKey(driver: IDriver) {
  if (driver.c_state === EBookingDriverState.Started) return 'started'
  if (driver.c_state === EBookingDriverState.Arrived) return 'arrived'
  if (driver.c_state === EBookingDriverState.Finished) return 'finished'
  return 'selected'
}

function isDriverArrivedOrStarted(driver: IDriver | null) {
  return !!driver && [
    EBookingDriverState.Arrived,
    EBookingDriverState.Started,
    EBookingDriverState.Finished,
  ].includes(driver.c_state)
}


function getLockedDriverStatusText(driver: IDriver) {
  if (driver.c_state === EBookingDriverState.Started)
    return t(TRANSLATION.CLIENT_TRIP_STARTED_TITLE)
  if (driver.c_state === EBookingDriverState.Arrived)
    return t(TRANSLATION.CLIENT_DRIVER_ARRIVED_TITLE)
  if (driver.c_state === EBookingDriverState.Finished)
    return t(TRANSLATION.CLIENT_FINISH_TRIP)
  return t(TRANSLATION.CLIENT_DRIVER_ON_WAY_TITLE)
}

function getLockedDriverStatusSubtitle(driver: IDriver, order?: IOrder | null, now: number = Date.now()) {
  if (driver.c_state === EBookingDriverState.Started) {
    const elapsed = formatTripStartedDuration(driver, order, now)
    return elapsed ? `${t(TRANSLATION.CLIENT_ROUTE_DURATION)} ${elapsed}` : t(TRANSLATION.CLIENT_TRIP_STARTED_SUBTITLE)
  }
  if (driver.c_state === EBookingDriverState.Arrived)
    return t(TRANSLATION.CLIENT_DRIVER_ARRIVED)
  if (driver.c_state === EBookingDriverState.Performer) {
    const elapsed = formatDriverOnWayDuration(driver, order, now)
    return elapsed ? `${t(TRANSLATION.CLIENT_ROUTE_DURATION)} ${elapsed}` : t(TRANSLATION.CLIENT_DRIVER_ON_WAY_SUBTITLE)
  }
  return t(TRANSLATION.CLIENT_DRIVER_SELECTED_MESSAGE)
}

function formatDriverOnWayDuration(driver?: IDriver | null, order?: IOrder | null, now: number = Date.now()) {
  const startedAt = getDriverOnWayStartedAt(driver, order)
  if (!startedAt)
    return ''

  return formatDurationClock(Math.max(0, (now - startedAt) / 1000))
}

function formatTripStartedDuration(driver?: IDriver | null, order?: IOrder | null, now: number = Date.now()) {
  const startedAt = getDriverTripStartedAt(order, driver, now)
  if (!startedAt)
    return ''

  return formatDurationClock(Math.max(0, (now - startedAt) / 1000))
}

function getDriverOnWayStartedAt(driver?: IDriver | null, order?: IOrder | null) {
  const selectedStartedAt = getPassengerConfirmedChoiceStartedAt(order?.b_id, driver?.u_id)
  if (selectedStartedAt)
    return selectedStartedAt

  return getTimestamp(
    driver?.c_becomed_candidate ||
    (driver as any)?.c_created ||
    (driver as any)?.created_at ||
    (driver as any)?.createdAt ||
    (driver as any)?.c_started ||
    order?.b_select_datetime ||
    order?.b_confirmation_datetime ||
    order?.b_start_datetime ||
    order?.b_created,
  )
}

function getTimestamp(value: any) {
  return getReliableTimestamp(value)
}

function formatDurationClock(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60

  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

function getSafeSubmitErrorMessage(error: any) {
  const message = (error as any)?.message?.toString() || ''
  const lower = message.toLowerCase()

  if (lower.includes('point from select field'))
    return t(TRANSLATION.POINT_MUST_BE_SELECTED_ERROR)

  if (lower.includes('wrong c_options keys') || lower.includes('wrong b_options keys') || lower.includes('__gruzvill_emulator'))
    return t(TRANSLATION.ERROR)

  return message || t(TRANSLATION.ERROR)
}

function DriverMiniStatusIcon({ state }: { state?: EBookingDriverState }) {
  if (state === EBookingDriverState.Started) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5.2 16.4h8.4l-2.5 2.5a1.1 1.1 0 0 0 1.6 1.6l4.4-4.4a1.1 1.1 0 0 0 0-1.6l-4.4-4.4a1.1 1.1 0 1 0-1.6 1.6l2.5 2.5H5.2a1.1 1.1 0 1 0 0 2.2Z" fill="currentColor" />
        <path d="M4.4 6.7c0-1.5 1.2-2.7 2.7-2.7h6.8c1.5 0 2.7 1.2 2.7 2.7v1.4a1.1 1.1 0 1 1-2.2 0V6.7c0-.3-.2-.5-.5-.5H7.1c-.3 0-.5.2-.5.5v1.4a1.1 1.1 0 1 1-2.2 0V6.7Z" fill="currentColor" opacity=".72" />
      </svg>
    )
  }

  if (state === EBookingDriverState.Arrived) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 13.2 7.1 9.8A3.2 3.2 0 0 1 10.2 7.5h3.6a3.2 3.2 0 0 1 3.1 2.3l1.1 3.4h.4a1.6 1.6 0 0 1 1.6 1.6v2.1a1.6 1.6 0 0 1-1.6 1.6h-.9a2.2 2.2 0 0 1-4.1 0H10.6a2.2 2.2 0 0 1-4.1 0h-.9A1.6 1.6 0 0 1 4 16.9v-2.1a1.6 1.6 0 0 1 1.6-1.6H6Z" fill="currentColor" />
        <path d="m8.9 10.3-.7 2h7.6l-.7-2a1.4 1.4 0 0 0-1.3-.9h-3.6a1.4 1.4 0 0 0-1.3.9Z" fill="#fff" opacity=".95" />
        <path d="m10.4 16 1.1 1.1 2.6-2.8" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5.8 12.1 6.9 8.8c.4-1.1 1.4-1.8 2.6-1.8h5c1.2 0 2.2.7 2.6 1.8l1.1 3.3h.5c.7 0 1.3.6 1.3 1.3v2.4c0 .7-.6 1.3-1.3 1.3h-.8a1.9 1.9 0 0 1-3.6 0H9.7a1.9 1.9 0 0 1-3.6 0h-.8c-.7 0-1.3-.6-1.3-1.3v-2.4c0-.7.6-1.3 1.3-1.3h.5Z" fill="currentColor" />
      <path d="M8.4 9.2h7.2l.6 2H7.8l.6-2Z" fill="#fff" />
      <circle cx="8.3" cy="15" r="1" fill="#fff" />
      <circle cx="15.7" cy="15" r="1" fill="#fff" />
    </svg>
  )
}

function BoardingCodeMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="14" rx="4" fill="currentColor" opacity=".12" />
      <path d="M8.2 11.7a3.8 3.8 0 1 1 7 2.1l1.6 1.6a.9.9 0 0 1 0 1.3l-.7.7a.9.9 0 0 1-1.3 0l-1.6-1.6a3.8 3.8 0 0 1-5-4.1Zm3.8 2.1a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z" fill="currentColor" />
    </svg>
  )
}

function PhoneMiniIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.3 4.4 9 4c.7-.2 1.4.2 1.7.9l.7 1.8c.2.6 0 1.2-.4 1.6l-1 1c.8 1.7 2 3 3.8 3.8l1-1c.4-.4 1.1-.6 1.6-.4l1.8.7c.7.3 1 1 .9 1.7l-.4 1.7c-.2.8-.9 1.3-1.7 1.3C10.3 17.1 5 11.8 5 5.1c0-.8.5-1.5 1.3-1.7Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function isDelayedPickupTime(value: any) {
  if (!value || value === 'now')
    return false

  const pickupTime = moment.isMoment(value) ? value : moment(value)

  return pickupTime.isValid() && pickupTime.diff(moment(), 'minutes') > 15
}

function wait(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function getClientModeButtons(preferOfferMode: boolean) {
  const voteButton = {
    mode: 'vote' as TClientOrderMode,
    text: t(TRANSLATION.VOTE, { toUpper: false }),
    icon: images.peopleIcon,
    recommended: !preferOfferMode,
    compact: preferOfferMode,
  }
  const offerButton = {
    mode: 'offer' as TClientOrderMode,
    text: t('client_offer_short_button', { toUpper: false }),
    icon: images.moneyIcon,
    recommended: preferOfferMode,
    compact: !preferOfferMode,
  }
  const orderButton = {
    mode: 'order' as TClientOrderMode,
    text: t(TRANSLATION.TO_ORDER, { toUpper: false }),
    icon: images.carIcon,
    recommended: true,
    compact: false,
  }

  return preferOfferMode ? [offerButton, voteButton, orderButton] : [voteButton, offerButton, orderButton]
}

function ReadonlyLocationInput({ className, value, placeholder }: { className?: string, value?: string, placeholder?: string }) {
  return (
    <Input
      fieldWrapperClassName={className}
      inputProps={{
        placeholder,
        value: value || '',
        disabled: true,
        readOnly: true,
      }}
      style={EInputStyles.RedDesign}
      buttons={[
        { src: images.minusIcon },
        { src: images.pointOnMap },
      ]}
    />
  )
}

function getLockedInfo(order: IOrder | null, draft: IRequestOrderDraft | null) {
  return {
    fromAddress: order?.b_options?.fromShortAddress || order?.b_start_address || draft?.fromAddress,
    toAddress: order?.b_options?.toShortAddress || order?.b_destination_address || draft?.toAddress,
    phone: String(order?.b_contact ?? draft?.phone ?? ''),
  }
}

function getSelectedDriver(order: IOrder | null, confirmedChoiceId?: IUser['u_id'] | null) {
  if (!order)
    return null

  const drivers = order.drivers ?? []

  if (confirmedChoiceId) {
    const confirmedDriver = drivers.find(driver =>
      String(driver.u_id) === String(confirmedChoiceId) &&
      driver.c_state !== EBookingDriverState.Canceled,
    )

    if (confirmedDriver)
      return confirmedDriver
  }

  if (isChoiceOrder(order) || (candidateMode(order) && !isStoredSimpleOrderMode(order))) {
    // До явного выбора пассажиром водитель не считается назначенным,
    // даже если backend/эмулятор уже отдал состояние Performer.
    return null
  }

  return drivers.find(driver => driver.c_state > EBookingDriverState.Canceled) ?? null
}

function getCandidateDrivers(
  order: IOrder | null,
  confirmedChoiceId?: IUser['u_id'] | null,
) {
  if (!order || !isChoiceOrder(order) || confirmedChoiceId)
    return []

  return (order.drivers ?? [])
    .filter(driver => isVisibleChoiceDriverState(driver.c_state))
}

function canUseLocalChoiceFallback(
  order: IOrder | null,
  nextCandidateId: IUser['u_id'],
  rejectedChoiceIds: IUser['u_id'][],
) {
  if (!order || !isChoiceOrder(order) || !rejectedChoiceIds.length)
    return false

  const nextCandidate = order.drivers?.find(driver => String(driver.u_id) === String(nextCandidateId))
  return Boolean(nextCandidate && isVisibleChoiceDriverState(nextCandidate.c_state))
}

function getAvatarSrc(user?: IUser | null, driver?: IDriver | null) {
  const src = [
    user?.u_photo,
    driver?.user?.u_photo,
  ].find(value => typeof value === 'string' && value.trim())

  return src?.trim() || DRIVER_AVATAR_FALLBACK
}

function getDriverName(driver?: IDriver | null, user?: IUser | null) {
  const name = [
    user?.u_name,
    user?.u_family,
    driver?.u_name,
    driver?.u_family,
    driver?.user?.u_name,
    driver?.user?.u_family,
  ].filter(Boolean).join(' ').trim()

  if (name)
    return name

  const id = driver?.u_id || driver?.c_id
  return id ? `${t(TRANSLATION.DRIVER)} #${id}` : t(TRANSLATION.DRIVER)
}

function getCarText(car?: ICar | null) {
  if (!car)
    return t(TRANSLATION.AUTO)

  const model = car.cm_id ? t(TRANSLATION.CAR_MODELS[car.cm_id]) : ''
  const color = car.color ? t(TRANSLATION.CAR_COLORS[car.color]) : ''
  const text = [model, color ? `(${color})` : ''].filter(Boolean).join(' ')

  return text || t(TRANSLATION.AUTO)
}

function getDriverCarText(driver?: IDriver | null, car?: ICar | null) {
  const carText = getCarText(car)
  const plate = car?.registration_plate || driver?.c_id

  return plate ? `${carText} ${plate}` : carText
}


function getSyntheticOfferIndex(driver: IDriver, order?: IOrder | null) {
  const source = `${driver.u_id || ''}_${driver.c_id || ''}_${order?.b_id || ''}`
  return source.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
}

function getSyntheticOfferEta(driver: IDriver, order?: IOrder | null) {
  const variants = getDriverOfferEtaLabels()
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getSyntheticOfferComment(driver: IDriver, order?: IOrder | null) {
  const variants = getDriverOfferCommentLabels()
  return variants[getSyntheticOfferIndex(driver, order) % variants.length]
}

function getDriverOfferInfo(driver: IDriver, order?: IOrder | null) {
  const rawDriver = driver as any
  const options = normalizeCandidateOfferObject(rawDriver.c_options)
  const driverOfferObject = normalizeCandidateOfferObject(options.driver_offer)
  const offerObject = normalizeCandidateOfferObject(options.offer)
  const topDriverOfferObject = normalizeCandidateOfferObject(rawDriver.driver_offer)
  const topOfferObject = normalizeCandidateOfferObject(rawDriver.offer)
  const rawDriverData = normalizeCandidateOfferObject(rawDriver.c_data ?? rawDriver.data)
  const rawOffer = Object.keys(driverOfferObject).length ? driverOfferObject :
    Object.keys(offerObject).length ? offerObject :
      Object.keys(topDriverOfferObject).length ? topDriverOfferObject :
        topOfferObject
  const storedOffer = getStoredCandidateOffer(order?.b_id, driver.u_id, driver.c_id)

  return {
    price: getFirstFilledOfferValue(
      options.driver_offer_price,
      rawDriver.driver_offer_price,
      rawOffer.price,
      rawOffer.driver_price,
      rawOffer.performers_price,
      storedOffer?.price,
      options.performers_price,
      rawDriver.performers_price,
      rawDriver.c_price,
      options.price,
    ),
    eta: getFirstFilledOfferValue(
      options.driver_offer_eta,
      rawDriver.driver_offer_eta,
      rawDriverData.driver_offer_eta,
      rawDriverData.c_pickup_time,
      rawDriverData.pickup_time,
      rawOffer.eta,
      rawOffer.pickup_time,
      rawOffer.arrival_time,
      rawOffer.time,
      storedOffer?.eta,
      getSyntheticOfferEta(driver, order),
      options.eta,
      rawDriver.eta,
      rawDriver.pickup_time,
      rawDriver.arrival_time,
      rawDriver.c_eta,
      rawDriver.c_pickup_time,
      options.c_pickup_time,
      options.pickup_time,
      options.arrival_time,
      options.time,
    ),
    seats: getFirstFilledOfferValue(
      options.driver_offer_free_seats,
      rawDriver.driver_offer_free_seats,
      rawOffer.freeSeats,
      rawOffer.free_seats,
      rawOffer.seats,
      storedOffer?.freeSeats,
      options.freeSeats,
      rawDriver.freeSeats,
      rawDriver.free_seats,
      rawDriver.seats,
      options.free_seats,
      options.seats,
    ),
    comment: getFirstFilledOfferValue(
      options.driver_offer_comment,
      rawDriver.driver_offer_comment,
      rawDriverData.driver_offer_comment,
      rawDriverData.c_comment,
      rawDriverData.comment,
      rawOffer.comment,
      rawOffer.driver_comment,
      storedOffer?.comment,
      getSyntheticOfferComment(driver, order),
      options.driver_comment,
      rawDriver.driver_comment,
      rawDriver.comment,
      rawDriver.c_comment,
      options.c_comment,
      options.comment,
    ),
  }
}

function getFirstFilledOfferValue(...values: any[]) {
  return values.find(value =>
    value !== undefined &&
    value !== null &&
    (typeof value !== 'string' || value.trim() !== '')
  )
}

function normalizeCandidateOfferObject(value: any): Record<string, any> {
  if (!value)
    return {}

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  return typeof value === 'object' ? value : {}
}

function getStoredCandidateOffer(orderId?: IOrder['b_id'], driverId?: IDriver['u_id'], carId?: IDriver['c_id']) {
  if (!orderId)
    return null

  try {
    const offers = JSON.parse(localStorage.getItem('driverOffers') || '{}')
    const ids = [driverId, carId].filter(Boolean).map(String)

    for (const id of ids) {
      const exact = offers[`${id}:${orderId}`]
      if (exact)
        return exact
    }

    const orderOffers = Object.values(offers || {}).filter((item: any) =>
      String(item?.orderId) === String(orderId) &&
      (!ids.length || ids.includes(String(item?.userId)) || ids.includes(String(item?.carId))),
    )

    if (orderOffers.length)
      return orderOffers[0]

    const onlyOrderOffers = Object.values(offers || {}).filter((item: any) =>
      String(item?.orderId) === String(orderId),
    )

    return onlyOrderOffers.length === 1 ? onlyOrderOffers[0] : null
  } catch {
    return null
  }
}

function sortCandidateDriversByEta(drivers: IDriver[], order?: IOrder | null) {
  return [...drivers].sort((a, b) => {
    const etaA = getCandidatePickupEtaMinutes(a, order)
    const etaB = getCandidatePickupEtaMinutes(b, order)

    if (etaA === etaB)
      return 0
    if (etaA === Number.POSITIVE_INFINITY)
      return 1
    if (etaB === Number.POSITIVE_INFINITY)
      return -1

    return etaA - etaB
  })
}

function getCandidatePickupEtaText(driver: IDriver, order?: IOrder | null, rawEta?: unknown) {
  const eta = getFirstFilledOfferValue(rawEta, getDriverOfferInfo(driver, order).eta)
  if (eta !== undefined && eta !== null && String(eta).trim())
    return String(eta).trim()

  const minutes = getCandidateEstimatedPickupMinutes(driver, order)
  return minutes ? `≈ ${minutes} ${t(TRANSLATION.MINUTES)}` : '—'
}

function getCandidatePickupEtaMinutes(driver: IDriver, order?: IOrder | null) {
  const eta = parseOfferEtaMinutes(getDriverOfferInfo(driver, order).eta)
  if (eta !== Number.POSITIVE_INFINITY)
    return eta

  return getCandidateEstimatedPickupMinutes(driver, order) ?? Number.POSITIVE_INFINITY
}

function getCandidateEstimatedPickupMinutes(driver: IDriver, order?: IOrder | null) {
  const distanceKm = getCandidateDistanceToPickupKm(driver, order)
  return distanceKm === null ? undefined : Math.max(1, Math.round((distanceKm * 1.2 / 30) * 60))
}

function getCandidateDistanceToPickupKm(driver: IDriver, order?: IOrder | null) {
  if (
    !order?.b_start_latitude ||
    !order.b_start_longitude ||
    !driver.c_latitude ||
    !driver.c_longitude
  )
    return null

  return Number(distanceBetweenEarthCoordinates(
    driver.c_latitude,
    driver.c_longitude,
    order.b_start_latitude,
    order.b_start_longitude,
  ).toFixed(3))
}

function getBestDriverChangedReason(
  previousCandidate?: { etaMinutes: number | null, distanceKm: number | null } | null,
  newCandidate?: { etaMinutes: number | null, distanceKm: number | null } | null,
) {
  if (!previousCandidate)
    return 'previous_driver_removed'
  if (!newCandidate)
    return 'new_driver_missing'
  if (newCandidate.etaMinutes !== null && previousCandidate.etaMinutes !== null && newCandidate.etaMinutes < previousCandidate.etaMinutes)
    return 'eta_improved'
  if (newCandidate.distanceKm !== null && previousCandidate.distanceKm !== null && newCandidate.distanceKm < previousCandidate.distanceKm)
    return 'distance_improved'
  return 'ranking_changed'
}

function getCandidateFallbackComment(driver: IDriver, order?: IOrder | null) {
  const comments = getDriverOfferCommentLabels()
  const seed = String(order?.b_id ?? '') + String(driver.u_id ?? '') + String(driver.c_id ?? '')
  const hash = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return comments[hash % comments.length]
}

function parseOfferEtaMinutes(value: unknown) {
  if (!value)
    return Number.POSITIVE_INFINITY

  const text = String(value).toLowerCase()
  const numbers = text.match(/\d+/g)?.map(Number) ?? []

  if (!numbers.length)
    return Number.POSITIVE_INFINITY

  const firstNumber = numbers[0] ?? 0

  if (/час|hour/.test(text))
    return firstNumber * 60

  return firstNumber
}

function getOrderTravelTimeText(order?: IOrder | null) {
  const minutes = getOrderTravelTimeMinutes(order)
  if (!minutes)
    return '—'

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60

  if (hours > 0 && restMinutes > 0)
    return `≈ ${hours} ${t(TRANSLATION.HOURS)} ${restMinutes} ${t(TRANSLATION.MINUTES)}`
  if (hours > 0)
    return `≈ ${hours} ${t(TRANSLATION.HOURS)}`

  return `≈ ${minutes} ${t(TRANSLATION.MINUTES)}`
}

function getOrderTravelTimeMinutes(order?: IOrder | null) {
  const storedValue = getFirstPositiveNumber(
    (order?.b_options as any)?.pricingModel?.options?.duration,
    (order?.b_options as any)?.pricingModel?.options?.routeDuration,
    (order?.b_options as any)?.pricingModel?.options?.time,
    (order as any)?.b_estimate_waiting,
  )

  if (storedValue)
    return Math.max(1, Math.round(storedValue > 120 ? storedValue / 60 : storedValue))

  if (
    !order?.b_start_latitude ||
    !order?.b_start_longitude ||
    !order?.b_destination_latitude ||
    !order?.b_destination_longitude
  )
    return undefined

  const distanceKm = distanceBetweenEarthCoordinates(
    order.b_start_latitude,
    order.b_start_longitude,
    order.b_destination_latitude,
    order.b_destination_longitude,
  )

  return Math.max(1, Math.round((distanceKm * 1.15 / 28) * 60))
}

function getFirstPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined || value === '')
      continue

    const number = Number(value)
    if (Number.isFinite(number) && number > 0)
      return number
  }

  return undefined
}

function formatOfferPrice(price: unknown) {
  if (price === undefined || price === null || price === '')
    return ''

  return `${price} ${CURRENCY.SIGN}`
}

function formatDriverPrice(driver: IDriver) {
  const price = driver.c_options?.performers_price
  if (!price)
    return ''

  return `${price} ${CURRENCY.SIGN}`
}
