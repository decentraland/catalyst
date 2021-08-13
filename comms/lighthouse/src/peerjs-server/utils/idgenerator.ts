export function numericIdGenerator() {
  let currentId = 0

  return () => {
    currentId++
    return currentId.toString()
  }
}
