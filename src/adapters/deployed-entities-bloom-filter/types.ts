import { TimeRange } from '@dcl/snapshots-fetcher/dist/types'

export type DeployedEntitiesBloomFilter = {
  add(entityId: string): void
  isProbablyDeployed(entityId: string, entityTimestamp: number): Promise<boolean>
  addAllInTimeRange(timeRange: TimeRange): Promise<void>
}
