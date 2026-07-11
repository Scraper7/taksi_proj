import React from 'react'
import './styles.scss'

interface IProps {
  hints: string[],
  onClick: (hint: string) => any
}

const component: React.FC<IProps> = ({
  hints,
  onClick,
}) => {
  return <div className='hints'>
    {hints.map(item => <span className="colored" onClick={() => onClick(item)}>{item}</span>)}
  </div>
}

export default component