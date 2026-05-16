export type GCStaleProfilesResult = {
  deletedHashes: Set<string>
  deletedDeployments: Set<string>
}

export type SweepResult = {
  gcProfileActiveEntitiesResult?: Set<string>
  gcUnusedHashResult?: Set<string>
  gcStaleProfilesResult?: GCStaleProfilesResult
}

export type IGarbageCollectionComponent = {
  /** Periodic GC pass: walks DB-tracked overwritten rows, purges orphan content + stale profile deployments. */
  performSweep: () => Promise<void>
  getLastSweepResults: () => SweepResult | undefined
  /**
   * Manual full-storage sweep. Builds a Bloom filter from every referenced hash across deployments,
   * content files, and snapshots, then deletes every file in storage that isn't in the filter.
   * Used by the `run-maintenance` entrypoint for emergency cleanups; do NOT call from the periodic job.
   */
  deleteUnreferencedFiles: () => Promise<void>
}
