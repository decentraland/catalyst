import { runReportingQueryDurationMetric } from '../instrument'
import { AppComponents } from '../types'
import { Database, FullDatabase } from './Database'
import { DB_REQUEST_PRIORITY, RepositoryQueue } from './RepositoryQueue'

export class Repository {
  constructor(
    private readonly db: FullDatabase,
    private readonly queue: RepositoryQueue,
    private readonly components: Pick<AppComponents, 'metrics'>
  ) {}

  /**
   * Run some query against the database
   */
  run<T>(execution: (db: Database) => Promise<T>, options: ExecutionOptions): Promise<T> {
    if (!options.durationQueryNameLabel) {
      return this.runInternal(execution, options)
    }
    return runReportingQueryDurationMetric(this.components, options.durationQueryNameLabel, () =>
      this.runInternal(execution, options)
    )
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
  async stop(): Promise<void> {
    const DRAIN_TIMEOUT = 30_000 // 30 seconds
    await Promise.race([
      // close pool
      this.db.$pool.end(),
      // or timeout
      new Promise((_, reject) => setTimeout(reject, DRAIN_TIMEOUT))
    ])
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
  durationQueryNameLabel?: string
}
