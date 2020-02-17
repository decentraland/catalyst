import ms from "ms";
import { clearTimeout, setTimeout } from "timers"
import fetch from "node-fetch";
import AbortController from 'abort-controller';

export class FetchHelper {

    private static readonly DEFAULT_REQUEST_TIMEOUT: number = ms('1m');

    static async fetchJson(url: string): Promise<any> {
        const response = await FetchHelper.fetchInternal(url)
        const json = await response.json()
        console.log(`Opened json from ${url}`)
        return json
    }

    static async fetchBuffer(url: string): Promise<Buffer> {
        const response = await FetchHelper.fetchInternal(url)
        const buffer = await response.buffer()
        console.log(`Opened buffer from ${url}`)
        return buffer
    }

    private static async fetchInternal(url: string) {
        const controller = new AbortController();
        const timeout = setTimeout(() => { controller.abort(); console.log("Aborted", url) }, FetchHelper.DEFAULT_REQUEST_TIMEOUT);
        try {
            console.log(`Going to fetch ${url}`)
            const response = await fetch(url, { signal: controller.signal });
            if (response.ok) {
                console.log(`Fetched ${url}`)
                return response
            } else {
                throw new Error(`Failed to fetch ${url}. Got status ${response.status}, ${response.statusText}`)
            }
        } catch (error) {
            console.log(`Failed to fetch ${url}`)
            throw error
        } finally {
            clearTimeout(timeout)
        }
    }

}