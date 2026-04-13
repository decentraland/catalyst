import { IDatabaseComponent } from '../../src/ports/postgres'

export const createDatabaseMockedComponent = (
  overrides?: Partial<jest.Mocked<IDatabaseComponent>>
): jest.Mocked<IDatabaseComponent> => {
  return {
    query: jest.fn(),
    streamQuery: jest.fn(),
    withTransaction: jest.fn(),
    withAsyncContextTransaction: jest.fn().mockImplementation(async (fn) => fn()),
    getPool: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides
  } as jest.Mocked<IDatabaseComponent>
}
