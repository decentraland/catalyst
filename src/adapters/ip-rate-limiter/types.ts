export type IIpRateLimiterComponent = {
  /**
   * Returns true if the given IP has exceeded the configured request limit for the current window.
   * Increments the counter for the IP on every call.
   */
  isRateLimited(ip: string): boolean
}
