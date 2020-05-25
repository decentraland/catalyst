import ms from 'ms'
import log4js from 'log4js'
import { delay } from "decentraland-katalyst-utils/util";

const LOGGER = log4js.getLogger('RetryHelper');

export async function retry<T>(execution: () => Promise<T>, attempts: number, description: string, waitTime: string = '1s'): Promise<T> {
    const initialAttempts = attempts
    while (attempts > 0) {
        try {
            return await execution()
        } catch (error) {
            attempts--;
            if (attempts > 0) {
                await delay(ms(waitTime))
                LOGGER.info(`Failed to ${description}. Still have ${attempts} attempt/s left. Will try again in ${waitTime}`)
            } else {
                LOGGER.warn(`Failed to ${description} after ${initialAttempts} attempts. Error was ${error}`)
                throw error
            }
        }
    }
    throw new Error('Should never reach here')
}