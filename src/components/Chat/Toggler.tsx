import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { IRootState } from '../../state'
import { IOrder, IUser } from '../../types/types'
import './styles.scss'
import Button from '../Button'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'
import { userSelectors } from '../../state/user'
import images from '../../constants/images'
import { t, TRANSLATION } from '../../localization'

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
  activeChat: modalsSelectors.activeChat(state),
})

const mapDispatchToProps = {
  setActiveChat: modalsActionCreators.setActiveChat,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {
  anotherUserID: IUser['u_id']
  orderID: IOrder['b_id']
  small?: boolean
  onClick?: (e: React.MouseEvent) => void
}

const Toggler: React.FC<IProps> = ({
  activeChat,
  user,
  anotherUserID,
  orderID,
  small,
  setActiveChat,
  onClick,
}) => {
  const from = `${user?.u_id}_${orderID}`
  const to = `${anotherUserID}_${orderID}`
  const chatID = `${from};${to}`

  const handleClick: React.MouseEventHandler = (e) => {
    e.stopPropagation()
    if (onClick) {
      onClick(e)
    } else {
      setActiveChat(activeChat === chatID ? null : chatID)
    }
  }

  return (
    small ?
      <img className="chat__toggler" src={images.chat} onClick={handleClick} alt={t(TRANSLATION.CHAT)}/> :
      <Button className="chat__toggler" onClick={handleClick} text="✎"/>
  )
}

export default connector(Toggler)