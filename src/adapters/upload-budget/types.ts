/** One admitted upload's share of the in-flight budget. */
export interface UploadBudgetLease {
  /** Changes this upload's byte reservation (never below the minimum). Returns false, leaving it unchanged, when the budget can't fit it. */
  resize(bytes: number): boolean
  /** Returns the reservation to the budget. Idempotent. */
  release(): void
}

/** The resource a budget bounds: temporary upload files on disk, or deployment files read into memory. */
export type UploadBudgetKind = 'disk' | 'memory'

/**
 * Aggregate bound on uploads held at once across all clients, by bytes rather than by request count.
 * POST /entities receives each body before any authentication; each of its uploads reserves at least a
 * minimum from the disk budget, which also bounds how many run at once.
 */
export interface IUploadBudget {
  /** Most bytes the budget can ever hold at once. */
  readonly capacityBytes: number
  /**
   * Admits an upload with an initial byte reservation, raised to the minimum reservation.
   * @throws UploadBudgetExceededError when the byte budget is exhausted.
   */
  acquire(bytes: number): UploadBudgetLease
}
