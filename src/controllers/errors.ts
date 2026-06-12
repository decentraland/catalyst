/**
 * HTTP-shaped errors thrown by handlers and translated to HTTP responses by
 * the central error middleware in `./middlewares.ts`.
 *
 * These live at the controllers layer because their meaning is HTTP-specific.
 * Components and logic must NOT throw or extend these — they should throw
 * their own component-local typed errors (defined in each component's
 * `errors.ts`), and the calling handler is responsible for catching and
 * mapping each component error to the HTTP error appropriate for that
 * endpoint. The same component error may map to different HTTP statuses in
 * different handlers.
 */

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidRequestError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadTooLargeError'
    Error.captureStackTrace(this, this.constructor)
  }
}
