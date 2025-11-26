import { ActiveEntities } from '../../src/ports/activeEntities'

export function createMockedActiveEntitiesComponent(
  overrides: Partial<jest.Mocked<ActiveEntities>> = {}
): jest.Mocked<ActiveEntities> {
  return {
    withPointers: jest.fn(),
    withPrefix: jest.fn(),
    withIds: jest.fn(),
    update: jest.fn(),
    clear: jest.fn(),
    clearPointers: jest.fn(),
    getCachedEntity: jest.fn(),
    reset: jest.fn(),
    ...overrides
  }
}
