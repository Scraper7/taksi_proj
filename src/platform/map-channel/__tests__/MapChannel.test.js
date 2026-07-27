/**
 * MapChannel + цепочка Stage 1.
 *
 * Два предмета проверки:
 *  1) формат строк [InteractionContract] — механизм приёмки, меняться не должен;
 *  2) цепочка Action → ApplicationHandler → Event → UI-подписчик, включая
 *     перенос correlationId и решение «карточку в моке не открываем».
 */

import { AppInteractionContract } from '../AppInteractionContract'
import { MapChannel } from '../MapChannel'
import { registerMapApplicationHandler } from '../MapApplicationHandler'
import {
  DRIVER_ORDER_SELECTED_EVENT,
  DRIVER_ORDER_SELECT_ACTION,
} from '../map-channel-protocol'

const TIMESTAMP = '2026-07-27T10:00:00.000Z'
const CORRELATION_ID = 'map-test-correlation-1'

const EXPECTED_ACTION = {
  type: 'driver.order.select',
  payload: { orderId: '42' },
  metadata: { source: 'map', timestamp: TIMESTAMP, correlationId: CORRELATION_ID },
}

const EXPECTED_EVENT = {
  type: 'driver.order.selected',
  payload: { orderId: '42' },
  metadata: { source: 'map', timestamp: TIMESTAMP, correlationId: CORRELATION_ID },
}

/** Канал с детерминированными источниками времени и id. */
const createChannel = contract =>
  new MapChannel(contract, () => TIMESTAMP, () => CORRELATION_ID)

describe('MapChannel: формат строк [InteractionContract]', () => {
  let logSpy

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('Action логируется как "[InteractionContract] Action", тип, объект', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)

    channel.selectOrder('42')

    expect(logSpy).toHaveBeenCalledWith(
      '[InteractionContract] Action',
      DRIVER_ORDER_SELECT_ACTION,
      EXPECTED_ACTION,
    )
  })

  it('Event логируется как "[InteractionContract] Event", тип, объект', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)
    channel.subscribe(() => undefined)

    channel.selectOrder('42')

    expect(logSpy).toHaveBeenCalledWith(
      '[InteractionContract] Event',
      DRIVER_ORDER_SELECTED_EVENT,
      EXPECTED_EVENT,
    )
  })

  it('за один клик — ровно две строки: Action и Event', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)
    channel.subscribe(() => undefined)

    channel.selectOrder('42')

    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(logSpy.mock.calls[0][0]).toBe('[InteractionContract] Action')
    expect(logSpy.mock.calls[1][0]).toBe('[InteractionContract] Event')
  })
})

describe('MapChannel: невалидный orderId', () => {
  let logSpy
  let errorSpy

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('пустой orderId: ни Action, ни Event, ни строки лога, ни исключения', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    const handler = jest.fn()
    contract.registerHandler(handler)
    channel.subscribe(() => undefined)

    expect(() => channel.selectOrder('')).not.toThrow()
    expect(() => channel.selectOrder(undefined)).not.toThrow()

    expect(handler).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })
})

describe('Цепочка: Action → ApplicationHandler → Event → UI-подписчик', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  /** UI-подписчик из useMapChannel, воспроизведённый без React. */
  const subscribeUi = (channel, getDeps) => channel.subscribe(event => {
    if (event.type !== DRIVER_ORDER_SELECTED_EVENT)
      return
    const { mockEnabled, setOrderCardModal } = getDeps()
    if (mockEnabled)
      return
    setOrderCardModal({ isOpen: true, orderId: event.payload.orderId })
  })

  it('Handler публикует Event driver.order.selected с correlationId Action’а', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    const received = []
    channel.subscribe(event => { received.push(event) })

    channel.selectOrder('42')

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(EXPECTED_EVENT)
    expect(received[0].metadata.correlationId).toBe(CORRELATION_ID)
  })

  it('НЕ мок-режим: подписчик открывает карточку заказа', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    const setOrderCardModal = jest.fn()
    subscribeUi(channel, () => ({ mockEnabled: false, setOrderCardModal }))

    channel.selectOrder('42')

    expect(setOrderCardModal).toHaveBeenCalledTimes(1)
    expect(setOrderCardModal).toHaveBeenCalledWith({ isOpen: true, orderId: '42' })
  })

  it('мок-режим: Event публикуется, карточка НЕ открывается', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    const setOrderCardModal = jest.fn()
    const events = []
    channel.subscribe(event => { events.push(event) })
    subscribeUi(channel, () => ({ mockEnabled: true, setOrderCardModal }))

    channel.selectOrder('42')

    expect(events).toHaveLength(1)
    expect(setOrderCardModal).not.toHaveBeenCalled()
  })

  it('подписчик видит свежие deps: смена мок-режима без переподписки', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    const setOrderCardModal = jest.fn()
    let mockEnabled = true
    subscribeUi(channel, () => ({ mockEnabled, setOrderCardModal }))

    channel.selectOrder('42')
    expect(setOrderCardModal).not.toHaveBeenCalled()

    mockEnabled = false
    channel.selectOrder('42')
    expect(setOrderCardModal).toHaveBeenCalledWith({ isOpen: true, orderId: '42' })
  })

  it('карточка открывается синхронно внутри selectOrder — тайминг React не изменился', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    const setOrderCardModal = jest.fn()
    subscribeUi(channel, () => ({ mockEnabled: false, setOrderCardModal }))

    channel.selectOrder('42')

    // Без единого await: доставка Action’а и публикация Event’а происходят в том
    // же синхронном такте, что и клик, — батчинг React не поменялся.
    expect(setOrderCardModal).toHaveBeenCalledTimes(1)
  })

  it('Event уходит ДО UI-действия: рассинхрона нет по построению', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    const order = []
    channel.subscribe(() => { order.push('event') })
    subscribeUi(channel, () => ({
      mockEnabled: false,
      setOrderCardModal: () => { order.push('ui') },
    }))

    channel.selectOrder('42')

    expect(order).toEqual(['event', 'ui'])
  })

  it('падение UI-подписчика не мешает Event дойти до остальных', () => {
    const contract = new AppInteractionContract()
    const channel = createChannel(contract)
    registerMapApplicationHandler(contract)

    jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const survivor = jest.fn()
    channel.subscribe(() => { throw new Error('ui boom') })
    channel.subscribe(survivor)

    expect(() => channel.selectOrder('42')).not.toThrow()
    expect(survivor).toHaveBeenCalledTimes(1)
  })
})
