/** One admitted upload's share of the in-flight budget. */
export interface UploadBudgetLease {
  /** Changes this upload's byte reservation. Returns false, leaving it unchanged, when the budget can't fit it. */
  resize(bytes: number): boolean
  /** Returns the reservation to the budget. Idempotent. */
  release(): void
}

/**
 * Aggregate bound on uploads buffered in memory at once, across all clients. POST /entities buffers
 * each request body before any authentication, so this bounds memory by bytes and concurrent uploads
 * rather than by request count.
 */
export interface IUploadBudget {
  /**
   * Admits an upload with an initial byte reservation.
   * @throws UploadBudgetExceededError when the concurrency or byte budget is exhausted.
   */
  acquire(bytes: number): UploadBudgetLease
}
