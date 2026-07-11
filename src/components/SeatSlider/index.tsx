import React, { useState, useRef, useMemo } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import images from '../../constants/images'
import { IRootState } from '../../state'
import {
  clientOrderSelectors,
  clientOrderActionCreators,
} from '../../state/clientOrder'
import Glide from '../Glide'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  maxSeats: clientOrderSelectors.maxAvailableSeats(state),
  seats: clientOrderSelectors.seats(state),
})

const mapDispatchToProps = {
  setSeats: clientOrderActionCreators.setSeats,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function SeatSlider({ maxSeats, seats, setSeats }: IProps) {

  const disabled = maxSeats === null
  const prevMaxSeats = useRef(maxSeats ?? 0)
  if (maxSeats === null)
    maxSeats = prevMaxSeats.current
  else
    prevMaxSeats.current = maxSeats
  const items = useMemo(
    () => new Array(maxSeats).fill(0).map((_, idx) => idx + 1),
    [maxSeats],
  )

  const [position, setPosition] = useState<number>(0)

  return (
    <Glide
      className={cn('seat-slider', {
        'seat-slider--disabled': disabled,
      })}
      style={{
        '--seat-slider--per-view': '5',
      } as React.CSSProperties}
      perView={5}
      gap={8}
      focused={seats - 1}
      focusPaddingLeft={1}
      focusPaddingRight={1}
      slides={useMemo(() => items.map(value => ({
        key: value,
        className: `seat-slider__slide ${
          seats === value ? 'seat-slider__slide__active' : ''
        }`,
        onClick: () => setSeats(value),
        children: value,
      })), [items, seats, setSeats])}
      buttons={useMemo(() => [
        ...(position === 0 ?
          [] :
          [{
            key: 0,
            className: 'seat-slider__button seat-slider__button--left',
            dir: '<' as '<',
            children: (
              <img
                src={images.seatSliderArrowRight}
                alt=""
                className="seat-slider__arrow-icon"
              />
            ),
          }]
        ),
        ...(position + 4 >= items.length - 1 ?
          [] :
          [{
            key: 1,
            className: 'seat-slider__button seat-slider__button--right',
            dir: '>' as '>',
            children: (
              <img
                src={images.seatSliderArrowRight}
                alt=""
                className="seat-slider__arrow-icon"
              />
            ),
          }]
        ),
      ], [items, position])}
      onPositionChange={setPosition}
    />
  )
}

export default connector(SeatSlider)