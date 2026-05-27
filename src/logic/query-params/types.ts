import { QueryParams } from '../../types'

export interface IQueryParams {
  /** Parse a raw `URLSearchParams` into the qs-style nested object the rest of the helpers operate on. */
  qsParser(rawQueryParams: URLSearchParams): QueryParams
  /** Read a query-string param as a string array. Returns `[]` if missing. Accepts both repeated keys and a single value. */
  qsGetArray(queryParams: QueryParams, paramName: string): string[]
  /** Read a query-string param as a number, or `undefined` if missing or unparseable. */
  qsGetNumber(queryParams: QueryParams, paramName: string): number | undefined
  /** Read a query-string param as a boolean, or `undefined` if missing. Anything other than `'true'` is treated as `false`. */
  qsGetBoolean(queryParams: QueryParams, paramName: string): boolean | undefined
  /** Serialize the given filters back into a query string. Drops falsy values; arrays use the `repeat` format. */
  toQueryParams(filters: Record<string, any>): string
}
