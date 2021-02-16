export function asArray<T>(elements: T[] | T): T[] {
  if (!elements) {
    return []
  }
  if (elements instanceof Array) {
    return elements
  }
  return [elements]
}
