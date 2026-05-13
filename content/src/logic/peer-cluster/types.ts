import { IBaseComponent } from '@well-known-components/interfaces'

export type IContentClusterComponent = IBaseComponent & {
  getAllServersInCluster(): string[]
  onSyncFinished(cb: (serverClients: Set<string>) => void): void
  getStatus(): { lastSyncWithDAO: number }
  /**
   * Random UUID generated at startup that identifies this server's process to DAO peers.
   * Exposed via the `/challenge` endpoint; a peer that fetches `/challenge` from every
   * DAO server and finds a matching value has located its own process.
   */
  getChallengeText(): string
}
