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
}

/**
 * Subtype that exposes test-only seams. The factory returns this; `AppComponents.contentCluster`
 * is typed as the narrower `IContentClusterComponent` so production code can't accidentally
 * call the seams. Test helpers cast back to `TestableContentClusterComponent` to reach them.
 */
export type TestableContentClusterComponent = IContentClusterComponent & {
  /**
   * Test seam: swap the DAO source after construction. Used by integration test helpers to
   * install a `MockedDAOClient` after the server has been built by `initComponentsWithEnv`.
   */
  setDAOSource(source: DAOSource): void
}
