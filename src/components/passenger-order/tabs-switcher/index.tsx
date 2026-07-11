import Tabs, { ITab } from '../../tabs/Tabs'
import { t, TRANSLATION } from '../../../localization'
import React, { useEffect, useState } from 'react'
import images from '../../../constants/images'
import SITE_CONSTANTS from '../../../siteConstants'
import './tabs-switcher.scss'

export const TABS = {
  VOTING: {
    id: 'voting',
    sid: 1,
    label: TRANSLATION.VOTING,
    image: 'voting',
  },
  WAITING: {
    id: 'waiting',
    sid: 2,
    label: TRANSLATION.WAITING,
    image: 'waiting',
  },
  DELIVERY: {
    id: 'delivery',
    sid: 3,
    label: TRANSLATION.DELIVERY,
    image: 'delivery',
  },
  MOTORCYCLE: {
    id: 'motorcycle',
    sid: 4,
    label: TRANSLATION.MOTORCYCLE,
    image: 'motorcycle',
  },
  MOVE: {
    id: 'move',
    sid: 5,
    label: TRANSLATION.MOVING_THINGS,
    image: 'move',
  },
  WAGON: { id: 'wagon', sid: 6, label: TRANSLATION.WAGON, image: 'bigTruck' },
  TRIP: { id: 'trip', sid: 7, label: TRANSLATION.TRIP, image: 'bigTruck' },
  WASH: { id: 'wash', sid: 8, label: TRANSLATION.CAR_WASH, image: 'carWash' },
}

interface IProps {
    tab: string;
    onChange: (id: string) => any;
}

const TabsSwitcher: React.FC<IProps> = ({ tab, onChange }) => {
  const [visible, setVisible] = useState(true)

  let _tabs = Object.keys(SITE_CONSTANTS.LIST_OF_MODES_USED)
    .map((key) => {
      let _entry = Object.entries(TABS).find((item) => {
        return item[1].sid === +key
      })

      let _tab = _entry ? TABS[_entry[0] as keyof typeof TABS] : null

      return _tab ?
        {
          id: _tab.id,
          label: t(_tab.label),
          img: images[_tab.image as keyof typeof images],
        } :
        null
    })
    .filter((item) => item)

  useEffect(() => {
    if (!_tabs.length) setVisible(false)

    if (_tabs.length === 1) {
      if (onChange && _tabs[0]) {
        onChange(_tabs[0].id)
      }
      setVisible(false)
    }
  }, [_tabs, onChange])

  return visible ?
    (
      <div className="switchers">
        <Tabs
          tabs={_tabs as ITab[]}
          activeTabID={tab}
          containerClassName="pageMaxWidthTabs"
          tabClassName="smallTab"
          onChange={(id) => {
            if (onChange) onChange(id as string)
          }}
        />
      </div>
    ) :
    null
}

export default TabsSwitcher
