import { IPgComponent } from '@dcl/pg-component'

export type IDatabaseComponent = IPgComponent

/**
 * @deprecated Use IPgComponent directly from @dcl/pg-component
 */
export type DatabaseClient = IPgComponent

/**
 * @deprecated Transactions now use withAsyncContextTransaction which routes
 * query() calls through the transaction client automatically. Functions that
 * previously required a DatabaseTransactionalClient parameter should now
 * accept IPgComponent (or DatabaseClient) instead.
 */
export type DatabaseTransactionalClient = IPgComponent

export function createTestDatabaseComponent(): IDatabaseComponent {
  return {
    async start() {},
    async stop() {},
    async query() {
      throw new Error('query Not implemented')
    },
    async *streamQuery() {
      throw new Error('streamQuery Not implemented')
    },
    async withTransaction() {
      throw new Error('withTransaction Not implemented')
    },
    async withAsyncContextTransaction() {
      throw new Error('withAsyncContextTransaction Not implemented')
    },
    getPool() {
      throw new Error('getPool Not implemented')
    }
  } as IDatabaseComponent
}
