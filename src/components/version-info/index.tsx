import React, { useState } from 'react'
import version from '../../version.json'
import './version-info.scss'
import Config from '../../config'
import { connect } from 'react-redux'
import { configActionCreators } from '../../state/config'
import SITE_CONSTANTS, {getApiConstants} from '../../siteConstants'
import { setCookie } from '../../utils/cookies'
import { ILanguage } from '../../types/types'

interface Language {
  native: string;
  ru: string;
  en: string;
  es: string | null;
  iso: string;
  logo: string;
  tr_code: string;
}

interface Languages {
  [key: string]: Language;
}

const mapDispatchToProps = {
  setLanguage: configActionCreators.setLanguage,
}

const connector = connect(null, mapDispatchToProps)

interface IProps {
  setLanguage?: typeof configActionCreators.setLanguage
}

const VersionInfo: React.FC<IProps> = ({ setLanguage }) => {
  const _dt = new Date(version.buildTimestamp)
  const [clickCount, setClickCount] = useState(0)
  const [lastClickTime, setLastClickTime] = useState(0)

  const handleClick = () => {
    console.log('Handling click')
    const currentTime = new Date().getTime()
    const timeDiff = currentTime - lastClickTime
    
    if (timeDiff < 500) {
      setClickCount(prev => prev + 1)
    } else {
      setClickCount(1)
    }
    
    setLastClickTime(currentTime)

    if (clickCount === 2) {
      console.log(getApiConstants()?.langs)
      const langs = getApiConstants()?.langs
      const russianLang = langs ? Object.entries(langs).find(([id, lang]) => lang.tr_code === 'ru') : undefined
      if (russianLang && setLanguage) {
        const [id, lang] = russianLang
        const language: ILanguage = {
          id: parseInt(id),
          iso: lang.iso,
          logo: lang.logo,
          native: lang.native,
          ru: lang.ru,
          en: lang.en,
          es: lang.es,
          tr_code: lang.tr_code
        }
        setCookie('user_lang', 'ru')
        setLanguage(language)
      }
      setClickCount(0)
    }
  }

  return <div className="version-info colored">
    <span 
      className="info-item _database" 
      onClick={handleClick}
    >
      {'DB: ' + (Config.SavedConfig ? Config.SavedConfig : 'default')}
    </span>
    <span className="info-item _name">{version.name}</span>
    <span className="info-item _build">{`ver. ${version.version}`}</span>
    <span className="info-item _date">{_dt.toLocaleString()}</span>
  </div>
}

export default connector(VersionInfo)