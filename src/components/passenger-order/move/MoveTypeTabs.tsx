import Tabs, { ITab } from '../../tabs/Tabs'
import { t, TRANSLATION } from '../../../localization'
import React from 'react'
import images from '../../../constants/images'
import './styles.scss'

interface IProps {
  tab: EMoveTypes
  onChange: (id: EMoveTypes) => any
  visible: boolean
}

export enum EMoveTypes {
  Apartament,
  Handy,
  PickUp,
  SameDayPickUp,
}

const MoveTypeTabs: React.FC<IProps> = ({ tab, onChange, visible }) => {
  // TODO translate
  const TABS = {
    APARTAMENT: { id: EMoveTypes.Apartament, sid: 1, label: t(TRANSLATION.APARTAMENT_SHEDULE), image: 'apartamentShedule' },
    HANDY: { id: EMoveTypes.Handy, sid: 2, label: t(TRANSLATION.HANDY_MOVING), image: 'handyMoving' },
    PICK_UP: { id: EMoveTypes.PickUp, sid: 3, label: t(TRANSLATION.PICK_UP), image: 'pickUp' },
    SAME_DAY_PICK_UP: { id: EMoveTypes.SameDayPickUp, sid: 4, label: t(TRANSLATION.SAME_DAY_PICK_UP), image: 'sameDayPickUp' },
  }

  // TODO replace
  const availableMoveTypes = [1,2,3,4]
  // const availableMoveTypes =
  // SITE_CONSTANTS.LIST_OF_MODES_USED['5'] ? SITE_CONSTANTS.LIST_OF_MODES_USED['5'].subs : null

  if (!visible || !availableMoveTypes) return null

  let _tabs = availableMoveTypes
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

  return <div className="move-type">
    <label
      className="input__label"
    >
      {t(TRANSLATION.TYPE_RELOCATION)}
    </label>
    <Tabs
      tabs={_tabs as ITab[]}
      activeTabID={tab}
      tabClassName="move-type__tab"
      onChange={(id) => {
        if (onChange) onChange(id as EMoveTypes)
      }
      }
    />
  </div>
}

export default React.memo(MoveTypeTabs)
