export function assertPromiseIsRejected(promiseExecution: () => Promise<any>): Promise<void> {
  return assertPromiseRejectionGeneric(promiseExecution, () => {})
}

export function assertPromiseRejectionMatches(
  promiseExecution: () => Promise<any>,
  errorMessage: string | RegExp
): Promise<void> {
  return assertPromiseRejectionGeneric(promiseExecution, (returnedMessage) =>
    expect(returnedMessage).toMatch(errorMessage)
  )
}

export async function assertPromiseRejectionGeneric(
  promiseExecution: () => Promise<any>,
  evaluation: (error: string) => void
): Promise<void> {
  try {
    await promiseExecution()
  } catch (error) {
    evaluation(error.message)
    return
  }
  throw new Error('Expected an error, but nothing failed')
}
