import PQueue from 'p-queue'
import { metricsComponent } from '../metrics'

/**
 * All database requests go through this queue. All pending requests will be queued as long as the limit isn't reached. If if it, then
 * low priority requests will be rejected before being queued.
 */
export class RepositoryQueue {
  public static readonly TOO_MANY_QUEUED_ERROR =
    'There are too many requests being made to the database right now. Please try again in a few minutes'
  public static readonly DEFAULT_MAX_CONCURRENCY = 20
  public static readonly DEFAULT_MAX_QUEUED = 100
  private readonly maxQueued: number
  private readonly queue: PQueue

  constructor(options?: Partial<QueueOptions>) {
    const withoutUndefined = options ? copyWithoutUndefinedValues(options) : {}
    const { maxConcurrency, maxQueued } = {
      maxConcurrency: RepositoryQueue.DEFAULT_MAX_CONCURRENCY,
      maxQueued: RepositoryQueue.DEFAULT_MAX_QUEUED,
      ...withoutUndefined
    }
    this.queue = new PQueue({ concurrency: maxConcurrency })
    this.maxQueued = maxQueued
  }

  addDatabaseRequest<T>(priority: DB_REQUEST_PRIORITY, execution: () => Promise<T>): Promise<T> {
    const priorityLabel = DB_REQUEST_PRIORITY[priority]
    metricsComponent.increment('db_queued_queries_count')
    if (this.queue.size >= this.maxQueued && priority === DB_REQUEST_PRIORITY.LOW) {
      metricsComponent.increment('db_queued_queries_rejected_count')
      return Promise.reject(new Error(RepositoryQueue.TOO_MANY_QUEUED_ERROR))
    }

    const { end: endTimer } = metricsComponent.startTimer('db_queued_queries_executed', { priority: priorityLabel })

    return this.queue.add(
      async () => {
        try {
          return await execution()
        } finally {
          endTimer()
        }
      },
      { priority }
    )
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

function copyWithoutUndefinedValues<T extends Record<string, any>>(object: T): T {
  const newLocal = Object.entries(object).filter(([, value]) => value)
  /* eslint-disable @typescript-eslint/ban-ts-comment */
  // @ts-ignore
  return Object.fromEntries<T>(newLocal)
}
