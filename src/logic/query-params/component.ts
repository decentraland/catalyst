import qs from 'qs'
import { QueryParams } from '../../types'
import { IQueryParams } from './types'

export function createQueryParams(): IQueryParams {
  return {
    qsParser(rawQueryParams: URLSearchParams): QueryParams {
      // Bound the parser's work as defense-in-depth against query-string abuse. `parameterLimit` is
      // intentionally set above the per-endpoint array caps (1000) so a handler can see an oversized
      // request and reject it with a clean 400, rather than qs silently dropping the excess.
      // `arrayLimit`/`depth` are tightened because no endpoint relies on bracket-indexed or deeply
      // nested query params — arrays here use repeated keys (e.g. `?cid=a&cid=b`), which are governed
      // by `parameterLimit`, not `arrayLimit`.
      return qs.parse(rawQueryParams.toString(), {
        parseArrays: true,
        parameterLimit: 2000,
        arrayLimit: 100,
        depth: 5
      })
    },
    qsGetArray(queryParams: QueryParams, paramName: string): string[] {
      const parsedParam = (queryParams[paramName] as string[]) || []
      return Array.isArray(parsedParam) ? parsedParam : [parsedParam]
    },
    qsGetNumber(queryParams: QueryParams, paramName: string): number | undefined {
      if (!queryParams[paramName]) return undefined
      const num = parseInt(queryParams[paramName] as string, 10)
      return isNaN(num) ? undefined : num
    },
    qsGetBoolean(queryParams: QueryParams, paramName: string): boolean | undefined {
      return queryParams[paramName] ? queryParams[paramName] === 'true' : undefined
    },
    toQueryParams(filters: Record<string, any>): string {
      const entries = convertFiltersToQueryParams(filters)
      return qs.stringify(Object.fromEntries(entries), { arrayFormat: 'repeat' })
    }
  }
}

function convertFiltersToQueryParams(filters?: Record<string, any>): Map<string, string[]> {
  if (!filters) {
    return new Map()
  }
  const entries = Object.entries(filters)
    .filter(([_, value]) => !!value)
    .map<[string, string[]]>(([name, value]) => {
      let newName = name
      let newValues: string[]
      if (Array.isArray(value)) {
        newName = name.endsWith('s') ? name.slice(0, -1) : newName
        newValues = [...value].filter(isValidQueryParamValue).map((_) => `${_}`)
      } else if (isValidQueryParamValue(value)) {
        newValues = [`${value}`]
      } else {
        throw new Error(
          'Query params must be either a string, a number, a boolean or an array of the types just mentioned'
        )
      }
      return [newName, newValues]
    })
    .filter(([_, values]) => values.length > 0)
  return new Map(entries)
}

function isValidQueryParamValue(value: any): boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}
