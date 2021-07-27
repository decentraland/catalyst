import { Island, PeerData } from '@dcl/archipelago'
import { validateSignatureHandler } from 'decentraland-katalyst-commons/handlers'
import { Metrics } from 'decentraland-katalyst-commons/metrics'
import express, { Request, RequestHandler, Response } from 'express'
import { requireAll } from './misc/handlers'
import { AppServices, PeerInfo } from './types'

export type RoutesOptions = {
  env?: any
  name: string
  ethNetwork: string
  version: string
  restrictedAccessSigner: string
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
  services: Pick<AppServices, 'configService' | 'peersService' | 'archipelagoService'>,
  options: RoutesOptions
) {
  const { configService } = services

  const getStatus: RequestHandler = (req, res) => {
    const status: any = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env,
      ready: true,
      usersCount: services.peersService().getActivePeersCount()
    }

    if (req.query.includeUsersParcels) {
      status.usersParcels = services.peersService().getUsersParcels()
    }

    res.send(status)
  }

  const putConfig = async (req: Request, res: Response) => {
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

  const getConfig = async (_req: Request, res: Response) => {
    const config = configService.getAllConfig()
    res.send(config)
  }

  function toSimpleIsland(island: Island) {
    function toPeerInfo(peer: PeerData): PeerInfo & { preferedIslandId?: string } {
      const info = services.peersService().getPeerInfo(peer.id)

      return { ...info, preferedIslandId: peer.preferedIslandId }
    }

    return {
      id: island.id,
      peers: island.peers.map(toPeerInfo),
      maxPeers: island.maxPeers,
      center: island.center,
      radius: island.radius
    }
  }

  const getIslands = async (_req: Request, res: Response) => {
    const islandsResponse = await services.archipelagoService().getIslands()
    if (islandsResponse.ok) {
      res.send({ ...islandsResponse, islands: islandsResponse.islands.map(toSimpleIsland) })
    } else {
      res.send(islandsResponse)
    }
  }

  const getIsland = async (req: Request, res: Response) => {
    const island = await services.archipelagoService().getIsland(req.params.islandId)

    if (island) {
      res.send(toSimpleIsland(island))
    } else {
      res.status(404).send({ status: 'not-found' })
    }
  }

  const getPeers = async (_req: Request, res: Response) => {
    const peersResponse = services.peersService().getAllPeers()

    res.send(peersResponse)
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

  registerRoute(app, '/islands', HttpMethod.GET, [asyncHandler(getIslands)])

  registerRoute(app, '/islands/:islandId', HttpMethod.GET, [asyncHandler(getIsland)])

  registerRoute(app, '/peers', HttpMethod.GET, [asyncHandler(getPeers)])

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
