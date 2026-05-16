import { EntityType } from '@dcl/schemas'
import { Entity } from '@dcl/schemas'

export const createMockedEntity = (overrides: Partial<Entity> = {}): Entity => {
  return {
    version: 'v3',
    id: '1',
    type: EntityType.WEARABLE,
    pointers: [],
    timestamp: 1,
    content: [],
    metadata: {},
    ...overrides
  }
}
