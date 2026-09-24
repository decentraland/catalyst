export class EntityLockTimeoutError extends Error {
  constructor(public readonly entityId?: string) {
    super(
      entityId
        ? `The content lock for entity ${entityId} is still busy, please retry shortly.`
        : 'The content lock is still busy, please retry shortly.'
    )
    this.name = 'EntityLockTimeoutError'
  }
}
