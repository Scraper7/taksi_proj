import React from 'react'
import './tabs.scss'
import cn from 'classnames'
import { gradient } from '../../tools/theme'

export interface ITab {
  id: string | number;
  label: string;
  img?: string;
  disabled?: boolean;
}

interface IProps {
  tabs: ITab[];
  activeTabID: ITab['id'];
  tabClassName?: string;
  containerClassName?: string;
  onChange: (id: ITab['id']) => any;
}

const Tabs: React.FC<IProps> = ({
  tabs,
  activeTabID,
  tabClassName,
  containerClassName,
  onChange,
}) => {
  return (
    <div className={cn('tabs', containerClassName)}>
      {tabs.map((item, index) => {
        return (
          <div
            className={cn(tabClassName, {
              'is-active': item.id === activeTabID,
              small: !item.img,
              disabled: item.disabled,
            })}
            style={{
              background: item.id === activeTabID ? gradient() : 'transparent',
            }}
            onClick={!item.disabled ? (e) => onChange(item.id) : () => {}}
            key={index}
          >
            {item.img && (
              <div className="img">
                <img src={item.img} alt={item.label} />
              </div>
            )}
            <span className="tabs__label">{item.label}</span>
          </div>
        )
      })}
    </div>
  )
}

export default Tabs
