

import { FetchHelper } from "@katalyst/content/helpers/FetchHelper";
import { ServerAddress } from "@katalyst/content/service/synchronization/clients/contentserver/ContentServerClient";

export class MockedFetchHelper extends FetchHelper {

    private readonly jsonResultByUrl: Map<string, any> = new Map()
    private readonly bufferResultByUrl: Map<string, Buffer> = new Map()

    addJsonEndpoint(address: ServerAddress, endpoint: string, result: any): MockedFetchHelper {
        const url = `${address}/${endpoint}`
        this.jsonResultByUrl.set(url, result)
        return this
    }

    addBufferEndpoint(address: ServerAddress, endpoint: string, result: Buffer): MockedFetchHelper {
        const url = `${address}/${endpoint}`
        this.bufferResultByUrl.set(url, result)
        return this
    }

    async fetchJson(url: string): Promise<any> {
        return Promise.resolve(this.jsonResultByUrl.get(url)!!)
    }

    async fetchBuffer(url: string): Promise<Buffer> {
        return Promise.resolve(this.bufferResultByUrl.get(url)!!)
    }
}