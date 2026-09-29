export class UploadBudgetExceededError extends Error {
  constructor() {
    super('Server is buffering too many uploads, please retry shortly.')
    this.name = 'UploadBudgetExceededError'
  }
}
