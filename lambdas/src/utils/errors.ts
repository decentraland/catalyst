export class ServiceError extends Error {
  statusCode: number

  constructor(message: string, code: number = 400) {
    super(message)
    this.statusCode = code
  }
}
