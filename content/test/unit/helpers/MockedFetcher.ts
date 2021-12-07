import { Fetcher, ServerBaseUrl } from 'dcl-catalyst-commons'

export class MockedFetcher extends Fetcher {
  private readonly jsonResultByUrl: Map<string, any> = new Map()
  private readonly bufferResultByUrl: Map<string, Buffer> = new Map()

  addJsonEndpoint(address: ServerBaseUrl, endpoint: string, result: any): MockedFetcher {
    const url = `${address}/${endpoint.replace(/^\//, '')}`
    this.jsonResultByUrl.set(url, result)
    return this
  }

  addBufferEndpoint(address: ServerBaseUrl, endpoint: string, result: Buffer): MockedFetcher {
    const url = `${address}/${endpoint.replace(/^\//, '')}`
    this.bufferResultByUrl.set(url, result)
    return this
  }

  async fetchJson(url: string): Promise<any> {
    return this.jsonResultByUrl.get(url)!
  }

  async fetchBuffer(url: string): Promise<Buffer> {
    return this.bufferResultByUrl.get(url)!
  }
}
