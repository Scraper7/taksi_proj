import React, { useState, useMemo, useCallback } from 'react'
import cn from 'classnames'
import { TimePicker } from '@mui/x-date-pickers'
import { connect, ConnectedProps } from 'react-redux'
import moment, { Moment } from 'moment'
import { t, TRANSLATION } from '../../localization'
import {
  clientOrderActionCreators,
  clientOrderSelectors,
} from '../../state/clientOrder'
import { IRootState } from '../../state'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { dateFormatTimeShort } from '../../tools/utils'
import Overlay from './Overlay'
import './styles.scss'

const timePickerViews = ['hours', 'minutes'] as const

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isPickTimeModalOpen(state),
  time: clientOrderSelectors.time(state),
})

const mapDispatchToProps = {
  setTime: clientOrderActionCreators.setTime,
  setPickTimeModal: modalsActionCreators.setPickTimeModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

enum EPeriods {
  Today,
  Now,
  Tomorrow
}

const PickTimeModal: React.FC<IProps> = ({
  isOpen,
  time,
  setTime,
  setPickTimeModal,
}) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const [period, setPeriod] = useState(EPeriods.Now)

  const onPeriodClick = useCallback((item: EPeriods) => {
    setPeriod(item)
    if (item === EPeriods.Now) {
      setTime('now')
      setIsPickerOpen(false)
      setPickTimeModal(false)
    } else
      setIsPickerOpen(true)
  }, [])

  const items = [
    { label: t(TRANSLATION.TODAY), value: EPeriods.Today },
    { label: t(TRANSLATION.NOW), value: EPeriods.Now },
    { label: t(TRANSLATION.TOMORROW), value: EPeriods.Tomorrow },
  ]
  const activePeriod = useMemo(
    () => time === 'now' ?
      EPeriods.Now :
      time.isSame(moment(), 'day') ?
        EPeriods.Today :
        time.isSame(moment().add(1, 'days'), 'day') ?
          EPeriods.Tomorrow :
          null,
    [time],
  )

  return (
    <Overlay
      isOpen={isOpen}
      onClick={useCallback(() => {
        setPickTimeModal(false)
        setIsPickerOpen(false)
      }, [])}
    >
      <div className="modal timer-modal">
        {useMemo(() => items.map((item, index) =>
          <div key={item.value} className="timer-modal__item">
            <div
              className={cn('timer-modal__button', {
                'timer-modal__button--active': activePeriod === item.value,
              })}
              onClick={() => onPeriodClick(item.value)}
            >
              {item.label}
              {activePeriod === item.value && typeof time !== 'string' &&
                <label className="timer-modal__label">
                  <span>{time.format(dateFormatTimeShort)}</span>
                </label>
              }
            </div>
            <span className="timer-modal__separator" />
          </div>,
        ), [time, activePeriod])}
      </div>
      <TimePicker
        autoFocus
        ampm={false}
        open={isPickerOpen}
        onClose={useCallback(() => setIsPickerOpen(false), [])}
        slots={timePickerSlots}
        views={timePickerViews}
        value={typeof time === 'string' ? null : time}
        onAccept={useCallback((date: Moment | null) => {
          if (date) {
            const days = period === EPeriods.Tomorrow ? 1 : 0
            setTime(date.clone().add(days, 'days'))
          }
          setPickTimeModal(false)
        }, [period])}
      />
    </Overlay>
  )
}

interface ITimePickerDialogProps {
  children?: React.ReactNode,
  open: boolean
}

const timePickerSlots = {
  dialog({ children, open }: ITimePickerDialogProps) {
    return (
      <div
        className={cn('timer-modal__time-picker', {
          'timer-modal__time-picker--visible': open,
        })}
      >
        {children}
      </div>
    )
  },
  textField: () => null,
}

export default connector(PickTimeModal)