export class EntityLockTimeoutError extends Error {
  constructor(public readonly entityId: string) {
    super(`The content lock for ${entityId} is still busy, please retry shortly.`)
    this.name = 'EntityLockTimeoutError'
  }
}
