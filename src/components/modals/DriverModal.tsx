import React, { useEffect, useState } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Button from '../Button'
import { t, TRANSLATION } from '../../localization'
import images from '../../constants/images'
import * as API from '../../API'
import { clientOrderSelectors } from '../../state/clientOrder'
import { IRootState } from '../../state'
import { ordersSelectors } from '../../state/orders'
import { EBookingDriverState, EColorTypes, ICar, IUser } from '../../types/types'
import { getDriverDoorNumber, shouldShowDriverDoorNumber } from '../../tools/driverDoorNumber'
import './styles.scss'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import Overlay from './Overlay'

const mapStateToProps = (state: IRootState) => ({
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  activeOrders: ordersSelectors.activeOrders(state),
  isOpen: modalsSelectors.isDriverModalOpen(state),
})

const mapDispatchToProps = {
  setDriverModal: modalsActionCreators.setDriverModal,
  setCancelModal: modalsActionCreators.setCancelModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
}

const DriverModal: React.FC<IProps> = ({
  isOpen,
  selectedOrder,
  activeOrders,
  setDriverModal,
  setCancelModal,
}) => {
  // const [clicked, setClicked] = useState(false)
  // const [seconds, setSeconds] = useState(180)
  // const [countUp, setCountUp] = useState(0)
  // const [isFree, setIsFree] = useState(false)
  const [car, setCar] = useState<ICar | null>(null)
  const [driverUser, setDriverUser] = useState<IUser | null>(null)

  const order = activeOrders?.find(item => item.b_id === selectedOrder)
  const driver = order?.drivers?.find(item => item.c_state > EBookingDriverState.Canceled)

  useEffect(() => {
    if (isOpen && selectedOrder && driver?.c_id) {
      API.getCar(driver.c_id)
        .then(setCar)
        .catch(error => console.error(error))
      API.getUser(driver.u_id)
        .then(setDriverUser)
        .catch(error => console.error(error))
    }
  }, [isOpen])

  // useEffect(() => {
  //   let interval = null
  //   let upInterval = null
  //   if (clicked) {
  //     interval = setInterval(() => {
  //       setSeconds(seconds => seconds - 1)
  //     }, 1000)
  //   } else if (!clicked && seconds !== 0) {
  //     clearInterval(interval)
  //   }
  //   if (seconds <= 0) {
  //     clearInterval(interval)
  //     upInterval = setInterval(() => {
  //       setCountUp(seconds => seconds + 1)
  //     }, 1000)
  //     setIsFree(true)
  //   }
  //   return () => {
  //     clearInterval(interval)
  //     clearInterval(upInterval)
  //   }
  // }, [seconds, countUp, clicked])

  const registrationPlate = car?.registration_plate.split(' ')

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setDriverModal(false)}
    >
      <div
        className="modal driver-modal"
        style={{ display: isOpen ? 'flex' : 'none' }}
      >
        <form>
          <fieldset>
            <legend>
              {!!driver?.c_state && t(TRANSLATION.BOOKING_DRIVER_STATES[driver?.c_state])} №{selectedOrder}
            </legend>
            <div className="driver-info">
              <div className="colored">
                <img src={images.solidCar} alt={!!car?.cm_id ? t(TRANSLATION.CAR_MODELS[car.cm_id]) : ''}/>
                <span>{!!car?.cm_id && t(TRANSLATION.CAR_MODELS[car.cm_id])}</span>
                <span>({!!car?.color && t(TRANSLATION.CAR_COLORS[car.color])})</span>
              </div>
              <div>
                <img src={images.driverAvatar} alt={t(TRANSLATION.DRIVER)}/>
                {/* TODO replace by rating component with real rating */}
                <img src={images.stars} alt={t(TRANSLATION.STARS)}/>
              </div>
              <div className="colored">
                <img
                  src={images.subwayIdCard}
                  alt={t(TRANSLATION.REGISTRATION_PLATE)}
                />
                <span className="driver-modal__registration-plate">
                  {registrationPlate?.[0]}
                </span>
                <span className="driver-modal__registration-plate">
                  {registrationPlate?.slice(1).join(' ')}
                </span>
              </div>
            </div>
            <div className="driver-info_div">
              {/* TODO rename family */}
              <h4>{driverUser?.u_name} {driverUser?.u_family} {driverUser?.u_middle}</h4>

              {/* TODO */}
              {/* {
              !clicked ?
                <Button
                  text="ok"
                  className="driver-info_ok-btn"
                  onClick={onOkClick}
                  isAuth={isAuth}
                  {...props}
                /> :
                <Button
                    text="Поехали!"
                    onClick={(e) => {
                        e.preventDefault();
                        props.openOnTheWayModal();
                        setClicked(false);
                    }}
                    className="driver-info_getting-btn"
                    isAuth={isAuth}
                    {...props}
                />
              }
              {
                !clicked ?
                  <span/> :
                  // eslint-disable-next-line
                  <a style={{textDecoration: 'none'}}>
                      {
                        !isFree ? `бесплатное ожидание: ${down.minutes}: ${down.seconds}` :
                            `платное ожидание: ${up.minutes}: ${up.seconds}`
                      }
                  </a>
              } */}
              {order?.b_voting && shouldShowDriverDoorNumber(driver) && (
                <div className="driver-modal__boarding-code">
                  <span>{t(TRANSLATION.DRIVE_NUMBER)}</span>
                  <strong>{getDriverDoorNumber(driver, car) || '—'}</strong>
                  <small>{t(TRANSLATION.DRIVE_NUMBER_HINT)}</small>
                </div>
              )}

              {driver?.c_state && (driver.c_state > EBookingDriverState.Canceled) && (
                <Button
                  text={t(TRANSLATION.CANCEL)}
                  onClick={() => setCancelModal(true)}
                  colorType={EColorTypes.Accent}
                />
              )}
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(DriverModal)
