/**
 * AppInteractionContract — шина Stage 1.
 *
 * Фиксируем три правила dispatch (порядок / изоляция ошибки / продолжение),
 * регистрацию и отписку в обе стороны, семантику двойной регистрации и то, что
 * snapshot не бросает.
 */

import { AppInteractionContract } from '../AppInteractionContract'

const ACTION = {
  type: 'driver.order.select',
  payload: { orderId: '42' },
  metadata: { source: 'map', timestamp: '2026-07-27T10:00:00.000Z', correlationId: 'c-1' },
}

const EVENT = {
  type: 'driver.order.selected',
  payload: { orderId: '42' },
  metadata: { source: 'map', timestamp: '2026-07-27T10:00:00.000Z', correlationId: 'c-1' },
}

const createLogger = () => ({ log: jest.fn(), error: jest.fn() })

describe('AppInteractionContract: регистрация и доставка Action', () => {
  it('зарегистрированный обработчик получает Action целиком', async () => {
    const contract = new AppInteractionContract(createLogger())
    const handler = jest.fn()

    contract.registerHandler(handler)
    await contract.dispatch(ACTION)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(ACTION)
  })

  it('после отписки обработчик НЕ вызывается', async () => {
    const contract = new AppInteractionContract(createLogger())
    const handler = jest.fn()

    const unregister = contract.registerHandler(handler)
    unregister()
    await contract.dispatch(ACTION)

    expect(handler).not.toHaveBeenCalled()
  })

  it('обработчик вправе отписаться прямо во время обхода', async () => {
    const contract = new AppInteractionContract(createLogger())
    const second = jest.fn()

    const unregister = contract.registerHandler(() => { unregister() })
    contract.registerHandler(second)

    await expect(contract.dispatch(ACTION)).resolves.toBeUndefined()
    expect(second).toHaveBeenCalledTimes(1)
  })
})

describe('AppInteractionContract: порядок обработчиков', () => {
  it('порядок доставки = порядок регистрации', async () => {
    const contract = new AppInteractionContract(createLogger())
    const calls = []

    contract.registerHandler(() => { calls.push('first') })
    contract.registerHandler(() => { calls.push('second') })
    contract.registerHandler(() => { calls.push('third') })

    await contract.dispatch(ACTION)

    expect(calls).toEqual(['first', 'second', 'third'])
  })

  it('асинхронный обработчик дожидается своей очереди (последовательно, не параллельно)', async () => {
    const contract = new AppInteractionContract(createLogger())
    const calls = []

    contract.registerHandler(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
      calls.push('slow-async')
    })
    contract.registerHandler(() => { calls.push('fast-sync') })

    await contract.dispatch(ACTION)

    // При параллельном обходе быстрый обработчик отработал бы первым.
    expect(calls).toEqual(['slow-async', 'fast-sync'])
  })
})

describe('AppInteractionContract: изоляция ошибки обработчика', () => {
  it('исключение ловится, следующие обработчики выполняются, dispatch резолвится', async () => {
    const logger = createLogger()
    const contract = new AppInteractionContract(logger)
    const calls = []

    contract.registerHandler(() => {
      calls.push(1)
      throw new Error('sync boom')
    })
    contract.registerHandler(async () => {
      calls.push(2)
      throw new Error('async boom')
    })
    contract.registerHandler(() => { calls.push(3) })

    await expect(contract.dispatch(ACTION)).resolves.toBeUndefined()

    expect(calls).toEqual([1, 2, 3])
    expect(logger.error).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith('action handler failed', expect.any(Error))
  })

  it('упавший обработчик не мешает следующему dispatch', async () => {
    const contract = new AppInteractionContract(createLogger())
    const survivor = jest.fn()

    contract.registerHandler(() => { throw new Error('boom') })
    contract.registerHandler(survivor)

    await contract.dispatch(ACTION)
    await contract.dispatch(ACTION)

    expect(survivor).toHaveBeenCalledTimes(2)
  })
})

describe('AppInteractionContract: двойная регистрация одного обработчика', () => {
  it('регистрация НЕ идемпотентна: два вхождения → две доставки', async () => {
    const contract = new AppInteractionContract(createLogger())
    const handler = jest.fn()

    contract.registerHandler(handler)
    contract.registerHandler(handler)
    await contract.dispatch(ACTION)

    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('каждая отписка снимает ровно одно вхождение и идемпотентна к повтору', async () => {
    const contract = new AppInteractionContract(createLogger())
    const handler = jest.fn()

    const unregisterFirst = contract.registerHandler(handler)
    const unregisterSecond = contract.registerHandler(handler)

    unregisterFirst()
    await contract.dispatch(ACTION)
    // Осталось одно вхождение — обе копии одной отпиской не сносятся.
    expect(handler).toHaveBeenCalledTimes(1)

    // Повторный вызов той же отписки — no-op, второе вхождение живо.
    unregisterFirst()
    await contract.dispatch(ACTION)
    expect(handler).toHaveBeenCalledTimes(2)

    unregisterSecond()
    await contract.dispatch(ACTION)
    expect(handler).toHaveBeenCalledTimes(2)
  })
})

describe('AppInteractionContract: publish и подписчики Event', () => {
  it('publish доставляет Event подписчику', () => {
    const contract = new AppInteractionContract(createLogger())
    const listener = jest.fn()

    contract.subscribe(listener)
    contract.publish(EVENT)

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(EVENT)
  })

  it('после unsubscribe listener НЕ вызывается', () => {
    const contract = new AppInteractionContract(createLogger())
    const listener = jest.fn()

    const unsubscribe = contract.subscribe(listener)
    unsubscribe()
    contract.publish(EVENT)

    expect(listener).not.toHaveBeenCalled()
  })

  it('порядок подписчиков = порядок подписки', () => {
    const contract = new AppInteractionContract(createLogger())
    const calls = []

    contract.subscribe(() => { calls.push('first') })
    contract.subscribe(() => { calls.push('second') })
    contract.publish(EVENT)

    expect(calls).toEqual(['first', 'second'])
  })

  it('ошибка подписчика изолирована: следующие получают Event', () => {
    const logger = createLogger()
    const contract = new AppInteractionContract(logger)
    const survivor = jest.fn()

    contract.subscribe(() => { throw new Error('listener boom') })
    contract.subscribe(survivor)

    expect(() => contract.publish(EVENT)).not.toThrow()
    expect(survivor).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledWith('event listener failed', expect.any(Error))
  })
})

describe('AppInteractionContract: snapshot', () => {
  it('Stage 1: пустое доменное состояние, исключений не бросает', async () => {
    const contract = new AppInteractionContract(createLogger())

    await expect(contract.snapshot()).resolves.toEqual({ revision: 0, state: {} })
  })

  it('revision растёт после dispatch и publish', async () => {
    const contract = new AppInteractionContract(createLogger())

    const before = await contract.snapshot()
    await contract.dispatch(ACTION)
    contract.publish(EVENT)
    const after = await contract.snapshot()

    expect(after.revision).toBeGreaterThan(before.revision)
    expect(after.state).toEqual({})
  })
})
