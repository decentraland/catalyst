export function asArray<T>(elements: T[] | T): T[] {
  if (!elements) {
    return []
  }
  if (elements instanceof Array) {
    return elements
  }
  return [elements]
}
export function asInt(value: any): number | undefined {
  if (value) {
    const parsed = parseInt(value)
    if (!isNaN(parsed)) {
      return parsed
    }
  }
}
