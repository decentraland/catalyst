/* eslint-disable @typescript-eslint/ban-types */
import { NextFunction, Request, RequestHandler, Response } from 'express'
import { IRealm } from '../peerjs-server'

enum PeerHeaders {
  PeerToken = 'X-Peer-Token'
}

//Validations
export function requireAll(
  paramNames: string[],
  objectGetter: (req: Request, res: Response) => object
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const missing = paramNames.filter((param) => typeof objectGetter(req, res)[param] === 'undefined')

    if (missing.length > 0) {
      res.status(400).send({
        status: 'bad-request',
        message: `Missing required parameters: ${missing.join(', ')}`
      })
    } else {
      next()
    }
  }
}

export function requireOneOf(
  paramNames: string[],
  objectGetter: (req: Request, res: Response) => object
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const hasOne = paramNames.some((param) => typeof objectGetter(req, res)[param] !== 'undefined')

    if (!hasOne) {
      res.status(400).send({
        status: 'bad-request',
        message: `Missing required parameters: Must have at least one of ${paramNames.join(', ')}`
      })
    } else {
      next()
    }
  }
}

export function validatePeerToken(realmProvider: () => IRealm): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.body.userId ?? req.params.userId
    const existingClient = realmProvider().getClientById(userId)
    if (
      !existingClient ||
      !existingClient.isAuthenticated() ||
      existingClient.getToken() !== req.header(PeerHeaders.PeerToken)
    ) {
      res.status(401).send({ status: 'unauthorized' })
    } else {
      next()
    }
  }
}
