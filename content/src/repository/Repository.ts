import { delay } from '@catalyst/commons'
import { Database, FullDatabase } from './Database'
import { DB_REQUEST_PRIORITY, RepositoryQueue } from './RepositoryQueue'

export class Repository {
  constructor(private readonly db: FullDatabase, private readonly queue: RepositoryQueue) {}

  /**
   * Run some query against the database
   */
  run<T>(execution: (db: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    return this.runInternal(execution, options)
  }

  /**
   * Takes a db and uses it if it's present. If it isn't, then a new database request is created, using the queue
   */
  reuseIfPresent<T>(
    db: Database | undefined,
    execution: (db: Database | Database) => Promise<T>,
    options: ExecutionOptions
  ): Promise<T> {
    if (db) {
      return execution(db)
    } else {
      return this.run(execution, options)
    }
  }

  /**
   * Shutdown the database client
   */
  async shutdown(): Promise<void> {
    const promise = this.db.$pool.end()
    let finished = false

    promise.then(() => (finished = true)).catch(() => (finished = true))

    while (!finished && this.db.$pool.totalCount | this.db.$pool.idleCount | this.db.$pool.waitingCount) {
      if (this.db.$pool.totalCount) {
        console.log('Draining connections', {
          totalCount: this.db.$pool.totalCount,
          idleCount: this.db.$pool.idleCount,
          waitingCount: this.db.$pool.waitingCount
        })
      }

      await delay(100)
    }

    await promise
  }

  /**
   * Convenience method to start a task directly
   */
  task<T>(execution: (task: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    return this.run((db) => db.task(execution), options)
  }

  /**
   * Convenience method to start a task directly
   */
  taskIf<T>(execution: (task: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    return this.run((db) => db.taskIf(execution), options)
  }

  /**
   * Convenience method to start a tx directly
   */
  tx<T>(execution: (tx: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    return this.run((db) => db.tx(execution), options)
  }

  /**
   * Convenience method to start a tx directly
   */
  txIf<T>(execution: (tx: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    return this.run((db) => db.txIf(execution), options)
  }

  private runInternal<T>(execution: (db: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    return this.queue.addDatabaseRequest(options.priority, () => execution(this.db))
  }
}

type ExecutionOptions = {
  priority: DB_REQUEST_PRIORITY
}
