import { asyncHandler, validateSignatureFromHeaderHandler, validateSignatureHandler } from '@dcl/catalyst-node-commons'
import { Island, PeerData } from '@dcl/archipelago'
import express, { Request, Response } from 'express'
import { LighthouseConfig } from './config/configService'
import { toGraphviz } from './misc/graphvizTopology'
import { requireAll } from './misc/handlers'
import { AppServices, PeerInfo } from './types'

export type RoutesOptions = {
  env?: any
  name: string
  ethNetwork: string
  version: string
  restrictedAccessSigner: string
}

export function configureRoutes(
  app: express.Express,
  services: Pick<AppServices, 'configService' | 'peersService' | 'archipelagoService'>,
  options: RoutesOptions
) {
  const { configService } = services

  const getStatus = async (req: Request, res: Response) => {
    const status: any = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env,
      ready: true,
      usersCount: services.peersService().getActivePeersCount(),
      islandsCount: await services.archipelagoService().getIslandsCount(),
      maxUsers: configService.get(LighthouseConfig.MAX_CONCURRENT_USERS)
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
    const peersResponse = services.peersService().getConnectedPeersInfo()

    res.send(peersResponse)
  }

  const getPeerParameters = async (_req: Request, res: Response) => {
    const config = services.configService.get(LighthouseConfig.PEER_PARAMETERS)

    res.send(config)
  }

  const getTopology = async (req: Request, res: Response) => {
    const topologyInfo = services.peersService().getTopology()
    if (topologyInfo.ok) {
      if (req.query.format === 'graphviz') {
        res.setHeader('Content-Type', 'text/vnd.graphviz')
        res.send(toGraphviz(topologyInfo.topology))
      } else {
        res.send(topologyInfo)
      }
    } else {
      res.status(503).send(topologyInfo)
    }
  }

  app.get('/status', asyncHandler(getStatus))

  app.put('/config', [
    requireAll(['config'], (req) => req.body),
    validateSignatureHandler(
      (body) => JSON.stringify(body.config),
      options.ethNetwork,
      (signer) => signer?.toLowerCase() == options.restrictedAccessSigner.toLowerCase()
    ),
    asyncHandler(putConfig)
  ])

  app.get('/config', asyncHandler(getConfig))
  app.get('/islands', asyncHandler(getIslands))
  app.get('/islands/:islandId', asyncHandler(getIsland))
  app.get('/peers', asyncHandler(getPeers))
  app.get('/peers/topology', asyncHandler(getTopology))
  app.get('/peer-parameters', validateSignatureFromHeaderHandler(options.ethNetwork), asyncHandler(getPeerParameters))
}
