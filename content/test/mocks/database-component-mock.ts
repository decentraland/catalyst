import { IDatabaseComponent } from '../../src/ports/postgres'

export const createDatabaseMockedComponent = (
  overrides?: Partial<jest.Mocked<IDatabaseComponent>>
): jest.Mocked<IDatabaseComponent> => {
  return {
    query: jest.fn(),
    queryWithValues: jest.fn(),
    streamQuery: jest.fn(),
    transaction: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    ...overrides
  }
}
