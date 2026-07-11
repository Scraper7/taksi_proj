import { EOrderProfitRank } from '../types/types'

export const PROFIT_RANKS: ReadonlyMap<EOrderProfitRank, number> = new Map([
  [EOrderProfitRank.Low, 0],
  [EOrderProfitRank.Medium, 100],
  [EOrderProfitRank.High, 200],
])

export const DEFAULT_CITY_ID = 76