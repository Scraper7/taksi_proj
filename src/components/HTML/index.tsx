import React from 'react'
import ReactHtmlParser from 'react-html-parser'

interface IProps {
  html?: string
}

function HTML({ html = '' }: IProps) {
  return (
    <>
      {ReactHtmlParser(html)}
    </>
  )
}

export default HTML