export const HTTP_STATUS_CODES = {
  ok: 200,
  unauthorized: 401,
  notFound: 404,
  error: 500
}
export type StatusCode = typeof HTTP_STATUS_CODES[keyof typeof HTTP_STATUS_CODES]

export class HTTPError extends Error {
  data: any
  statusCode: StatusCode

  constructor(
    message: string,
    data?: any,
    statusCode: StatusCode = HTTP_STATUS_CODES.error
  ) {
    super(message)
    this.data = data
    this.statusCode = statusCode
  }

  setData(data: any) {
    this.data = data
    return this
  }

  setStatusCode(statusCode: StatusCode) {
    this.statusCode = statusCode
    return this
  }
}
