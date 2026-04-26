/**
 * Base class for typed domain errors thrown by logic and adapter components.
 *
 * Components should subclass this rather than throwing plain `Error` so the
 * controllers/middlewares.ts:createErrorHandler can map them to HTTP status
 * codes via `instanceof` checks. Pass `httpStatus` when the subclass has a
 * single canonical status; the handler may also do its own mapping.
 */
export class BaseDomainError extends Error {
  readonly httpStatus?: number

  constructor(message: string, httpStatus?: number) {
    super(message)
    this.name = new.target.name
    this.httpStatus = httpStatus
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Indicates that the caller's request is malformed (missing required fields,
 * invalid query parameters, etc.). Maps to HTTP 400.
 */
export class InvalidRequestError extends BaseDomainError {
  constructor(message: string) {
    super(message, 400)
  }
}

/**
 * Indicates that the requested resource does not exist. Maps to HTTP 404.
 */
export class NotFoundError extends BaseDomainError {
  constructor(message: string) {
    super(message, 404)
  }
}
