/**
 * Thrown when the entity buffer is malformed (invalid JSON, missing required fields,
 * fields with the wrong shape). Handlers should map this to a 400 response.
 */
export class InvalidEntityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidEntityError'
    Error.captureStackTrace(this, this.constructor)
  }
}
