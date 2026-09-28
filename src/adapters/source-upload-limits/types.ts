/** One admitted upload's share of its source's in-flight allowance. */
export interface SourceUploadLease {
  /** Returns the share to the source. Idempotent. */
  release(): void
}

/**
 * Per-client-source bound on POST /entities bodies in flight in this process, so one source can hold
 * only a small share of the process-wide upload budget however many requests it opens. Applied before
 * the body is read, to every request, since a body that never completes is never authenticated.
 * Admits everything when TRUSTED_CLIENT_IP_HEADER is unset.
 */
export interface ISourceUploadLimits {
  /**
   * Admits an upload of up to `bytes` from `source`.
   * @throws SourceUploadLimitExceededError when the source already has its share in flight.
   */
  acquire(source: string, bytes: number): SourceUploadLease
}
