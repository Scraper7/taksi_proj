import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import Rating from 'react-rating'
import moment from 'moment'
import {
  calculateFinalPrice,
  calculateFinalPriceFormula,
  getOrderDriveStartedAt,
} from '../../tools/order'
import { useSimpleSelector } from '../../tools/hooks'
import images from '../../constants/images'
import { CURRENCY } from '../../siteConstants'
import * as API from '../../API'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { clientOrderSelectors } from '../../state/clientOrder'
import { ordersSelectors } from '../../state/orders'
import { orderSelectors } from '../../state/order'
import { t, TRANSLATION } from '../../localization'
import { writeFlowEvent } from '../../tools/flowLog'
import Button from '../Button'
import Input from '../Input'
import Overlay from './Overlay'
import './styles.scss'

const RatingComponent = Rating as React.ComponentType<any>

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isRatingModalOpen(state),
  orderID: modalsSelectors.ratingModalOrderID(state),
  selectedOrder: clientOrderSelectors.selectedOrder(state),
  detailedOrder: orderSelectors.order(state),
})

const mapDispatchToProps = {
  setRatingModal: modalsActionCreators.setRatingModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function RatingModal({
  isOpen,
  orderID,
  selectedOrder,
  detailedOrder,
  setRatingModal,
}: IProps) {
  const [stars, setStars] = useState(0)
  const [tips, setTips] = useState('')
  const [comment, setComment] = useState('')

  const _orderID = orderID || detailedOrder?.b_id || selectedOrder
  const order = useSimpleSelector(useCallback((state: IRootState) =>
    detailedOrder ??
    (_orderID ? ordersSelectors.order(state, _orderID) : undefined)
  , [detailedOrder ?? _orderID]))

  // Reset stars, tips and comment when modal opens for a new order
  useEffect(() => {
    if (isOpen) {
      setStars(0)
      setTips('')
      setComment('')

      if (_orderID) {
        writeFlowEvent('REVIEW_SCREEN_OPEN', {
          orderId: _orderID,
          screen: 'RatingModal',
          uiState: 'ReviewScreenOpen',
          data: {
            orderId: _orderID,
            hasOrderData: Boolean(order),
          },
        })
        writeFlowEvent('REVIEW_SCREEN_OPENED', {
          orderId: _orderID,
          screen: 'RatingModal',
          uiState: 'ReviewScreenOpened',
          data: {
            orderId: _orderID,
            hasOrderData: Boolean(order),
          },
        })
      } else {
        writeFlowEvent('REVIEW_SCREEN_FAILED', {
          screen: 'RatingModal',
          uiState: 'ReviewScreenOpenFailed',
          data: {
            reason: 'missing_order_id',
          },
        })
      }
    }
  }, [isOpen, _orderID, order?.b_id])

  const onRating = () => {
    if (_orderID) {
      writeFlowEvent('LEAVE_REVIEW', {
        orderId: _orderID,
        screen: 'RatingModal',
        uiState: 'ReviewSubmitted',
        data: {
          orderId: _orderID,
          rating: stars,
          hasTips: Boolean(tips),
          hasComment: Boolean(comment),
        },
      })
      writeFlowEvent('REVIEW_SUBMITTED', {
        orderId: _orderID,
        screen: 'RatingModal',
        uiState: 'ReviewSubmitted',
        data: {
          orderId: _orderID,
          rating: stars,
          hasTips: Boolean(tips),
          hasComment: Boolean(comment),
        },
      })
      API.setOrderRating(_orderID, stars)
        .catch(error => {
          writeFlowEvent('REVIEW_SCREEN_FAILED', {
            orderId: _orderID,
            screen: 'RatingModal',
            uiState: 'ReviewSubmitFailed',
            data: {
              reason: 'rating_api_error',
              message: error instanceof Error ? error.message : String(error),
            },
          })
          console.error(error)
        })
    }

    setRatingModal({ isOpen: false })
  }

  const [finalPriceFormula, finalPrice] = useMemo(() => {
    const driveStartedAt = getOrderDriveStartedAt(order)
    if (order?.b_options?.pricingModel && driveStartedAt && order.b_completed) {
      const start_moment = moment(driveStartedAt)
      const end_moment = moment(order.b_completed)

      const updatedOptions = {
        ...(order.b_options.pricingModel.options || {}),
        duration: end_moment.diff(start_moment, 'minutes'),
      }

      const orderWithUpdatedOptions = {
        ...order,
        b_options: {
          ...order.b_options,
          pricingModel: {
            ...order.b_options.pricingModel,
            options: updatedOptions,
          },
        },
      }

      return [
        calculateFinalPriceFormula(orderWithUpdatedOptions),
        calculateFinalPrice(orderWithUpdatedOptions),
      ]
    }
    return ['err', 0]
  }, [order])

  return (
    <Overlay
      isOpen={isOpen}
      onClick={() => setRatingModal({ isOpen: false })}
    >
      <div
        className="modal rating-modal"
      >
        <form>
          <fieldset>
            {finalPriceFormula !== 'err' && (
              <div>
                <div className="final-price">
                  {t(TRANSLATION.FINAL_PRICE)}: {finalPrice!=='-'? CURRENCY.SIGN : ''} {finalPrice + (order?.b_options?.pricingModel?.calculationType === 'incomplete' ? '+?' : '')}
                </div>
                <div className="final-price">
                  {t(TRANSLATION.CALCULATION)}: {finalPriceFormula}
                </div>
              </div>
            )}
            <legend>{t(TRANSLATION.RATING_HEADER)}!</legend>
            <h3>{t(TRANSLATION.YOUR_RATING)}</h3>
            <div className="rating">
              {/* TODO make rating wrapper component */}
              <RatingComponent
                onChange={setStars}
                initialRating={stars}
                className="rating-stars"
                emptySymbol={<img src={images.starEmpty} className="icon" alt={t(TRANSLATION.EMPTY_STAR)}/>}
                fullSymbol={<img src={images.starFull} className="icon" alt={t(TRANSLATION.FULL_STAR)}/>}
              />
              <p>({t(TRANSLATION.ONLY_ONE_TIME)})</p>
              {/* TODO connect to API */}
              <Input
                inputProps={{
                  placeholder: t(TRANSLATION.ADD_TAXES),
                  value: tips,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setTips(e.target.value.toString()),
                }}
              />
              <Input
                inputProps={{
                  placeholder: t(TRANSLATION.WRITE_COMMENT),
                  value: comment,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) => setComment(e.target.value.toString()),
                }}
              />
              <Button
                text={t(TRANSLATION.RATE)}
                className="rating-modal_rating-btn"
                onClick={onRating}
                disabled={stars === 0}
              />
            </div>
          </fieldset>
        </form>
      </div>
    </Overlay>
  )
}

export default connector(RatingModal)
