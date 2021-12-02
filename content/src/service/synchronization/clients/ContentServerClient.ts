import { ServerAddress } from 'dcl-catalyst-commons'

export class ContentServerClient {
  constructor(private readonly serverUrl: ServerAddress) {}

  getServerUrl(): ServerAddress {
    return this.serverUrl
  }
}

export enum ConnectionState {
  CONNECTED = 'Connected',
  CONNECTION_LOST = 'Connection lost',
  NEVER_REACHED = 'Could never be reached'
}
