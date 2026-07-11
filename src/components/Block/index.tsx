import React from 'react'
import Button from '../Button'
import HTML from '../HTML'
import BigTruckServices from '../BigTruckServices'
import { UseFormReturn } from 'react-hook-form'
import ErrorBlock from '../ErrorBlock'
import { mapBlockObject } from '../../tools/utils'
import Card from '../Card/Card'
import { Checkbox } from '@mui/material'

interface IProps {
  form: UseFormReturn,
  values: {
    [x: string]: any
  },
  type?: string
  fieldName?: string
  fieldValue?: any
  [key: string]: any
}

const fieldNameRequired = ['BigTruckServices']

function Block({ form, values, type, fieldName, fieldValue, ...rawProps }: IProps) {
  if (type && fieldNameRequired.includes(type) && !fieldName) return <ErrorBlock text="fieldName отсутствует"/>

  const props = mapBlockObject(rawProps)

  switch(type) {
    case 'BigTruckServices': return <BigTruckServices value={values[fieldName as string]} onChange={v => form.setValue(fieldName as string, v)} />
    case 'Button': return <Button {...props} />
    case 'Card': return <Card {...props} active={values[fieldName as string] === fieldValue} onClick={_ => form.setValue(fieldName as string, fieldValue)} />
    case 'Checkbox': return <Checkbox {...props} />
    default: return <HTML {...props} />
  }
}

export default Block