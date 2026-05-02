import { IBaseComponent, IDatabase } from '@well-known-components/interfaces'
import { SQLStatement } from 'sql-template-strings'

export type DatabaseClient = Omit<IDatabaseComponent, 'transaction'>

export type DatabaseTransactionalClient = DatabaseClient & {
  insideTx: true
}

export interface IDatabaseComponent extends IDatabase, IBaseComponent {
  queryWithValues<T extends Record<string, any>>(
    sql: SQLStatement,
    durationQueryNameLabel?: string
  ): Promise<IDatabase.IQueryResult<T>>
  streamQuery<T = any>(
    sql: SQLStatement,
    config?: { batchSize?: number },
    durationQueryNameLabel?: string
  ): AsyncGenerator<T>
  transaction(
    functionToRunWithinTransaction: (client: DatabaseTransactionalClient) => Promise<void>,
    durationQueryNameLabel?: string
  ): Promise<void>
  start?(): Promise<void>
}
