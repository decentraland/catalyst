import { IDatabaseComponent } from '../../src/adapters/database'

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

export function createTestDatabaseComponent(): IDatabaseComponent {
  return {
    async query() {
      throw new Error('query Not implemented')
    },
    async queryWithValues() {
      throw new Error('queryWithValues Not implemented')
    },
    async *streamQuery() {
      throw new Error('streamQuery Not implemented')
    },
    async transaction() {
      throw new Error('transactionQuery Not implemented')
    },
    async start() {},
    async stop() {}
  }
}
