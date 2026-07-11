import React, { useCallback, ReactElement } from 'react'
import { connect, ConnectedProps } from 'react-redux'
import cn from 'classnames'
import { IRootState } from '../../state'
import { modalsActionCreators } from '../../state/modals'
import { userSelectors } from '../../state/user'
import './styles.scss'
import { EColorTypes, EStatuses } from '../../types/types'
import { getStatusClassName } from '../../tools/utils'
import { gradient } from '../../tools/theme'

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
})

const mapDispatchToProps = {
  setLoginModal: modalsActionCreators.setLoginModal,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

export enum EButtonShapes {
  Default,
  Flat,
}

export enum EButtonStyles {
  Default,
  RedDesign,
}

interface IProps
  extends React.ComponentProps<'button'>, ConnectedProps<typeof connector> {
  wrapperProps?: React.ComponentProps<'div'>,
  imageProps?: React.ComponentProps<'img'>,
  fixedSize?: boolean,
  shape?: EButtonShapes,
  buttonStyle?: EButtonStyles,
  skipHandler?: boolean,
  text?: string,
  svg?: ReactElement,
  label?: string,
  status?: EStatuses,
  colorType?: EColorTypes,
  checkLogin?: boolean
}

function Button({
  wrapperProps = {},
  imageProps,
  fixedSize = true,
  shape = EButtonShapes.Default,
  buttonStyle = EButtonStyles.Default,
  skipHandler,
  text,
  svg,
  label,
  status = EStatuses.Default,
  user,
  setLoginModal,
  colorType = EColorTypes.Default,
  checkLogin = true,
  ...buttonProps
}: IProps) {
  const handleButtonClick = useCallback((
    e: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    if (skipHandler) return buttonProps.onClick && buttonProps.onClick(e)
    const loggedIn = !checkLogin || user

    if (
      buttonProps.type !== 'submit' ||
      (buttonProps.type === 'submit' && !loggedIn)
    ) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (loggedIn) {
      if (buttonProps.onClick) buttonProps.onClick(e)
    } else {
      setLoginModal(true)
    }
  }, [
    buttonProps.type, buttonProps.onClick,
    skipHandler, checkLogin, user, setLoginModal,
  ])

  return (
    <>
      {label && <span className={`button__label button__label--${getStatusClassName(status)}`}>{label}</span>}
      <div {...wrapperProps} className={cn('button__wrapper', wrapperProps.className)}>
        <button
          {...buttonProps}
          className={cn(
            'button',
            { disabled: buttonProps.disabled },
            { 'button--accent': colorType === EColorTypes.Accent },
            { 'button--size--fixed': fixedSize },
            shape !== EButtonShapes.Default && 'button--shape--' + {
              [EButtonShapes.Flat]: 'flat',
            }[shape],
            buttonStyle !== EButtonStyles.Default && 'button--style--' + {
              [EButtonStyles.RedDesign]: 'red-design',
            }[buttonStyle],
            buttonProps.className,
          )}
          style={{
            background: buttonStyle === EButtonStyles.Default ?
              gradient() :
              undefined,
            ...buttonProps.style,
          }}
          onClick={handleButtonClick}
        >
          {imageProps && (
            <img
              alt={text}
              {...imageProps}
              className={cn(
                'button__icon',
                imageProps.className,
              )}
            />
          )}
          {text}
          {svg}
        </button>
      </div>
    </>
  )
}

export default connector(Button)