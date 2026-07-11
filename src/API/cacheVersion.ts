import axios from 'axios'

export const getCacheVersion = (url: string) => axios.get(`${url}/?cv=`)
  .then(response => response?.data['cache version'])