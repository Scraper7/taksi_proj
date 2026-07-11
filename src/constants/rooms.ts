import { TRANSLATION } from '../localization'
import { IRoom } from '../types/types'

export default [
  TRANSLATION.BEDROOM,
  // TRANSLATION.KITCHEN,
  TRANSLATION.LIVING_ROOM,
  TRANSLATION.OFFICE,
  TRANSLATION.CHILDRENS_ROOM,
  TRANSLATION.DINNING_ROOM,
  TRANSLATION.OTHERS,
].map((item, index) => ({ label: item, id: index })) as IRoom[]