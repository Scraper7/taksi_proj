import axios from 'axios'
import { IResponse } from '../types/api'
import { addToFormData, apiMethod, IApiMethodArguments } from '../tools/api'
import Config from '../config'

export const sendPosition = apiMethod(async(
  { formData }: IApiMethodArguments,
  { latitude, longitude }: {
    latitude: number
    longitude: number
  },
): Promise<IResponse<'200', {}> | IResponse<'404', {}>> => {
  addToFormData(formData, { latitude, longitude })
  const { data } = await axios.post(`${Config.API_URL}/location`, formData)
  return data
})