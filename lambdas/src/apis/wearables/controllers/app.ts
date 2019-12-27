import { Request, Response } from 'express'
import { env } from 'decentraland-commons'

// /info
export function getHealthCheck(_: Request, res: Response) {
  res.json({ version: env.get('npm_package_version', '') })
}
