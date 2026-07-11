import moment from 'moment'
import { IUser } from '../types/types'

export default [
  {
    u_id: '1',
    u_registration: moment(),
    u_name: 'John',
    u_family: 'Smith',
    u_replies: [
      {
        id: '1',
        date: moment(),
        customerName: 'Иван Иванов',
        payment: 25,
        content: 'Текст отзыва текст отзыва текст отзыва текст отзыва текст отзыва',
      },
      {
        id: '2',
        date: moment(),
        customerName: 'Иван Иванов',
        payment: 25,
        content: 'Текст отзыва текст отзыва текст отзыва текст отзыва текст отзыва',
      },
    ],
  },
  {
    u_id: '2',
    u_name: 'Ivan',
    u_family: 'Ivanov',
    u_registration: moment(),
    u_choosen: 1,
    u_replies: [
      {
        id: '3',
        date: moment(),
        customerName: 'Иван Иванов',
        payment: 25,
        content: 'Текст отзыва текст отзыва текст отзыва текст отзыва текст отзыва',
      },
    ],
  },
] as IUser[]