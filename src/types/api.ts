export interface IResponse<
  TCode extends string,
  TData extends unknown
> {
  code: TCode
  status: 'success' | 'error'
  message: string
  data: TData
}