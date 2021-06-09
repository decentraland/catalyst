import { validateSignatureHandler } from 'decentraland-katalyst-commons/handlers'
import { Metrics } from 'decentraland-katalyst-commons/metrics'
import express, { RequestHandler } from 'express'
import { ConfigService } from './config/configService'
import { requireAll } from './misc/handlers'

export type RoutesOptions = {
  env?: any
  name: string
  ethNetwork: string
  version: string
  restrictedAccessSigner: string
}

export type Services = {
  configService: ConfigService
}

export function configureRoutes(app: express.Express, services: Services, options: RoutesOptions) {
  const { configService } = services

  const getStatus: RequestHandler = (req, res) => {
    const status: any = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env,
      ready: true
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
    putConfig
  ])

  registerRoute(app, '/config', HttpMethod.GET, [getConfig])

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
