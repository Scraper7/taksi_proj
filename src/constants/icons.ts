import SITE_CONSTANTS from '../siteConstants'

export const names = {
  alarm: 'alarm.svg',
  carNearby: 'car-nearby.svg',
  timeWait: 'time-wait.svg',
  call: 'call.svg',
  car: 'car.svg',
  money: 'money.svg',
  moneyCircle: 'money-circle.svg',
  msg: 'msg.svg',
  people: 'people.svg',
  whatsapp: 'whatsapp.svg',
  chat: 'chat.svg',
  star: 'star-empty.svg',
  filledStar: 'star-filled.svg',
  locationPoint: 'location-point.svg',
  clock: 'clock.svg',
}

export default new Proxy(names, {
  get(target, key: keyof typeof names) {
    const paletteDirectory = SITE_CONSTANTS.ICONS_PALETTE_FOLDER &&
      `${SITE_CONSTANTS.ICONS_PALETTE_FOLDER}/`
    return `assets/icons/${paletteDirectory}${target[key]}`
  },
})