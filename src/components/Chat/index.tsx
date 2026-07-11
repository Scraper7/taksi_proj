import cn from 'classnames'
import React, { useRef } from 'react'
import { useState, useEffect } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { IRootState } from '../../state'
import { userSelectors } from '../../state/user'
import { IUser } from '../../types/types'
import { useForm } from 'react-hook-form'
import './styles.scss'
import { t, TRANSLATION } from '../../localization'
import * as API from '../../API'
import Input, { EInputTypes } from '../Input'
import { Resizable } from 're-resizable'
import { modalsActionCreators, modalsSelectors } from '../../state/modals'

const ResizableComponent = Resizable as React.ComponentType<any>

enum EMessageType {
  MainUserMessage,
  AnotherUserMessage,
  Action
}

interface IMessage {
  text: string,
  from?: string,
  type?: EMessageType
}

interface ISocketData {
  action: string,
  event?: string,
  arg?: string,
  msg?: string,
  history?: {
    action?: string,
    to: string,
    from: string,
    msg: string,
  }[],
  from?: string
}

interface IFormValues {
  message: string,
}

const getMessageClass = (type?: EMessageType) => {
  switch(type) {
    case EMessageType.MainUserMessage: return 'main-user-message'
    case EMessageType.AnotherUserMessage: return 'another-user-message'
    case EMessageType.Action: return 'action'
    default: return 'main-user-message'
  }
}

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
  activeChat: modalsSelectors.activeChat(state),
})

const mapDispatchToProps = {
  setActiveChat: modalsActionCreators.setActiveChat,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

const host = 'chat.itest24.com'
const port = 7007

interface IProps extends ConnectedProps<typeof connector> {
}

const Chat: React.FC<IProps> = ({
  user,
  activeChat,
  setActiveChat,
}) => {
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [messages, setMessages] = useState<IMessage[]>([])
  const [anotherUser, setAnotherUser] = useState<IUser | null>(null)

  const messagesRef = useRef<HTMLDivElement>(null)

  const {
    register,
    getValues,
    handleSubmit: formHandleSubmit,
    reset,
  } = useForm<IFormValues>({
    criteriaMode: 'all',
    mode: 'onSubmit',
  })

  let from: string, to: string, anotherUserID: string, order: string

  useEffect(() => {
    API.getUser(anotherUserID)
      .then(setAnotherUser)
      .catch(error => console.error(error))

    let _socket = socket
    try {
      _socket = new WebSocket(`wss://${host}:${port}`)
      setSocket(_socket)
    } catch (error) {
      console.log(error)
    }

    if (_socket) {
      _socket.onopen = () => {
        _socket?.send(JSON.stringify({
          from,
          to,
          action: 'start',
        }))
      }
      _socket.onclose = () => {

      }

      _socket.onmessage = e => {
        const { action, event, arg, msg, from: dataFrom, history }: ISocketData = JSON.parse(e.data)

        switch (action) {
          case 'notify': {
            const message = {
              type: EMessageType.Action,
              from: arg || from,
            } as IMessage
            switch (event) {
              case 'joined':
                message.text = 'joined the conversation'
                break
              case 'left':
                message.text = 'left the conversation'
                break
              case 'you-joined':
                message.text = 'joined the conversation'
                break
              case 'you-left':
                message.text = 'left the conversation'
                break
              default: console.error('Wrong chat event:', event)
            }

            setMessages(prev => [...prev, message])

            // TODO
            // '<i><font color="#044">' + text + '</font></i>'
            break
          }
          case 'send': {
            // TODO
            // const color =  ? '#f00' : '#00f'

            const message = {
              type: from === dataFrom ? EMessageType.MainUserMessage : EMessageType.AnotherUserMessage,
              from: dataFrom,
              text: msg as string,
            }

            setMessages(prev => [...prev, message])
            break
          }
          case 'history': {
            history && setMessages(
              history.map((item) => ({
                type: from === item.from ? EMessageType.MainUserMessage : EMessageType.AnotherUserMessage,
                from: item.from,
                text: item.msg,
              })),
            )
            break
          }
          default: console.error('Wrong chat event:', event)
        }
      }

      _socket.onerror = (error) => {
        console.error('Socket error:', error)
      }
    }
  }, [])

  if (!activeChat) return null;
  [from, to] = activeChat.split(';');
  [anotherUserID, order] = to.split('_')

  const handleSubmit = () => {
    if (!socket) return console.error('Error: Socket is not ready yet for send')

    socket.send(JSON.stringify({
      from,
      to,
      msg: getValues().message,
      action: 'send',
    }))

    reset()
  }

  return (
    <ResizableComponent
      defaultSize={{ height: 400, width: 300 }}
      className="chat"
      handleStyles={{
        top: {
          top: 0,
          height: 50,
        },
      }}
    >
      <form
        onSubmit={formHandleSubmit(handleSubmit)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chat__header">
          №{order} {anotherUser?.u_name}
          <button className="chat__close-button" onClick={(e) => {e.stopPropagation(); setActiveChat(null)}}>✖</button>
        </div>

        <div className="chat__messages" ref={messagesRef}>
          {
            messages.map((item) =>
              <div className={cn('chat__message', `chat__message--${getMessageClass(item.type)}`)}>
                {item.from && <span className="chat__name">{item.from === from ? 'You' : anotherUser?.u_name}</span>}
                {item.text}
              </div>,
            )
          }
        </div>

        <div className="chat__footer">
          <Input
            inputProps={{
              ...register('message', { required: t(TRANSLATION.REQUIRED_FIELD) }),
              placeholder:'Enter message text',
              autoFocus:true,
            }}
            fieldWrapperClassName="chat__input"
            inputType={EInputTypes.Textarea}
            buttons={[{
              className:'chat__send-button',
              type: 'submit',
              text: '✉',
            }]}
          />
        </div>
      </form>
    </ResizableComponent>
  )
}

export default connector(Chat)
