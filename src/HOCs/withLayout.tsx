import React from 'react'
import Layout from '../components/Layout'

export function withLayout<T extends object>(
  Component: React.ComponentType<T>,
) {
  const displayName = Component.displayName || Component.name || 'Component'

  const ComponentWithLayout = (props: T) => {
    return <Layout><Component {...props} /></Layout>
  }
  ComponentWithLayout.displayName = `withLayout(${displayName})`

  return ComponentWithLayout
}