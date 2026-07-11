import { createSelector } from 'reselect'
import { IArea } from '../../types/types'
import { IWayGraph, WayGraph } from '../../tools/maps'
import { IRootState } from '../'
import { moduleName, IAreasState } from './constants'

export const moduleSelector = (state: IRootState) => state[moduleName]
export const areas = createSelector(moduleSelector, state => state.areas)
export const area = createSelector([
  areas,
  (state: IRootState, id: IArea['id']) => id,
], (areas, id) => areas[id])

let latestWayGraph = new WayGraph()
let latestAreas: IAreasState['areas'] = {}
export function wayGraph(state: IRootState): IWayGraph {
  const currentAreas = areas(state)
  if (currentAreas !== latestAreas) {
    let rebuilt = false
    for (const id in latestAreas)
      if (!(id in currentAreas)) {
        const currentAreaList = []
        for (const areaId in currentAreas)
          currentAreaList.push(currentAreas[areaId])
        latestWayGraph = new WayGraph(undefined, ...currentAreaList)
        rebuilt = true
        break
      }
    if (!rebuilt) {
      for (const id in currentAreas)
        if (!(id in latestAreas))
          latestWayGraph.extend(currentAreas[id])
      // Создание копии объекта для проверки равенства
      // без рекурсивного копирования свойств с целью оптимизации
    }
    latestAreas = currentAreas
  }
  return latestWayGraph
}
