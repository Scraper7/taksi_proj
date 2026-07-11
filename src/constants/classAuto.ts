import images from './images'
const { economTaxi, businessTaxi, notoTaxi, cash, card } = images

export const class_auto = [
  {
    id: 1,
    src: economTaxi,
    height: '105px',
    width: '28%',
  },
  {
    id: 3,
    src: businessTaxi,
    height: '105px',
    width: '28%',
  },
  {
    id: 0,
    src: notoTaxi,
    height: '105px',
    width: '28%',
  },
]

// TODO use
export const cards = [
  {
    id: 1,
    src: cash,
    color: '#898888',
    height: '106px',
    width: '40%',
  },
  {
    id: 2,
    src: card,
    color: '#898888',
    height: '106px',
    width: '40%',
  },
]