import React, { useMemo } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { IRootState } from '../../state'
import { modalsSelectors, modalsActionCreators } from '../../state/modals'
import { defaultMessageModal } from '../../state/modals/reducer'
import Overlay from './Overlay'
import { EStatuses } from '../../types/types'
import { t, TRANSLATION } from '../../localization'
import './styles.scss'

type TVariant = 'fail' | 'success' | 'warning'

const mapStateToProps = (state: IRootState) => ({
  isOpen: modalsSelectors.isMessageModalOpen(state),
  message: modalsSelectors.messageModalMessage(state),
  status: modalsSelectors.messageModalStatus(state),
})

const mapDispatchToProps = {
  setMessageModal: modalsActionCreators.setMessageModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

const TECHNICAL_NO_CHANGE_MESSAGES = [
  'user or modified data not found',
  'modified data not found',
  'no modified data',
]

function normalizeMessage(message: string | undefined) {
  const text = (message || '').toString().trim()
  if (!text) return ''

  const lowerText = text.toLowerCase()
  if (TECHNICAL_NO_CHANGE_MESSAGES.some(item => lowerText.includes(item)))
    return t('message_modal_already_actual')

  return text
}

function StatusIcon({ variant }: { variant: TVariant }) {
  const isSuccess = variant === 'success'
  const isWarning = variant === 'warning'
  const accent = isSuccess ? '#22C55E' : isWarning ? '#F59E0B' : '#EF4444'
  const background = isSuccess ? '#ECFDF3' : isWarning ? '#FFF7E6' : '#FFF1F1'
  const border = isSuccess ? '#BBF7D0' : isWarning ? '#FED7AA' : '#FECACA'

  return (
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="38" fill={background} stroke={border} strokeWidth="2" />
      {isSuccess ? (
        <path d="M27 40.5 36 49l17-18" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path d="M40 24v22" fill="none" stroke={accent} strokeWidth="6" strokeLinecap="round" />
          <circle cx="40" cy="56" r="4" fill={accent} />
        </>
      )}
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.6 10.6c1.4 2.8 3.9 5.3 6.8 6.8l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.8 21 3 13.2 3 3.5c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1l-2.2 2.2Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const MessageModal: React.FC<IProps> = ({
  isOpen,
  message,
  status,
  setMessageModal,
}) => {
  const closeModal = () => setMessageModal({ ...defaultMessageModal })
  const variant: TVariant = status === EStatuses.Success ?
    'success' :
    status === EStatuses.Warning ? 'warning' : 'fail'
  const normalizedMessage = useMemo(() => normalizeMessage(message), [message])
  const supportLink =
    (window as any)?.data?.site_constants?.support_link?.value ||
    (window as any)?.data?.site_constants?.support_url?.value ||
    (window as any)?.data?.site_constants?.support_email?.value

  const content = useMemo(() => {
    if (variant === 'success') {
      return {
        title: t('message_modal_done'),
        subtitle: '',
        infoTitle: t('message_modal_success_info_title'),
        infoText: normalizedMessage || t('message_modal_success_info_text'),
        button: t(TRANSLATION.OK),
      }
    }

    if (variant === 'warning') {
      return {
        title: t('message_modal_warning_title_simple'),
        subtitle: '',
        infoTitle: t('message_modal_what_happened_title'),
        infoText: normalizedMessage || t('message_modal_warning_default_text'),
        button: t('message_modal_understood'),
      }
    }

    return {
      title: t('message_modal_fail_title_simple'),
      subtitle: '',
      infoTitle: t('message_modal_reason_title'),
      infoText: normalizedMessage || t(TRANSLATION.API_ERROR_GENERIC),
      button: t('message_modal_understood'),
    }
  }, [variant, normalizedMessage])

  const handleSupportAction = () => {
    if (!supportLink) return

    const supportText = String(supportLink)
    const href = supportText.includes('@') && !supportText.startsWith('mailto:') ?
      `mailto:${supportText}` :
      supportText
    window.open(href, '_blank')
  }

  return (
    <Overlay
      isOpen={isOpen}
      onClick={closeModal}
    >
      <div className={cn('modal', 'message-modal', `message-modal--${variant}`)}>
        <button
          type="button"
          className="message-modal__close"
          onClick={closeModal}
          aria-label={t(TRANSLATION.CLOSE)}
        >
          <CloseIcon />
        </button>

        <div className="message-modal__hero">
          <div className="message-modal__hero-icon-wrapper">
            <StatusIcon variant={variant} />
          </div>
          <h2 className="message-modal__title">{content.title}</h2>
          {!!content.subtitle && <p className="message-modal__subtitle">{content.subtitle}</p>}
        </div>

        <div className={cn('message-modal__info-card', `message-modal__info-card--${variant}`)}>
          <div className="message-modal__card-content">
            <div className="message-modal__info-title">{content.infoTitle}</div>
            <div className="message-modal__info-text">{content.infoText}</div>
          </div>
        </div>

        <div className="message-modal__actions">
          <button
            type="button"
            className={cn('message-modal__action-button', 'message-modal__action-button--primary', {
              'message-modal__action-button--single': !supportLink || variant === 'success',
            })}
            onClick={closeModal}
          >
            <span>{content.button}</span>
          </button>

          {!!supportLink && variant !== 'success' && (
            <button
              type="button"
              className="message-modal__action-button message-modal__action-button--secondary"
              onClick={handleSupportAction}
            >
              <span className="message-modal__action-icon"><SupportIcon /></span>
              <span>{t('message_modal_support')}</span>
            </button>
          )}
        </div>
      </div>
    </Overlay>
  )
}

export default connector(MessageModal)
