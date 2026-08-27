import { EntityType } from '@dcl/schemas'

/** The horizons a client's deploy budget is measured over. */
export enum DeploymentQuotaWindow {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day',
  WEEK = 'week'
}

/** One window's budget: `default` applies to every entity type without an override of its own. */
export type DeploymentQuotaBudget = {
  default: number
  perEntityType: Map<EntityType, number>
}

export type DeploymentQuotaLadder = Record<DeploymentQuotaWindow, DeploymentQuotaBudget>

/**
 * What the quota reads off a request. Structural on purpose: the component does not depend on the
 * HTTP framework's context type, and a test builds one from a literal.
 */
export type QuotaClient = {
  remoteAddress?: string
  request: { headers: { get(name: string): string | null } }
}

/** An address or CIDR whose deployments skip the quota. */
export type IpExemption = {
  /** Big-endian address bytes: 4 for IPv4, 16 for IPv6. */
  bytes: Uint8Array
  prefixBits: number
}

/** How an attempt was counted, reported on `dcl_content_deployment_quota_attempts_total`. */
export enum DeploymentQuotaOutcome {
  /** Counted and within the budget. */
  ALLOWED = 'allowed',
  /** Counted and over the budget, so the deployment was rejected. */
  LIMITED = 'limited',
  /**
   * Not really counted — the counter was unreachable and the attempt was allowed through. Kept apart
   * from `allowed` so a cache outage cannot pass for healthy traffic on a dashboard.
   */
  DEGRADED = 'degraded'
}

/** The outcome of counting one attempt against one window. */
export type QuotaCountResult = {
  allowed: boolean
  /** The budget this attempt was measured against; the tightened cap in the shared bucket. */
  limit: number
  /** Seconds until the window resets, for `Retry-After`. Never below 1. */
  retryAfterSeconds: number
  /** True when the counter could not be read or written, so `allowed` reflects failing open. */
  storeUnavailable: boolean
}

export type IDeploymentQuota = {
  /**
   * Counts one deploy attempt of `entityType` against the client's budget in every window, shortest
   * first, stopping at the first window that is over.
   *
   * @throws DeploymentQuotaExceededError when a window's budget is exhausted.
   */
  assertWithinQuota(client: QuotaClient, entityType: EntityType): Promise<void>
}
