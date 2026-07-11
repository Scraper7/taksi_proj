import axios from 'axios'
import { IPolygon } from '../types/polygon'
import Config from '../config'

export async function getPolygonsIdsOnPoint(
  [latitude, longitude]: [lat: number, lng: number],
): Promise<IPolygon['id'][]> {
  const key = `${latitude},${longitude}`
  const url = `${Config.API_URL}/data?fields=map_place_polygons&key=${key}`
  const { data } = await axios.get(url)
  const polygons = data.data.data.map_place_polygons
  return Object.keys(polygons)
}