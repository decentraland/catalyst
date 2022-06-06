import qs from 'qs'

export function toQueryParams(filters: Record<string, any>): string {
  const entries = convertFiltersToQueryParams(filters)
  return qs.stringify(Object.fromEntries(entries), { arrayFormat: 'repeat' })
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
      // Force coercion of number, boolean, or string into string
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
