import React from 'react'

interface IProps {
  text: string
}

export default function Error({ text }: IProps) {
  return (
    <div>
      {text}
    </div>
  )
}