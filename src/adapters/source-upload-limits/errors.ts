export class SourceUploadLimitExceededError extends Error {
  constructor(public readonly reason: 'source_bytes' | 'source_concurrency') {
    super('Too many uploads in progress from this client, please retry shortly.')
    this.name = 'SourceUploadLimitExceededError'
  }
}
