import { Entity } from '@dcl/schemas'
import { IDatabaseComponent } from 'src/ports/postgres'
import { ActiveEntities } from '../ports/activeEntities'

export async function findEntityByPointer(
  database: IDatabaseComponent,
  activeEntities: ActiveEntities,
  pointer: string
): Promise<Entity | undefined> {
  const entities: Entity[] = await activeEntities.withPointers(database, [pointer])
  return entities.length > 0 ? entities[0] : undefined
}

export function findHashForFile(entity: Entity, fileName: string) {
  return entity.content?.find((item) => item.file === fileName)?.hash
}

export function findImageHash(entity: Entity): string | undefined {
  if (!entity.metadata || !entity.metadata.image) {
    return
  }

  return findHashForFile(entity, entity.metadata.image)
}

export function findThumbnailHash(entity: Entity): string | undefined {
  if (!entity.metadata || !entity.metadata.thumbnail) {
    return
  }

  return findHashForFile(entity, entity.metadata.thumbnail)
}
