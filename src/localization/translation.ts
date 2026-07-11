import COMMON from './common'
import CATEGORIES from './categories'
import { objectFromEntries } from '../tools/compat'

const categoryProxies = objectFromEntries(
  Object.entries(CATEGORIES).map(([categoryKey, categoryName]) => [
    categoryKey,
    new Proxy({}, {
      get(target, key: string) {
        return `${categoryName}.${key}`
      },
    }),
  ]),
) as Record<keyof typeof CATEGORIES, any>

export default {
  ...COMMON,
  ...categoryProxies,
}