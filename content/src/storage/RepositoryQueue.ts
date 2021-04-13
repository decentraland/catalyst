import future from 'fp-future'

export class RepositoryQueue {
  private static readonly MAX_QUEUED_REQUESTS = 50
  private static readonly MAX_CONCURRENT_REQUESTS = 20
  private readonly queue: DatabaseRequest[] = []
  private ongoingRequests = 0

  addDatabaseRequest<T>(priority: DB_REQUEST_PRIORITY, execution: () => Promise<T>): Promise<T> {
    if (this.queue.length >= RepositoryQueue.MAX_QUEUED_REQUESTS && priority === DB_REQUEST_PRIORITY.LOW) {
      return Promise.reject(
        new Error('There are too many requests being made to the database right now. Please try again in a few minutes')
      )
    }

    const fut = future<T>()
    const queryExecution = () =>
      execution()
        .then((result) => fut.resolve(result))
        .catch((error) => fut.reject(error))
        .finally(() => this.onRequestFinish())

    if (this.ongoingRequests < RepositoryQueue.MAX_CONCURRENT_REQUESTS) {
      // No need to add it to the queue, execute it directly
      this.executeRequest(queryExecution)
    } else {
      // Add it to the queue
      this.queue.push(queryExecution)
    }

    return fut
  }

  private onRequestFinish() {
    this.ongoingRequests--
    const nextRequest = this.queue.shift()
    if (nextRequest) {
      this.executeRequest(nextRequest)
    }
  }

  private executeRequest(request: DatabaseRequest) {
    this.ongoingRequests++
    request()
  }
}

export enum DB_REQUEST_PRIORITY {
  HIGH,
  LOW
}

type DatabaseRequest = () => Promise<void>
