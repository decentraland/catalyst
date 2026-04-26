export type ISequentialTaskExecutorComponent = {
  /**
   * Runs sequential jobs with a max concurrency of 1 per jobName.
   */
  run<T>(jobName: string, fn: () => Promise<T>): Promise<T>
}
