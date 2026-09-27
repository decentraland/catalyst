/**
 * Daily budget of regular (non-partial) deployments per client source. Counting goes through the rate
 * limiter; which sources have spent their budget is kept in the limiter's store, so a request can be
 * turned away before its body is read, without being counted, by any instance sharing the counters.
 */
export interface IDeploymentQuotaComponent {
  /**
   * Checks, without counting, that the source has deployments left in its current window.
   * @throws DeploymentQuotaExceededError when the source has spent its budget.
   */
  assertAvailable(source: string): Promise<void>
  /**
   * Counts one regular deployment by the source.
   * @throws DeploymentQuotaExceededError when it exceeds the source's budget.
   */
  consume(source: string): Promise<void>
}
