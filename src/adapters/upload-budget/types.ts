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
   * Whether `bytes`, raised to the minimum reservation, fit beside what is reserved now. Reserves
   * nothing; counts a rejection when they don't fit.
   */
  fits(bytes: number): boolean
  /**
   * Admits an upload only while `admitBytes` (default `bytes`) fit, then reserves `bytes`, both raised
   * to the minimum reservation. Admitting on a declared size without reserving it sheds a full budget
   * before the body is read, while a body that never arrives holds only what it sent.
   * @throws UploadBudgetExceededError when the byte budget is exhausted.
   */
  acquire(bytes: number, admitBytes?: number): UploadBudgetLease
}
