import ms from "ms";
import log4js from "log4js"
import { clearTimeout, setTimeout } from "timers"
import fetch from "node-fetch";
import AbortController from 'abort-controller';

export class FetchHelper {

    private static readonly LOGGER = log4js.getLogger('FetchHelper');

    constructor(private readonly jsonRequestTimeout: number = ms('30s'),
        private readonly fileDownloadRequestTimeout: number = ms('1m')) { }

    async fetchJson(url: string): Promise<any> {
        return FetchHelper.fetchInternal(url, response => response.json(), this.jsonRequestTimeout)
    }

    async fetchBuffer(url: string): Promise<Buffer> {
        return FetchHelper.fetchInternal(url, response => response.buffer(), this.fileDownloadRequestTimeout)
    }

    private static async fetchInternal<T>(url: string, responseConsumer: (response) => Promise<T>, maxWaitingTime: number): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            FetchHelper.LOGGER.warn(`Request to url ${url} exceeded the max waiting time. It took more than ${maxWaitingTime} millis.`);
            controller.abort();
        }, maxWaitingTime);

        try {
            const response = await fetch(url, { signal: controller.signal });
            if (response.ok) {
                return await responseConsumer(response)
            } else {
                throw new Error(`Failed to fetch ${url}. Got status ${response.status}, ${response.statusText}`)
            }
        } catch (error) {
            throw error
        } finally {
            clearTimeout(timeout)
        }
    }

}