import { setTimeout } from 'timers/promises'
import ms from 'ms'

export async function retry<T>(
  execution: () => Promise<T>,
  attempts: number,
  description: string,
  waitTime: string = '1s'
): Promise<T> {
  const timeInMs = ms(waitTime)
  while (attempts > 0) {
    try {
      return await execution()
      //     ^^^^^ never remove this "await" keyword, otherwise this function won't
      //           catch the exception and perform the retries
    } catch (error) {
      attempts--
      if (attempts > 0) {
        console.info(`Failed to ${description}. Still have ${attempts} attempt/s left. Will try again in ${waitTime}`)
        await setTimeout(timeInMs, null)
      } else {
        throw error
      }
    }
  }
  throw new Error('Please specify more than one attempt for the retry function')
}
