import React, { useEffect } from 'react'
import { EUserRoles } from '../../types/types'
import { useDispatch } from '../../tools/hooks'
import { setRefCodeModal } from '../../state/modals/actionCreators'
import { ERegistrationType } from '../../state/user/constants'
import ModalStack from './ModalStack'
import { replaceAllString } from '../../tools/compat'

export function ModalHost(_props?: { languageIso?: string }) {
  const dispatch = useDispatch()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const email = params.get('u_email')
    const name = params.get('u_name')

    if (email && name)
      dispatch(setRefCodeModal({
        isOpen: true,
        data: {
          u_name: replaceAllString(decodeURIComponent(name), '+', ' '),
          u_phone: '',
          u_email: decodeURIComponent(email),
          type: ERegistrationType.Email,
          u_role: EUserRoles.Client,
          ref_code: '',
          u_details: {},
          st: '1',
        },
      }))
  }, [])

  return <ModalStack />
}