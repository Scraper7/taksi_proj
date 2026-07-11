import React from 'react'
import cn from 'classnames'
import SITE_CONSTANTS from '../../siteConstants'
import { ICar, IOrder } from '../../types/types'
import { isIntercityOrderLocationClass, isOfferOrder } from '../../tools/driverOffer'
import petitExactIcon from '../../assets/images/petit_exact.png'
import grandExactIcon from '../../assets/images/grand_exact.png'
import './styles.scss'

export type CarClassBadgeKind = 'petit' | 'grand'

function normalizeText(value?: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function getClassNameFromId(classId?: unknown) {
  if (classId === null || classId === undefined || classId === '')
    return ''

  const carClass = SITE_CONSTANTS.CAR_CLASSES[String(classId)] as any
  return normalizeText([
    carClass?.name,
    carClass?.title,
    carClass?.label,
    carClass?.code,
    carClass?.type,
    carClass?.id,
    classId,
  ].filter(Boolean).join(' '))
}

function getKindFromClassId(classId?: unknown): CarClassBadgeKind | null {
  const text = getClassNameFromId(classId)
  if (!text)
    return null

  if (text.includes('grand') || text.includes('grande') || text.includes('гранд'))
    return 'grand'

  if (text.includes('petit') || text.includes('петит') || text.includes('econom') || text.includes('эконом'))
    return 'petit'

  return null
}

export function getRequiredCarClassKind(order?: IOrder | null): CarClassBadgeKind {
  if (!order)
    return 'petit'

  const byClass = getKindFromClassId(order.b_car_class)
  if (byClass)
    return byClass

  if (isOfferOrder(order) || isIntercityOrderLocationClass(order.b_location_class))
    return 'grand'

  return 'petit'
}

export function getCandidateCarClassKind(car?: ICar | null, order?: IOrder | null): CarClassBadgeKind {
  const byCar = getKindFromClassId(car?.cc_id)
  if (byCar)
    return byCar

  return getRequiredCarClassKind(order)
}

interface IProps {
  kind: CarClassBadgeKind
  className?: string
  compact?: boolean
}

export default function CarClassBadge({ kind, className, compact }: IProps) {
  const label = kind === 'grand' ? 'GRAND' : 'PETIT'
  const iconSrc = kind === 'grand' ? grandExactIcon : petitExactIcon

  return (
    <span className={cn('car-class-badge', `car-class-badge--${kind}`, { 'car-class-badge--compact': compact }, className)} aria-label={`Класс авто ${label}`}>
      <img src={iconSrc} alt="" className="car-class-badge__image" />
    </span>
  )
}
