import { Request, Response, NextFunction } from 'express'
import { HTTPError, HTTP_STATUS_CODES } from '../utils/HTTPError'

export function useErrorHandler(
  error: HTTPError,
  _: Request,
  res: Response,
  next: NextFunction
) {
  if (error) {
    const statusCode = error.statusCode || HTTP_STATUS_CODES.error
    const json: Record<string, any> = { message: error.message }

    if (error.data) {
      json.data = error.data
    }

    console.error(error)

    res.status(statusCode).json(json)
  } else {
    next()
  }
}
