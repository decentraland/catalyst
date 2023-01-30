// import { IFetchComponent, RequestInfo, RequestOptions, Response } from 'dcl-catalyst-client'

// export class MockedFetcher extends IFetchComponent {
//   private readonly jsonResultByUrl: Map<string, any> = new Map()
//   private readonly bufferResultByUrl: Map<string, Buffer> = new Map()

//   addJsonEndpoint(address: string, endpoint: string, result: any): MockedFetcher {
//     const url = `${address}/${endpoint.replace(/^\//, '')}`
//     this.jsonResultByUrl.set(url, result)
//     return this
//   }

//   addBufferEndpoint(address: string, endpoint: string, result: Buffer): MockedFetcher {
//     const url = `${address}/${endpoint.replace(/^\//, '')}`
//     this.bufferResultByUrl.set(url, result)
//     return this
//   }

//   async fetch(url: RequestInfo, init?: RequestOptions): Promise<any> {
//     async function json() {
//       return this.jsonResultByUrl.get(url)!
//     }

//     async function buffer() {
//       return this.bufferResultByUrl.get(url)!
//     }

//     return {
//       json,
//       buffer
//     }
//   }

//   async fetchJson(url: string): Promise<any> {
//     return this.jsonResultByUrl.get(url)!
//   }

//   async fetchBuffer(url: string): Promise<Buffer> {
//     return this.bufferResultByUrl.get(url)!
//   }
// }
