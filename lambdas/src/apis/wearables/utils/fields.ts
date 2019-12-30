import { utils } from 'decentraland-commons'

/**
 * Return a copy of the obj, filtered to only have values for the whitelisted array of valid keys
 */
export function pick<T>(obj: T, whitelist: string[]) {
  return mapPick([obj], whitelist)[0]
}

/**
 * Return a copy of the array, filtering each object to only have values for the whitelisted array of valid keys
 */
export function mapPick<T>(array: T[], whitelist: string[]) {
  const fields = whitelist.filter(field => field.trim() !== '')

  if (fields.length === 0) {
    return array
  }

  return array.map(obj => utils.pick<T>(obj, fields))
}
