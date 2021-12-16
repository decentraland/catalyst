import { EntityType } from 'dcl-catalyst-commons'

type EntitiesStatus = Partial<Record<EntityType, number>>

interface Status {
  snapshot: {
    lastTimestamp: number
    entities: EntitiesStatus
  }
}

export interface IStatusComponent {
  setSnapshotActiveEntities(map: EntitiesStatus): void
  getSnapshotActiveEntities(): EntitiesStatus

  updateTimestamp(timestamp: number): void
  getLatestUpdateTime(): number
}

export function createStatusComponent(): IStatusComponent {
  const status: Status = {
    snapshot: {
      entities: {},
      lastTimestamp: Date.now()
    }
  }

  const setSnapshotActiveEntities = (map: EntitiesStatus) => {
    status.snapshot.entities = map
  }

  const getSnapshotActiveEntities = (): EntitiesStatus => {
    return status.snapshot.entities
  }

  const updateTimestamp = (timestamp: number) => {
    status.snapshot.lastTimestamp = timestamp
  }
  const getLatestUpdateTime = () => {
    return status.snapshot.lastTimestamp
  }

  return {
    setSnapshotActiveEntities,
    getSnapshotActiveEntities,
    updateTimestamp,
    getLatestUpdateTime
  }
}
