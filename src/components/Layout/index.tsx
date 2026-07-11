import React from 'react'
import { connect, ConnectedProps } from 'react-redux'
import { IRootState } from '../../state'
import { configSelectors } from '../../state/config'
import Header from '../Header'
import './styles.scss'

const mapStateToProps = (state: IRootState) => ({
  configStatus: configSelectors.status(state),
  language: configSelectors.language(state),
})

const connector = connect(mapStateToProps)

interface IProps extends ConnectedProps<typeof connector> {}

function Layout({
  children,
  configStatus,
  language,
}: React.PropsWithChildren<IProps>) {
  return (
    <main className="layout">
      <Header key={`${configStatus}-${language?.id || ''}-${language?.iso || ''}`} className="layout__header" />
      <div className="layout__content">{children}</div>
    </main>
  )
}

export default connector(Layout)
