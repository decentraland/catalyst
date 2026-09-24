/** One admitted upload's share of the in-flight budget. */
export interface UploadBudgetLease {
  /** Changes this upload's byte reservation. Returns false, leaving it unchanged, when the budget can't fit it. */
  resize(bytes: number): boolean
  /** Returns the reservation to the budget. Idempotent. */
  release(): void
}

/** The resource a budget bounds: temporary upload files on disk, or deployment files read into memory. */
export type UploadBudgetKind = 'disk' | 'memory'

/**
 * Aggregate bound on uploads held at once across all clients, by bytes and concurrent uploads rather
 * than by request count. POST /entities receives each body before any authentication.
 */
export interface IUploadBudget {
  /**
   * Admits an upload with an initial byte reservation.
   * @throws UploadBudgetExceededError when the concurrency or byte budget is exhausted.
   */
  acquire(bytes: number): UploadBudgetLease
}
