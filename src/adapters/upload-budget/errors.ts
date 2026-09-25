export class UploadBudgetExceededError extends Error {
  constructor(public readonly reason: 'bytes' | 'concurrency') {
    super('Server is buffering too many uploads, please retry shortly.')
    this.name = 'UploadBudgetExceededError'
  }
}
