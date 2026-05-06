import { IBaseComponent } from '@well-known-components/interfaces'

export type IContentClusterComponent = IBaseComponent & {
  getAllServersInCluster(): string[]
  onSyncFinished(cb: (serverClients: Set<string>) => void): void
  getStatus(): { lastSyncWithDAO: number }
}
