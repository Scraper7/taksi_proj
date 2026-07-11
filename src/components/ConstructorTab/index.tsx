import React from 'react'
import { UseFormReturn } from 'react-hook-form'
import Block from '../Block'

interface ISettings {
  blocks?: {[key: string]: any}[]
}

interface IProps {
  form: UseFormReturn,
  values: {
    [x: string]: any
  },
  settings: ISettings
}

const ConstructorTab: React.FC<IProps> = ({ form, values, settings }) => {
  return (
    <>
      {settings.blocks?.map(item => <Block form={form} values={values} {...item} />)}
    </>
  )
}

export default ConstructorTab