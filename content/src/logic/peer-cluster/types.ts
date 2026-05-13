import { IBaseComponent } from '@well-known-components/interfaces'
import { DAOSource } from './dao-source'

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
  /**
   * Test seam: swap the DAO source after construction. Production code never calls this;
   * integration test helpers use it to install a `MockedDAOClient` after the server has
   * been built by `initComponentsWithEnv`.
   */
  setDAOSource(source: DAOSource): void
}
