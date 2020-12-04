import { Fetcher, ServerAddress } from 'dcl-catalyst-commons'

export class MockedFetcher extends Fetcher {
  private readonly jsonResultByUrl: Map<string, any> = new Map()
  private readonly bufferResultByUrl: Map<string, Buffer> = new Map()

  addJsonEndpoint(address: ServerAddress, endpoint: string, result: any): MockedFetcher {
    const url = `${address}/${endpoint}`
    this.jsonResultByUrl.set(url, result)
    return this
  }

  addBufferEndpoint(address: ServerAddress, endpoint: string, result: Buffer): MockedFetcher {
    const url = `${address}/${endpoint}`
    this.bufferResultByUrl.set(url, result)
    return this
  }

  async fetchJson(url: string): Promise<any> {
    return Promise.resolve(this.jsonResultByUrl.get(url)!)
  }

  async fetchBuffer(url: string): Promise<Buffer> {
    return Promise.resolve(this.bufferResultByUrl.get(url)!)
  }
}
