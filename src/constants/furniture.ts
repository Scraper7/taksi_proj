import { TRANSLATION } from '../localization'

export interface IFurnitureItem {
  id: number
  image: string,
  label: string,
}

const furnitureList = [
  'adult_bicycle',//0
  'armchair',
  'armchair_recliner',
  'art_picture',
  'bar',
  'bar_stool',
  'bench',
  'book_case',
  'book_shelf',
  'changing_table',
  'chest',//10
  'clock_stand',
  'coffee_table',
  'computer_desk',
  'couch',
  'crib',
  'dinning_room_cabinet',
  'dinning_chairs',
  'dinning_table',
  'dresser',
  'dresser_with_mirror',//20
  'dryer',
  'dumbbells',
  'elliptical_machine',
  'exercise_bike',
  'file_cabinet',
  'folding_chairs',
  'full_bed',
  'full_box_spring',
  'full_mattress',
  'gaming_desk',//30
  'glass_display_cabinet',
  'glass_table',
  'high_chair',
  'kids_bicycle',
  'king_bed',
  'king_box_spring',
  'king_mattress',
  'l_box',
  'large_box',
  'large_fridge',//40
  'love_seat',
  'm_box',
  'message_chair',
  'mirror',
  'mirrored_wardrobe',
  'night_lamp',
  'night_stand',
  'office_chair',
  'office_desk',
  'ottoman',//50
  'outdoor_dining_set',
  'outdoor_grill',
  'outdoor_kids_toys',
  'outdoor_lounge_set',
  'outdoor_umbrella',
  'piano',
  'plastic_box',
  'queen_bed',
  'queen_box_spring',
  'queen_mattress',//60
  'rug',
  's_box',
  'shelf',
  'small_fridge',
  'sofa',
  'sofa_bed',
  'sofa_sectional',
  'tall_chest',
  'tall_lamp',
  'toy_storage',//70
  'trampoline',
  'treadmill',
  'tv_over_75',
  'tv_stand',
  'tv_storage_glass',
  'tv_under_75',
  'twin_bed',
  'twin_box_spring',
  'twin_mattress',
  'wardrobe',//80
  'wardrobe_box',
  'washer',
  'workout_bench',
  'xl_box',
  'couch_recliner',
  'massage_chair',
  'medium_box',
  'small_box',
]

export default furnitureList.map((item, index) => ({
  label: TRANSLATION[item.toUpperCase() as keyof typeof TRANSLATION],
  image: `/assets/images/furniture/${item}.png`,
  id: index,
}))

type TRoomsFurniture = {[key: number]: IFurnitureItem['id'][], all: IFurnitureItem['id'][]}
export const roomsFurniture = Object.entries({
  0: [29, 37, 60, 79, 28, 36, 59, 78, 27, 35, 58, 77, 47, 46, 68, 10, 45, 80, 19, 20, 44],
  1: [65, 66, 67, 41, 14, 50, 85, 1, 2, 3, 11, 76, 73, 74, 75, 69, 63],
  2: [49, 13, 48, 30, 25],
  3: [15, 70, 33, 9, 8, 7],
  4: [16, 31, 18, 17, 32, 12, 26, 4, 5, 6, 64, 40],
  5: [82, 21, 34, 0, 86, 24, 72, 23, 22, 83, 52, 55, 54, 51, 71, 53, 81, 84, 39, 87, 88, 57],
  all: furnitureList.map((item, index) => index),
}).reduce((sum, [key, value]) => ({ ...sum, [key]: value.concat([61, 56]) }), {}) as TRoomsFurniture