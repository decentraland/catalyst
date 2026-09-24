export class EntityLockTimeoutError extends Error {
  constructor(public readonly entityId: string) {
    super(`Another request for entity ${entityId} is still in progress, please retry shortly.`)
    this.name = 'EntityLockTimeoutError'
  }
}
