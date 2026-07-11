import { Heap } from 'heap-js'
import { IArea, IWay } from '../types/types'

export const EARTH_RADIUS = 6371000

export function calculateDistance(
  [lat1, lng1]: [number, number],
  [lat2, lng2]: [number, number],
): number {
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS * c
}

export function toRadians(degrees: number): number {
  return degrees * Math.PI / 180
}

export function geopositionToPoint(
  geoposition: GeolocationPosition,
): [lat: number, lng: number] {
  const { latitude, longitude } = geoposition.coords
  return [latitude, longitude]
}

export interface IWayGraph extends Iterable<IWayGraphNode> {
  getNode(id: number): IWayGraphNode | undefined
  findShortestPath(
    startId: IWayGraphNode['id'],
    endId: IWayGraphNode['id']
  ): [path: IWayGraphNode[], distance: number]
  findClosestNode(
    latitude: number,
    longitude: number
  ): [node: IWayGraphNode | undefined, distance: number]
}

export interface IWayGraphNode {
  readonly id: number,
  readonly latitude: number,
  readonly longitude: number,
  readonly edges: Iterable<Readonly<TWayGraphEdge>>
  isTurnAllowed(fromWay: number, toWay: number): boolean
}

export type TWayGraphEdge = [
  toNode: IWayGraphNode,
  weight: number,
  wayId: IWay['id'],
]

export class WayGraph implements IWayGraph {

  readonly closestNodeRadius: number

  private nodes: Map<WayGraphNode['id'], WayGraphNode> = new Map()

  /**
   * @param closestNodeRadius Максимальное допустимое расстояние (в метрах) до точки при поиске ближайшего узла
   */
  constructor(closestNodeRadius: number = 1000, ...areas: IArea[]) {
    this.closestNodeRadius = closestNodeRadius
    for (const area of areas)
      this.extend(area)
  }

  extend(area: IArea): void {
    for (const node of area.nodes) {
      const graphNode = new WayGraphNode(node.id, node.latitude, node.longitude)
      for (const { fromWayId, toWayId } of node.turnRestrictions ?? [])
        graphNode.addTurnRestriction(fromWayId, toWayId)
      this.nodes.set(node.id, graphNode)
    }

    for (const way of area.ways) {
      let prevNodeId: IWayGraphNode['id'] | undefined
      for (const segment of way.segments) {
        const node1Id = prevNodeId
        const node2Id = segment.nodeId
        prevNodeId = node2Id
        if (!node1Id)
          continue
        const node1 = this.nodes.get(node1Id)
        const node2 = this.nodes.get(node2Id)
        if (!node1 || !node2)
          continue
        node1.addEdge(node2, segment.weight, way.id)
        if (!way.oneway)
          node2.addEdge(node1, segment.weight, way.id)
      }
    }
  }

  [Symbol.iterator](): Iterator<IWayGraphNode> {
    return this.nodes.values()
  }

  getNode(id: IWayGraphNode['id']): IWayGraphNode | undefined {
    return this.nodes.get(id)
  }

  findShortestPath(
    startId: IWayGraphNode['id'],
    endId: IWayGraphNode['id'],
  ): [IWayGraphNode[], number] {
    const startNode = this.getNode(startId)
    const endNode = this.getNode(endId)
    if (!startNode || !endNode)
      return [[], Infinity]

    interface NodeListItem {
      node: IWayGraphNode
      prev?: NodeListItem
    }
    interface QueueItem {
      distance: number
      prevWayId?: IWay['id']
      path: NodeListItem
    }

    const distances = new Map<IWayGraphNode['id'], Map<IWay['id'], number>>()
    const pq = new Heap<QueueItem>((a, b) => a.distance - b.distance)
    pq.push({
      distance: 0,
      path: { node: startNode },
    })
    const visited = new Map<IWayGraphNode['id'], Set<IWay['id']>>()

    while (pq.length > 0) {
      const current = pq.pop()!
      const currentNode = current.path.node

      if (currentNode.id === endId) {
        const path = []
        for (let item = current.path; item; item = item.prev!)
          path.push(item.node)
        return [path.reverse(), current.distance]
      }

      if (current.prevWayId) {
        if (!visited.has(currentNode.id))
          visited.set(currentNode.id, new Set())
        if (visited.get(currentNode.id)!.has(current.prevWayId)) continue
        visited.get(currentNode.id)!.add(current.prevWayId)
      }

      for (const [neighbor, weight, wayId] of currentNode.edges) {
        if (
          current.prevWayId !== undefined &&
          !currentNode.isTurnAllowed(current.prevWayId, wayId)
        ) continue

        if (visited.get(neighbor.id)?.has(wayId)) continue

        const distance = current.distance + weight

        if (!distances.has(neighbor.id))
          distances.set(neighbor.id, new Map())
        if (distance < (distances.get(neighbor.id)!.get(wayId) ?? Infinity)) {
          distances.get(neighbor.id)!.set(wayId, distance)
          pq.push({
            distance,
            prevWayId: wayId,
            path: { prev: current.path, node: neighbor },
          })
        }
      }
    }

    return [[], Infinity]
  }

  findClosestNode(
    latitude: number,
    longitude: number,
  ): [IWayGraphNode | undefined, number] {
    let closestNode: IWayGraphNode | undefined
    let closestDistance = this.closestNodeRadius

    for (const node of this) {
      const distance = calculateDistance(
        [latitude, longitude],
        [node.latitude, node.longitude],
      )
      if (distance < closestDistance) {
        closestDistance = distance
        closestNode = node
      }
    }

    return closestNode ?
      [closestNode, closestDistance] :
      [undefined, Infinity]
  }

}

class WayGraphNode implements IWayGraphNode {

  readonly id: number
  readonly latitude: number
  readonly longitude: number
  get edges(): Iterable<Readonly<TWayGraphEdge>> { return this._edges }

  private _edges: TWayGraphEdge[] = []
  private turnRestrictions: Map<IWay['id'], Set<IWay['id']>> = new Map()

  constructor(id: number, latitude: number, longitude: number) {
    this.id = id
    this.latitude = latitude
    this.longitude = longitude
  }

  addEdge(toNode: IWayGraphNode, weight: number, wayId: IWay['id']) {
    this._edges.push([toNode, weight, wayId])
  }

  addTurnRestriction(fromWayId: IWay['id'], toWayId: IWay['id']) {
    if (!this.turnRestrictions.has(fromWayId))
      this.turnRestrictions.set(fromWayId, new Set())
    this.turnRestrictions.get(fromWayId)!.add(toWayId)
  }

  isTurnAllowed(fromWayId: IWay['id'], toWayId: IWay['id']): boolean {
    return !this.turnRestrictions.get(fromWayId)?.has(toWayId)
  }

}