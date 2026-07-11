type Wrap<T> = {[K in keyof T]-?: [T[K]]}
type Unwrap<T> = {[K in keyof T]: Extract<T[K], [any]>[0]}

export type Nullable<T extends object> = {
  [K in keyof T]: K | null
}

export type Stringify<T extends object> = {
  [K in keyof T]: string
}

export type ValueOf<
  T extends object
> = T[keyof T]

export type ArrayValue<T extends ReadonlyArray<unknown>> = T extends ReadonlyArray<
  infer ElementType
>
  ? ElementType
  : never

export type PromiseReturn<T> = T extends PromiseLike<infer U> ? U : T

export type ParametersExceptFirst<F> =
  F extends (arg0: any, ...rest: infer R) => any ? R : never
export type ParametersExceptLast<F extends (...args: any) => any> =
  Wrap<Parameters<F>> extends [...rest: infer R, arg0: any] ? Unwrap<R> : never

export type TAction = Readonly<{
  type: string,
  payload?: any
}>

export type TActionType = {[key: string]: string}

export type ISelectOption<T = any> = {
  label: string,
  value: T
}