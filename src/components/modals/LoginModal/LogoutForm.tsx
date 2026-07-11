import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { IRootState } from '../../../state'
import {
  userSelectors,
  userActionCreators,
} from '../../../state/user'
import { t, TRANSLATION } from '../../../localization'
import { EInputTypes } from '../../Input'
import Button from '../../Button'
import { Input } from './elements'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  user: userSelectors.user(state),
})

const mapDispatchToProps = {
  logout: userActionCreators.logout,
}

const connector = connect(mapStateToProps, mapDispatchToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function LogoutForm({
  user,
  logout,
}: IProps) {
  return user && (
    <form
      className="login-form sign-in-subform"
      onSubmit={event => {
        event.preventDefault()
      }}
    >
      <Input
        inputProps={{
          disabled: true,
          value: user.u_phone ?? user.u_email,
        }}
        inputType={user.u_phone ? EInputTypes.MaskedPhone : EInputTypes.Default}
        label={t(TRANSLATION.LOGIN)}
      />

      <Button
        type="submit"
        text={t(TRANSLATION.LOGOUT)}
        fixedSize={false}
        className="login-modal_login-btn"
        skipHandler={true}
        onClick={() => {
          logout()
        }}
      />
    </form>
  )
}

export default connector(LogoutForm)