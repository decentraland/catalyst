export function delay(time: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export async function whileTrue(
  condition: () => boolean,
  messageIfFailed: string = 'no message specified',
  timeout: number = 1000
) {
  const started = Date.now()
  while (condition()) {
    if (Date.now() - started > timeout) {
      throw new Error('Timed out awaiting condition: ' + messageIfFailed)
    }
    await delay(5)
  }
}

export async function untilTrue(
  condition: () => boolean,
  messageIfFailed: string = 'no message specified',
  timeout: number = 1000
) {
  await whileTrue(() => !condition(), messageIfFailed, timeout)
}
