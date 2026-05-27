import { IDatabaseComponent } from '../../src/adapters/database'

/**
 * Two database test doubles live in this file. Pick based on what the test wants.
 *
 * - `createDatabaseMockedComponent` returns a `jest.Mocked<IDatabaseComponent>` whose
 *   methods are `jest.fn()`s. Use it when the test needs to spy on or stub a specific
 *   call (e.g. `database.transaction.mockImplementation(...)`).
 *
 * - `createTestDatabaseComponent` returns an `IDatabaseComponent` whose methods throw
 *   `Error('... Not implemented')`. Use it when the test wires the database into a
 *   component but is not expected to touch it; an unintended call surfaces as a loud
 *   failure instead of a silent `jest.fn()` resolving with `undefined`.
 */

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
