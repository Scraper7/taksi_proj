export interface IArea {
  id: number,
  nodes: IWayNode[],
  ways: IWay[],
}

export interface IWay {
  id: number,
  segments: IWaySegment[],
  oneway?: boolean,
}

export interface IWaySegment {
  nodeId: IWayNode['id'],
  weight: number,
}

export interface IWayNode {
  id: number,
  latitude: number,
  longitude: number,
  turnRestrictions?: IWayTurnRestriction[],
}

export interface IWayTurnRestriction {
  fromWayId: IWay['id'],
  toWayId: IWay['id'],
}