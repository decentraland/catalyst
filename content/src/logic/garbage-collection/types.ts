export type GCStaleProfilesResult = {
  deletedHashes: Set<string>
  deletedDeployments: Set<string>
}

export type SweepResult = {
  gcProfileActiveEntitiesResult?: Set<string>
  gcUnusedHashResult?: Set<string>
  gcStaleProfilesResult?: GCStaleProfilesResult
}
