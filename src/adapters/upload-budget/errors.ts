export class UploadBudgetExceededError extends Error {
  constructor() {
    super('Server is handling too many uploads, please retry shortly.')
    this.name = 'UploadBudgetExceededError'
  }
}
