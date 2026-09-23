/**
 * Resolves after the requested delay.
 *
 * Kept locally because timing is application behavior, not part of the snapshots-fetcher contract.
 *
 * @param milliseconds - Delay in milliseconds.
 * @returns A promise that resolves after the delay.
 */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
