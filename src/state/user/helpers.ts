import * as API from './../../API'

export function uploadFiles(data: any) {
  const filesMap: Record<string, any[]> = data.files
  const additionalDetails: any = data.u_details
  const params: any = data.tokens
  const uploads = Object.keys(filesMap)
    .filter(key => Array.isArray(filesMap[key]))
    .map(key => {
      const files = filesMap[key]
        .filter((item: [any, File]) => !item[0])
        .map((item: [any, File]) => item[1])
      const promises = files.map((file: File) => API.uploadFile({ file, ...params }))
      return Promise.all(promises).then(
        (res: any[]) => res.reduce((acc, item) => ({
          [key]: [...acc[key], item.data?.data?.dl_id],
        }), { [key]: [] }),
      ).then((res: any) => ({ [key]: JSON.stringify(res[key]) }))
    })

  return Promise.all(uploads).then(res => {
    const u_details = res.reduce((acc, item) => ({ ...acc, ...item }), additionalDetails)
    return API.editUserAfterRegister({
      u_details,
      u_id: `${params?.u_id}`,
      token: params?.token,
      u_hash: params?.u_hash,
    })
  })
}

export function uploadRegisterFiles(params: any) {
  const { filesToUpload, response, u_details } = params
  const uploadsName: string[] = []
  const uploads = filesToUpload
    .filter((item: any) => item.file)
    .map((item: any) => {
      uploadsName.push(item.name)
      return API.uploadFile({ file: item.file, ...response })
    })
  return Promise.all(uploads).then((res: any[]) => {
    const userData: Record<string, any> = {}
    res.forEach((item, i) => {
      const resData = item.data || {}
      if (resData.status !== 'success') return
      const fileId = resData.data?.dl_id
      userData[uploadsName[i]] = (userData[uploadsName[i]] || []).concat(fileId)
    })
    Object.keys(userData).forEach(key => {
      userData[key] = JSON.stringify(userData[key])
    })
    if (u_details) {
      Object.keys(u_details).forEach(key => {
        userData[key] = u_details[key]
      })
    }
    return userData
  })
    .then(u_details => {
      return API.editUserAfterRegister({
        u_details,
        u_id: `${response?.u_id}`,
        token: response?.token,
        u_hash: response?.u_hash,
      })
    })
}