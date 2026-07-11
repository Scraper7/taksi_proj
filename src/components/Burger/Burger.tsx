import React from 'react'
import './styles.scss'

interface IBurgerProps extends React.HTMLAttributes<HTMLButtonElement> {
    isOpen: boolean
}

export function Burger({ isOpen, onClick }: IBurgerProps) {
  return (
    <button
      className='burger-button'
      onClick={onClick}
    >
      <div className={'burger-button__line' + (isOpen ? ' burger-button__line__s' : ' burger-button__line__l')}></div>
      <div className='burger-button__line burger-button__line__m'></div>
      <div className={'burger-button__line' + (isOpen ? ' burger-button__line__l' : ' burger-button__line__s')}></div>
    </button>
  )
}
