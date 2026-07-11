import Tabs, { ITab } from '../../tabs/Tabs'
import { t, TRANSLATION } from '../../../localization'
import React from 'react'
import images from '../../../constants/images'
import SITE_CONSTANTS from '../../../siteConstants'

export enum ECourierAutoTypes {
  Light,
  Truck,
  Wagon,
  Foot,
  Bicycle,
  Motorcycle,
}

interface IProps {
  tab: ECourierAutoTypes,
  onChange: (id: ECourierAutoTypes) => any,
  visible: boolean
}

const CouriersTransportTabs: React.FC<IProps> = ({ tab, onChange, visible }) => {
  const TABS = {
    FOOT: { id: ECourierAutoTypes.Foot, sid: 1, label: t(TRANSLATION.PEDESTRIAN), image: 'foot' },
    BICYCLE: { id: ECourierAutoTypes.Bicycle, sid: 2, label: t(TRANSLATION.BICYCLE), image: 'bicycle' },
    MOTORCYCLE: { id: ECourierAutoTypes.Motorcycle, sid: 3, label: t(TRANSLATION.MOTORCYCLE), image: 'motorcycle' },
    LIGHT: { id: ECourierAutoTypes.Light, sid: 4, label: t(TRANSLATION.LIGHT_AUTO), image: 'light' },
    TRUCK: { id: ECourierAutoTypes.Truck, sid: 5, label: t(TRANSLATION.TRUCK), image: 'truck' },
    WAGON: { id: ECourierAutoTypes.Wagon, sid: 6, label: t(TRANSLATION.WAGON), image: 'wagon' },
  }

  const _availableCourierTransport = SITE_CONSTANTS.LIST_OF_MODES_USED['3'] ? SITE_CONSTANTS.LIST_OF_MODES_USED['3'].subs : null

  if (!visible || !_availableCourierTransport) return null

  let _tabs = _availableCourierTransport
    .map((key) => {
      let _entry = Object.entries(TABS).find((item) => {
        return item[1].sid === +key
      })

      let _tab = _entry ? TABS[_entry[0] as keyof typeof TABS] : null

      return _tab ? { id: _tab.id, label: _tab.label, img: images[_tab.image as keyof typeof images] } : null
    })
    .filter(item => item)

  if (!_tabs.length) return null

  if (_tabs.length === 1) {
    if (onChange && _tabs[0]) {onChange(_tabs[0].id)}
    return null
  }

  return <div className='courier-auto'>
    <label
      className="input__label"
    >
      {t(TRANSLATION.COURIER_TRANSPORT)}
    </label>
    <Tabs
      tabs={_tabs as ITab[]}
      activeTabID={tab}
      onChange={(id) => {
        if (onChange) onChange(id as ECourierAutoTypes)
      }
      }
    />
  </div>
}

export default React.memo(CouriersTransportTabs)
