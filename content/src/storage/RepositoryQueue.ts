import PQueue from 'p-queue'

/**
 * All database requests go through this queue. All pending requests will be queued as long as the limit isn't reached. If if it, then
 * low priority requests will be rejected before being queued.
 */
export class RepositoryQueue {
  public static readonly TOO_MANY_QUEUED_ERROR =
    'There are too many requests being made to the database right now. Please try again in a few minutes'
  private readonly maxQueued: number
  private readonly queue: PQueue

  constructor(options?: Partial<QueueOptions>) {
    const { maxConcurrency, maxQueued } = { maxConcurrency: 20, maxQueued: 50, ...options }
    this.queue = new PQueue({ concurrency: maxConcurrency })
    this.maxQueued = maxQueued
  }

  addDatabaseRequest<T>(priority: DB_REQUEST_PRIORITY, execution: () => Promise<T>): Promise<T> {
    if (this.queue.size >= this.maxQueued && priority === DB_REQUEST_PRIORITY.LOW) {
      return Promise.reject(new Error(RepositoryQueue.TOO_MANY_QUEUED_ERROR))
    }

    return this.queue.add(execution, { priority })
  }

  get beingExecuted() {
    return this.queue.pending
  }

  get pendingInQueue() {
    return this.queue.size
  }
}

export enum DB_REQUEST_PRIORITY {
  HIGH = 10,
  LOW = 0
}

type QueueOptions = { maxConcurrency: number; maxQueued: number }
