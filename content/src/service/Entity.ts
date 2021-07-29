import { ContentFileHash, EntityId, EntityType, EntityVersion, Pointer, Timestamp } from 'dcl-catalyst-commons'

export type Entity = {
  version: EntityVersion
  id: EntityId
  type: EntityType
  pointers: Pointer[]
  timestamp: Timestamp
  content?: Map<string, ContentFileHash>
  metadata?: any
}
