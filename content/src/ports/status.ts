import { EntityType } from 'dcl-catalyst-commons'

export interface IStatusComponent {
  setSnapshotActiveEntities(map: Record<EntityType, number>): void
  getSnapshotActiveEntity(entityType: EntityType): number

  updateTimestamp(timestamp: number): void
  getLatestUpdateTime(): number
}

export function createStatusComponent(): IStatusComponent {
  const status = {
    snapshot: {
      [EntityType.PROFILE]: 0,
      [EntityType.SCENE]: 0,
      [EntityType.WEARABLE]: 0,
      lastTimestamp: Date.now()
    }
  }

  const setSnapshotActiveEntities = (map: Record<EntityType, number>) => {
    status.snapshot[EntityType.PROFILE] = map.profile
    status.snapshot[EntityType.SCENE] = map.scene
    status.snapshot[EntityType.WEARABLE] = map.wearable
  }

  const getSnapshotActiveEntity = (entityType: EntityType) => {
    return status[entityType]
  }

  const updateTimestamp = (timestamp: number) => {
    status.snapshot.lastTimestamp = timestamp
  }
  const getLatestUpdateTime = () => {
    return status.snapshot.lastTimestamp
  }

  return {
    setSnapshotActiveEntities,
    getSnapshotActiveEntity,
    updateTimestamp,
    getLatestUpdateTime
  }
}
