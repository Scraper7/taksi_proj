import React from 'react'
import SITE_CONSTANTS, { EIconsPalettes } from '../../siteConstants'
import { names } from '../../constants/icons'
import { objectFromEntries } from '../../tools/compat'

interface IProps extends React.SVGProps<SVGSVGElement> {
  src: keyof typeof names
}

export default function Icon({ src, ...svgProps }: IProps) {
  const directory = SITE_CONSTANTS.ICONS_PALETTE_FOLDER
  if (!components[directory][src])
    components[directory][src] = React.lazy(() => importIcon(directory, src))
  const SVG = components[directory][src]
  return <SVG {...svgProps} />
}

// Статическое перечисление путей к директориям для лучшей совместимости с webpack
function importIcon(directory: EIconsPalettes, src: keyof typeof names) {
  switch (directory) {
    case EIconsPalettes.GHA:
      return import(`../../assets/icons/GHA/${names[src]}?svgr`)
    case EIconsPalettes.Default:
      return import(`../../assets/icons/default/${names[src]}?svgr`)
    default:
      throw Error(`Directory "${directory}" is not supported`)
  }
}

const components: Record<
  EIconsPalettes,
  Partial<Record<
    keyof typeof names,
    React.FC<React.SVGProps<SVGSVGElement>>
  >>
> = objectFromEntries(
  Object.keys(EIconsPalettes).map(directory => [directory, {}]),
) as Record<EIconsPalettes, {}>