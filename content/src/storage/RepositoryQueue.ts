import PQueue from 'p-queue'
export class RepositoryQueue {
  private static readonly MAX_QUEUED_REQUESTS = 50
  private static readonly MAX_CONCURRENT_REQUESTS = 20
  private readonly queue = new PQueue({ concurrency: RepositoryQueue.MAX_CONCURRENT_REQUESTS })

  addDatabaseRequest<T>(priority: DB_REQUEST_PRIORITY, execution: () => Promise<T>): Promise<T> {
    if (this.queue.size >= RepositoryQueue.MAX_QUEUED_REQUESTS && priority === DB_REQUEST_PRIORITY.LOW) {
      return Promise.reject(
        new Error('There are too many requests being made to the database right now. Please try again in a few minutes')
      )
    }

    return this.queue.add(execution, { priority })
  }
}

export enum DB_REQUEST_PRIORITY {
  HIGH = 10,
  LOW = 0
}
