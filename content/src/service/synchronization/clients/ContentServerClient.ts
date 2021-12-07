import { ServerBaseUrl } from 'dcl-catalyst-commons'

export class ContentServerClient {
  constructor(private readonly serverBaseUrl: ServerBaseUrl) {}

  getContentUrl(): ServerBaseUrl {
    return this.serverBaseUrl + '/content'
  }
}

export enum ConnectionState {
  CONNECTED = 'Connected',
  CONNECTION_LOST = 'Connection lost',
  NEVER_REACHED = 'Could never be reached'
}
