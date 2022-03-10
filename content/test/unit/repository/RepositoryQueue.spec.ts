import { delay } from '@catalyst/commons'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import future from 'fp-future'
import { metricsDeclaration } from '../../../src/metrics'
import { DB_REQUEST_PRIORITY, RepositoryQueue } from '../../../src/repository/RepositoryQueue'
import { assertPromiseRejectionMatches } from '../../helpers/PromiseAssertions'

describe('RepositoryQueue', () => {
  const metrics = createTestMetricsComponent(metricsDeclaration)

  it(`When a requests is added to the queue, it starts automatically if concurrency limit allows it`, async () => {
    const queue = new RepositoryQueue({ metrics })

    // Add our custom request
    const request = new DBRequest()
    const requestResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(request))

    // Wait a bit
    await delay(100)

    // See that it has started
    expect(request.started).toBe(true)

    resolve(request)
    await awaitAll(requestResult)
  })

  it(`When there are too many concurrent requests, then a new request that is added to the queue isn't started`, async () => {
    const queue = new RepositoryQueue({ metrics }, { maxConcurrency: 1 })

    // Add a request that never finishes
    const stuckRequest = new DBRequest()
    const stuckResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(stuckRequest))

    // Add our custom request
    const request = new DBRequest()
    const requestResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(request))

    // Wait a bit
    await delay(100)

    // See that it hasn't been started
    expect(request.started).toBe(false)

    resolve(stuckRequest, request)
    await awaitAll(stuckResult, requestResult)
  })

  it(`When there are too many queued requests, then a high priority request is queued anyway`, async () => {
    const queue = new RepositoryQueue({ metrics }, { maxConcurrency: 1, maxQueued: 1 })

    // Add a request that never finishes
    const stuckRequest = new DBRequest()
    const stuckResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(stuckRequest))

    // Add another request that never finishes
    const stuckRequest2 = new DBRequest()
    const stuckResult2 = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(stuckRequest))

    expect(queue.beingExecuted).toBe(1)
    expect(queue.pendingInQueue).toBe(1)

    // Add our custom request
    const request = new DBRequest()
    const requestResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(request))

    expect(queue.beingExecuted).toBe(1)
    expect(queue.pendingInQueue).toBe(2)

    // See that it hasn't been started
    expect(stuckRequest.started).toBe(true)
    expect(stuckRequest2.started).toBe(false)
    expect(request.started).toBe(false)

    resolve(stuckRequest, stuckRequest2, request)
    await awaitAll(stuckResult, stuckResult2, requestResult)
  })

  it(`When there are too many queued requests, then a low priority request is rejected without being executed`, async () => {
    const queue = new RepositoryQueue({ metrics }, { maxConcurrency: 1, maxQueued: 1 })

    // Add a request that never finishes
    const stuckRequest = new DBRequest()
    const stuckResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(stuckRequest))

    // Add another request that never finishes
    const stuckRequest2 = new DBRequest()
    const stuckResult2 = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.HIGH, caller(stuckRequest))

    // Add our custom request
    const request = new DBRequest()
    const requestResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.LOW, caller(request))

    expect(queue.beingExecuted).toBe(1)
    expect(queue.pendingInQueue).toBe(1)

    // See that it hasn't been started
    expect(stuckRequest.started).toBe(true)
    expect(stuckRequest2.started).toBe(false)
    expect(request.started).toBe(false)

    await assertPromiseRejectionMatches(() => requestResult, RepositoryQueue.TOO_MANY_QUEUED_ERROR)

    resolve(stuckRequest, stuckRequest2, request)
    await awaitAll(stuckResult, stuckResult2)
  })

  it(`When a request fails, then the returned promise also fails`, async () => {
    const queue = new RepositoryQueue({ metrics }, { maxConcurrency: 1, maxQueued: 1 })

    // Add our custom request
    const request = new DBRequest()
    const requestResult = queue.addDatabaseRequest(DB_REQUEST_PRIORITY.LOW, caller(request))

    expect(request.started).toBe(true)
    const errorMessage = 'Some error'
    request.reject(new Error(errorMessage))

    await assertPromiseRejectionMatches(() => requestResult, errorMessage)
  })

  /** Await for all the given promises */
  function awaitAll(...promises: Promise<any>[]) {
    return Promise.all(promises)
  }

  /** Resolve all awaiting requests */
  function resolve(...requests: DBRequest[]) {
    for (const request of requests) {
      request.resolve()
    }
  }

  function caller(request: DBRequest): () => DBRequest {
    return () => {
      request.started = true
      return request
    }
  }
})

/** A promise that represent a database request */
class DBRequest implements Promise<void> {
  public started: boolean = false
  private readonly promise = future()

  constructor() {}

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected)
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<void | TResult> {
    return this.promise.catch(onrejected)
  }

  [Symbol.toStringTag]: string
  finally(onfinally?: (() => void) | null): Promise<void> {
    return this.promise.finally(onfinally)
  }

  resolve() {
    return this.promise.resolve(undefined)
  }

  reject(error: Error) {
    return this.promise.reject(error)
  }
}
