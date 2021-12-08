import { ServerBaseUrl } from '@catalyst/commons'

export class ContentServerClient {
  constructor(private readonly serverBaseUrl: ServerBaseUrl) {}

  getContentUrl(): ServerBaseUrl {
    return this.serverBaseUrl
  }
}

export enum ConnectionState {
  CONNECTED = 'Connected',
  CONNECTION_LOST = 'Connection lost',
  NEVER_REACHED = 'Could never be reached'
}
