import { Fetcher, ServerAddress } from 'dcl-catalyst-commons'

export class ContentServerClient {
  constructor(private readonly serverUrl: ServerAddress, fetcher: Fetcher) {}

  getContentUrl(): ServerAddress {
    return this.serverUrl + '/content'
  }

  getServerUrl(): ServerAddress {
    return this.serverUrl
  }
}

export enum ConnectionState {
  CONNECTED = 'Connected',
  CONNECTION_LOST = 'Connection lost',
  NEVER_REACHED = 'Could never be reached'
}
