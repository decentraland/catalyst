/** One admitted upload's share of the in-flight budget. */
export interface UploadBudgetLease {
  /** Changes this upload's byte reservation (never below the minimum). Returns false, leaving it unchanged, when the budget can't fit it. */
  resize(bytes: number): boolean
  /** Returns the reservation to the budget. Idempotent. */
  release(): void
}

/**
 * Aggregate bound on uploads buffered in memory at once, across all clients. POST /entities buffers
 * each request body before any authentication, so this bounds memory by bytes rather than by request
 * count; each upload reserves at least a minimum, which also bounds how many run at once.
 */
export interface IUploadBudget {
  /**
   * Admits an upload with an initial byte reservation, raised to the minimum reservation.
   * @throws UploadBudgetExceededError when the byte budget is exhausted.
   */
  acquire(bytes: number): UploadBudgetLease
}
