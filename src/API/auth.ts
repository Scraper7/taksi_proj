import axios from 'axios'
import { EUserRoles, ITokens, IUser } from '../types/types'
import { convertUser, reverseConvertUser } from '../tools/convert'
import { addToFormData, apiMethod, IApiMethodArguments } from '../tools/api'
import Config from '../config'
import { ERegistrationType } from '../state/user/constants'

type TRegisterExtraData = {
  password?: string
}

type TRegisterData = Partial<IUser> & {
  data?: TRegisterExtraData
  password?: string
  password_confirm?: string
  st?: number
}

const _register = (
  { formData }: IApiMethodArguments,
  data: TRegisterData,
): Promise<{
  u_id: IUser['u_id'],
  email_status: boolean,
  string: string,
  error?: string
} | null> => {
  const { password, password_confirm, data: extraData, ...registerData } = data
  const secureExtraData: TRegisterExtraData = {
    ...(extraData ?? {}),
  }

  if (password && !secureExtraData.password) {
    secureExtraData.password = password
  }

  addToFormData(formData, reverseConvertUser(registerData))

  // API accepts a user-defined registration password inside the additional `data` payload.
  // Password is not a part of IUser and is not saved in the user object on the frontend.
  if (secureExtraData.password) {
    addToFormData(formData, {
      data: JSON.stringify(secureExtraData),
    })
  }

  if (data.u_role === EUserRoles.Driver) addToFormData(formData, { 'st': 1 })
  return axios.post(`${Config.API_URL}/register`, formData)
    .then(res => res.data)
    .then(res => {
      if (res.status === 'error') {
        return {
          u_id: null,
          email_status: false,
          string: res.data,
          error: res.message,
        }
      }
      return res.data
    })
}
/**
 * @returns email_status - if email is specified
 * @returns string - password if email is not specified
 */
export const register = apiMethod<typeof _register>(_register, { authRequired: false })

const _remindPassword = (
  { formData }: IApiMethodArguments,
  email: IUser['u_email'],
) => {
  addToFormData(formData, {
    u_email: email,
  })

  return axios.post(`${Config.API_URL}/remind`, formData)
    .then(res => res.data)
    .then(res => res.status === 'error' ? Promise.reject() : res)
}
export const remindPassword = apiMethod<typeof _remindPassword>(_remindPassword, { authRequired: false })

const _login = (
  { formData }: IApiMethodArguments,
  data: {
    login: IUser['u_email'] | IUser['u_phone'],
    password?: string | undefined,
    type: ERegistrationType
  },
): Promise<{ user: IUser | null, tokens: ITokens | null, data: string | null } | null> => {
  addToFormData(formData, {
    ...data,
    au: 'f',
  })

  return axios.post(`${Config.API_URL}/auth`, formData)
    .then(res => res.data)
    .then(res => {
      if (res.message === 'wrong login') {
        return {
          user: null,
          tokens: null,
          data: res.message,
        }
      }
      if (res.data === 'code sent') {
        return {
          user: null,
          tokens: null,
          data: res.data,
        }
      }
      if (res.message === 'wrong phone'){
        return {
          user: null,
          tokens: null,
          data: res.message,
        }
      }
      if (res.message === 'wrong password') {
        return {
          user: null,
          tokens: null,
          data: res.message,
        }
      }

      if (!res?.auth_hash) {
        return Promise.reject()
      }
      const tokenFormData = new FormData()
      addToFormData(tokenFormData, {
        auth_hash: res?.auth_hash,
      })
      return axios.post(`${Config.API_URL}/token`, tokenFormData, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
        .then(tokenRes => tokenRes)
        .then(tokenRes => ({
          user: convertUser(res.auth_user),
          tokens: {
            token: tokenRes.data.data.token,
            u_hash: tokenRes.data.data.u_hash,
          },
          data: null,
        }))
    })
}
export const login = apiMethod<typeof _login>(_login, { authRequired: false })

const _whatsappSignUp = (
  _: IApiMethodArguments,
  data: {
    login: IUser['u_phone'],
    type: ERegistrationType
    ref_code?: string | undefined,
  },
): Promise< {u_id: IUser['u_id'], string:string} | null> => {
  const waData = new FormData()
  addToFormData(waData, {
    u_phone: data.login,
    type: ERegistrationType.Whatsapp,
    u_role: EUserRoles.Client,
  })
  return axios.post(`${Config.API_URL}/register`, waData)
    .then(res => res.data)
    .then(res => {
      if (res.status === 'error') return Promise.reject(res)
      return res.data
    })
}
export const whatsappSignUp = apiMethod<typeof _whatsappSignUp>(_whatsappSignUp, { authRequired: false })

const _googleLogin = (
  { formData }: IApiMethodArguments,
  auth: {
    data: {
      u_name: string,
      u_phone: string,
      u_email: IUser['u_email'],
      type: ERegistrationType,
      u_role: EUserRoles,
      ref_code: string,
      u_details: any,
      st: string | undefined,
    } | null
    auth_hash: string | null
  },
): Promise<{ user: IUser, tokens: ITokens } | null> => {
  console.log(auth)
  if(auth.auth_hash === null) {
    addToFormData(formData, {
      ...auth.data,
    })
    return axios.post(`${Config.API_URL}/register`, formData)
      .then(res => res.data)
      .then(res => {
        if (!res?.data?.token || !res?.data?.u_hash) {
          return Promise.reject()
        }
        const tokenFormData = new FormData()
        addToFormData(tokenFormData, {
          token: res?.data?.token,
          u_hash: res?.data?.u_hash,
        })
        return axios.post(`${Config.API_URL}/token/authorized`, tokenFormData,{ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
          .then(userRes => userRes.data)
          .then(userRes => {
            return {
              user: convertUser(userRes.auth_user),
              tokens: {
                token: userRes.data.token,
                u_hash: userRes.data.u_hash,
              },
            }
          })
      })
  }
  else {
    const tokenFormData = 'auth_hash='+encodeURIComponent(auth.auth_hash)
    return axios.post(`${Config.API_URL}/token`, tokenFormData, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(tokenRes => tokenRes.data)
      .then(tokenRes => {
        return {
          user: convertUser(tokenRes.auth_user),
          tokens: {
            token: tokenRes.data.token,
            u_hash: tokenRes.data.u_hash,
          },
        }
      })
  }
}
export const googleLogin = apiMethod<typeof _googleLogin>(_googleLogin, { authRequired: false })

const _logout = (
  { formData }: IApiMethodArguments,
): Promise<any> => {
  return axios.post(`${Config.API_URL}/logout/?`)
}
export const logout = apiMethod<typeof _logout>(_logout, { authRequired: false })