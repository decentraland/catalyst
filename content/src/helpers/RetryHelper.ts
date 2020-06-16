import log4js from 'log4js'
import { retry as externalRetry } from "dcl-catalyst-commons"

const LOGGER = log4js.getLogger('RetryHelper');

export async function retry<T>(execution: () => Promise<T>, attempts: number, description: string, waitTime: string = '1s'): Promise<T> {
    return externalRetry(execution,
        attempts,
        waitTime,
        (attemptsLeft) => LOGGER.info(`Failed to ${description}. Still have ${attemptsLeft} attempt/s left. Will try again in ${waitTime}`),
        () => LOGGER.warn(`Failed to ${description} after ${attempts} attempts`))
}