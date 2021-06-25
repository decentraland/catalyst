import { validateSignatureHandler } from 'decentraland-katalyst-commons/handlers'
import { Metrics } from 'decentraland-katalyst-commons/metrics'
import express, { Request, RequestHandler, Response } from 'express'
import { requireAll } from './misc/handlers'
import { AppServices } from './types'

export type RoutesOptions = {
  env?: any
  name: string
  ethNetwork: string
  version: string
  restrictedAccessSigner: string
}

type CommsStatus = {
  name: string
  version: string
  currenTime: number
  env: Record<string, string | number | boolean>
  ready: boolean
  usersCount: number
  userParcels?: [number, number][]
}

export function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (e) {
      console.error(`Unexpected error while performing request ${req.method} ${req.originalUrl}`, e)
      res.status(500).send({ status: 'server-error', message: 'Unexpected error' })
    }
  }
}

export function configureRoutes(
  app: express.Express,
  services: Pick<AppServices, 'configService' | 'peersService'>,
  options: RoutesOptions
) {
  const { configService } = services

  const getStatus: RequestHandler = (req, res) => {
    const includeUserParcels = req.query.includeLayers === 'true' || req.query.includeUserParcels === 'true'
    const status: CommsStatus = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env,
      ready: true,
      usersCount: services.peersService().getActivePeersCount()
    }

    if (includeUserParcels) {
      status.userParcels = services.peersService().getUsersParcels()
    }

    res.send(status)
  }

  const putConfig = async (req, res) => {
    const configKeyValues = req.body.config
    if (!Array.isArray(configKeyValues) || configKeyValues.some((it) => !it.key)) {
      res.status(400).send(
        JSON.stringify({
          status: 'bad-request',
          message: 'Expected array body with {key: string, value?: string} elements'
        })
      )
    } else {
      const config = await configService.updateStorageConfigs(configKeyValues)
      res.send(config)
    }
  }

  const getConfig = async (req, res) => {
    const config = configService.getAllConfig()
    res.send(config)
  }

  registerRoute(app, '/status', HttpMethod.GET, [getStatus])

  registerRoute(app, '/config', HttpMethod.PUT, [
    requireAll(['config'], (req) => req.body),
    validateSignatureHandler(
      (body) => JSON.stringify(body.config),
      options.ethNetwork,
      (signer) => signer?.toLowerCase() == options.restrictedAccessSigner.toLowerCase()
    ),
    asyncHandler(putConfig)
  ])

  registerRoute(app, '/config', HttpMethod.GET, [asyncHandler(getConfig)])

  function registerRoute(app: express.Express, route: string, method: HttpMethod, actions: RequestHandler[]) {
    const handlers: RequestHandler[] = [...Metrics.requestHandlers(), ...actions]
    switch (method) {
      case HttpMethod.GET:
        app.get(route, handlers)
        break
      case HttpMethod.PUT:
        app.put(route, handlers)
        break
      case HttpMethod.DELETE:
        app.delete(route, handlers)
        break
    }
  }
}

enum HttpMethod {
  GET,
  PUT,
  DELETE
}
