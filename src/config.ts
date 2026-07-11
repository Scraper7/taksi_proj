import { getCacheVersion } from './API/cacheVersion'
import store from './state'
import { setConfigError, setConfigLoaded } from './state/config/actionCreators'
import { DEFAULT_CONFIG_NAME } from './constants'

let _configName: string

const normalizeConfigName = (name?: string | null) => {
  const configName = (name || '').trim()
  return !configName || configName === '0' ?
    DEFAULT_CONFIG_NAME :
    configName
}

const applyConfigName = (url: string, name?: string | null) => {
  const script = document.createElement('script'),
    configName = normalizeConfigName(name),
    _name = `data_${configName}.js`
  getCacheVersion(url).then(ver => {
    script.src = `https://ibronevik.ru/taxi/cache/${_name}?ver=${ver}`
    script.async = true
    script.onload = () => {
      store.dispatch(setConfigLoaded())
    }
    script.onerror = () => {
      store.dispatch(setConfigError())
    }

    document.body.appendChild(script)
  })
}

class Config {
  constructor() {
    let params = new URLSearchParams(window.location.search),
      configParam = params.get('config'),
      clearConfigParam = params.get('clearConfig') !== null

    if (clearConfigParam) {
      this.clearConfig()
    } else if (configParam !== null) {
      this.setConfig(configParam)
    }

    if (configParam !== null) {
      params.delete('config')
    }
    if (!!clearConfigParam) {
      params.delete('clearConfig')
    }

    if (configParam !== null || clearConfigParam) {
      const _path = window.location.origin + window.location.pathname
      let _newUrl = params.toString() ?
        _path + '?' + params.toString() :
        _path
      window.history.replaceState({}, document.title, _newUrl)
    } else {
      this.setDefaultName()
    }
  }

  setConfig(name?: string | null) {
    const configName = normalizeConfigName(name)
    localStorage.setItem('config', configName)
    _configName = configName
    applyConfigName(this.API_URL, configName)
  }

  clearConfig() {
    localStorage.removeItem('config')
    _configName = DEFAULT_CONFIG_NAME
    applyConfigName(this.API_URL, DEFAULT_CONFIG_NAME)
  }

  setDefaultName() {
    this.setConfig(this.SavedConfig)
  }

  get API_URL() {
    return `${this.SERVER_URL}/api/v1`
  }

  get SERVER_URL() {
    return `https://ibronevik.ru/taxi/c/${_configName || DEFAULT_CONFIG_NAME}`
  }

  get SavedConfig() {
    return localStorage.getItem('config')
  }
}

const config = new Config()

export default config
