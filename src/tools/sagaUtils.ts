import { Action, Task, SagaIterator, channel } from 'redux-saga'
import {
  Tail, SagaReturnType, ActionPattern, ThunkAction,
  SelectEffect, CallEffect, PutEffect,
  select as sagaSelect, call as sagaCall, putResolve as sagaPutResolve,
  all, race, take, takeEvery, fork, put, cancel,
} from 'redux-saga/effects'
import { firstItem } from './utils'

export function* select<Fn extends(...args: any[]) => any>(
  fn: Fn,
  ...args: Tail<Parameters<Fn>>
): Generator<SelectEffect, ReturnType<Fn>> {
  return yield sagaSelect(fn, ...args)
}

export function* call<Fn extends(...args: any[]) => any>(
  fn: Fn,
  ...args: Parameters<Fn>
): Generator<CallEffect<SagaReturnType<Fn>>, SagaReturnType<Fn>> {
  return yield sagaCall(fn, ...args)
}

export function* putResolve<
  ReturnType = any,
  State = any,
  ExtraThunkArg = any,
  BasicAction extends Action = Action
>(
  action: ThunkAction<ReturnType, State, ExtraThunkArg, BasicAction>,
): Generator<
  PutEffect<BasicAction>,
  SagaReturnType<ThunkAction<ReturnType, State, ExtraThunkArg, BasicAction>>
> {
  return yield sagaPutResolve(action)
}

interface IConcurrentSaga<TAction> {
  action: ActionPattern
  saga: (action: TAction) => Generator
  /** Параллельно могут выполняться только задачи с одинаковыми `parallelKey` */
  parallelKey?: unknown | ((action: TAction) => unknown)
  /** Параллельно могут выполняться только задачи с разными `sequenceKey` */
  sequenceKey?: unknown | ((action: TAction) => unknown)
  /**
   * Добавляет поведение на манер `takeLatest`,
   * опционально только для задач с совпадающими результатами функции
   */
  latest?: boolean | ((action: TAction) => unknown | undefined)
  /**
   * Добавляет поведение на манер `takeLeading`,
   * опционально только для задач с совпадающими результатами функции
   */
  leading?: boolean | ((action: TAction) => unknown | undefined)
}

export function* concurrency<TAction>(...sagas: IConcurrentSaga<TAction>[]) {
  const running = new Map<Task, QueueItem>()
  const queue: QueueItem[] = []
  const takeEffects = sagas.map(({ action }) => take(action))
  const tasksExecutionChannel = yield* call(channel)

  interface QueueItem {
    sagaIndex: number
    action: TAction
    parallelKey: unknown
    sequenceKey: unknown
    uniqueKey?: unknown
  }

  while (true) {
    const [actions = []]: [TAction[]] = yield race([
      race(takeEffects),
      take(tasksExecutionChannel),
    ])

    for (const [sagaIndex, action] of actions.entries())
      if (action) {
        const {
          parallelKey: parallel, sequenceKey: sequence,
          latest, leading,
        } = sagas[sagaIndex]
        const parallelKey =
          typeof parallel === 'function' ? parallel(action) : parallel
        const sequenceKey =
          typeof sequence === 'function' ? sequence(action) : sequence
        const latestKey =
          typeof latest === 'function' ? latest(action) : latest || undefined
        const leadingKey =
          typeof leading === 'function' ? leading(action) : leading || undefined
        const queueItem = { sagaIndex, action, parallelKey, sequenceKey }

        if (latestKey !== undefined && leadingKey !== undefined)
          throw new Error(
            `Simultaneous use of latest key (${latestKey}) ` +
            `and leading key (${leadingKey})`,
          )

        if (latestKey !== undefined || leadingKey !== undefined) {
          const uniqueKey = latestKey !== undefined ? latestKey : leadingKey
          const searchFn = (item: QueueItem) =>
            item.sagaIndex === sagaIndex && item.uniqueKey === uniqueKey
          const runningTask = [...running]
            .find(([, item]) => searchFn(item))?.[0]
          const queueIndex = queue.findIndex(searchFn)

          if (latestKey !== undefined) {
            if (queueIndex !== -1)
              queue.splice(queueIndex, 1)
            if (runningTask)
              yield cancel(runningTask)
            queue.push({ ...queueItem, uniqueKey })
          }

          if (leadingKey !== undefined && (!runningTask && queueIndex === -1))
            queue.push({ ...queueItem, uniqueKey })
        }

        else
          queue.push(queueItem)
      }

    let closestQueueItem = firstItem(running.values()) ?? queue[0]
    const runningSequences =
      new Set([...running.values()].map(item => item.sequenceKey))
    let processedQueueItems = 0
    for (const item of queue) {
      const { sagaIndex, action, parallelKey, sequenceKey } = item

      if (
        (closestQueueItem && parallelKey !== closestQueueItem.parallelKey) ||
        runningSequences.has(sequenceKey)
      ) break
      processedQueueItems++

      const { saga } = sagas[sagaIndex]
      let finished = false
      let task: Task
      task = yield fork(function*() {
        try {
          yield* saga(action)
        } finally {
          running.delete(task)
          finished = true
          yield put(tasksExecutionChannel, {})
        }
      })
      if (!finished) {
        running.set(task, item)
        closestQueueItem = item
        runningSequences.add(sequenceKey)
      }
    }

    queue.splice(0, processedQueueItems)
  }
}

export interface WatchState<TKey = unknown> {
  listeners: number
  key: TKey
}

export function whileWatching(
  watchAction: ActionPattern,
  unwatchAction: ActionPattern,
  loop: (state: WatchState<undefined>) => SagaIterator<void> | Promise<void>,
): SagaIterator<void>
export function whileWatching<TAction, TKey>( // eslint-disable-line no-redeclare
  watchAction: ActionPattern,
  unwatchAction: ActionPattern,
  loop: (state: WatchState<TKey>) => SagaIterator<void> | Promise<void>,
  key: (action: TAction) => TKey,
): SagaIterator<void>
export function* whileWatching<TAction, TKey>( // eslint-disable-line no-redeclare
  watchAction: ActionPattern,
  unwatchAction: ActionPattern,
  loop: (state: WatchState<TKey>) => SagaIterator<void> | Promise<void>,
  // @ts-ignore TS2322
  key: (action: TAction) => TKey = () => undefined,
) {
  const state = new Map<TKey, WatchState<TKey>>()
  yield all([
    takeEvery(watchAction, function*(action) {
      const actionKey = key(action as TAction)
      if (state.has(actionKey))
        state.get(actionKey)!.listeners++
      else {
        const stateSlice = { listeners: 1, key: actionKey }
        state.set(actionKey, stateSlice)
        yield fork(function*() {
          while (stateSlice.listeners > 0)
            yield* call(loop, stateSlice)
          state.delete(actionKey)
        })
      }
    }),
    takeEvery(unwatchAction, action => {
      state.get(key(action as TAction))!.listeners--
    }),
  ])
}