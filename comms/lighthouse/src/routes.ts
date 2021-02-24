import { validateSignatureHandler } from 'decentraland-katalyst-commons/handlers'
import { Metrics } from 'decentraland-katalyst-commons/metrics'
import express, { RequestHandler } from 'express'
import { IRealm } from 'peerjs-server'
import { ConfigService } from './configService'
import { RequestError } from './errors'
import { requireAll, requireOneOf, requireServerReady, validatePeerToken } from './handlers'
import { LayersService } from './layersService'
import { PeersService } from './peersService'
import { ReadyStateService } from './readyStateService'
import { Layer, PeerInfo } from './types'

export type RoutesOptions = {
  env?: any
  name: string
  ethNetwork: string
  version: string
  restrictedAccessSigner: string
}

export type Services = {
  layersService: LayersService
  realmProvider: () => IRealm
  peersService: PeersService
  configService: ConfigService
  readyStateService: ReadyStateService
}

export function configureRoutes(app: express.Express, services: Services, options: RoutesOptions) {
  const { layersService, realmProvider: getPeerJsRealm, peersService, configService, readyStateService } = services

  const validateLayerExists = (req, res, next) => {
    if (layersService.exists(req.params.layerId)) {
      next()
    } else {
      res.status(404).send({ status: 'layer-not-found' })
    }
  }

  const getStatus: RequestHandler = async (req, res) => {
    const ready = readyStateService.isReady()

    const status: any = {
      name: options.name,
      version: options.version,
      currenTime: Date.now(),
      env: options.env,
      ready
    }

    const globalMaxPerLayer = await configService.getMaxPeersPerLayer()

    if (req.query.includeLayers === 'true') {
      status.layers = layersService.getLayers().map((it) => mapLayerToJson(it, globalMaxPerLayer, true))
    }

    if (!ready) {
      res.status(503)
    }

    res.send(status)
  }

  const getLayers: RequestHandler = async (req, res) => {
    const globalMaxPerLayer = await configService.getMaxPeersPerLayer()
    res.send(
      layersService.getLayers().map((it) => mapLayerToJson(it, globalMaxPerLayer, req.query.usersParcels === 'true'))
    )
  }

  const getByLayerId = async (req, res) => {
    const globalMaxPerLayer = await configService.getMaxPeersPerLayer()
    res.send(mapLayerToJson(layersService.getLayer(req.params.layerId)!, globalMaxPerLayer))
  }

  const GetUsersByLayerId = (req, res) => {
    res.send(mapUsersToJson(layersService.getLayerPeers(req.params.layerId)))
  }

  const getRoomsByLayerId = (req, res) => {
    res.send(layersService.getRoomsService(req.params.layerId)!.getRoomIds({ peerId: req.query.userId }))
  }

  const getRoomId = (req, res) => {
    const roomUsers = layersService.getRoomsService(req.params.layerId)!.getPeers(req.params.roomId)
    if (typeof roomUsers === 'undefined') {
      res.status(404).send({ status: 'room-not-found' })
    } else {
      res.send(mapUsersToJson(roomUsers))
    }
  }

  const putLayerId = async (req, res, next) => {
    const { layerId } = req.params
    try {
      const layer = await layersService.setPeerLayer(layerId, req.body)
      res.send(mapUsersToJson(peersService.getPeersInfo(layer.peers)))
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const putRoomId = async (req, res, next) => {
    const { layerId, roomId } = req.params
    try {
      const room = await layersService.addPeerToRoom(layerId, roomId, req.body)
      res.send(mapUsersToJson(peersService.getPeersInfo(room.peers)))
    } catch (err) {
      handleError(err, res, next)
    }
  }

  const deleteUserFromRoomById = (req, res) => {
    const { roomId, userId, layerId } = req.params
    const room = layersService.getRoomsService(layerId)?.removePeerFromRoom(roomId, userId)
    res.send(mapUsersToJson(peersService.getPeersInfo(room?.peers ?? [])))
  }

  const deleteUserId = (req, res) => {
    const { userId, layerId } = req.params
    const layer = layersService.removePeerFromLayer(layerId, userId)
    res.send(mapUsersToJson(peersService.getPeersInfo(layer?.peers ?? [])))
  }

  const getTopology = (req, res) => {
    const { layerId } = req.params
    const topologyInfo = layersService.getLayerTopology(layerId)
    if (req.query.format === 'graphviz') {
      res.send(`
      strict digraph graphName {
        concentrate=true
        ${topologyInfo
          .map((it) => `"${it.id}"[label="${it.id}\\nconns:${it.connectedPeerIds?.length ?? 0}"];`)
          .join('\n')}
        ${topologyInfo
          .map((it) =>
            it.connectedPeerIds?.length
              ? it.connectedPeerIds.map((connected) => `"${it.id}"->"${connected}";`).join('\n')
              : `"${it.id}";`
          )
          .join('\n')}
      }`)
    } else {
      res.send(topologyInfo)
    }
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
      const config = await configService.updateConfigs(configKeyValues)
      res.send(config)
    }
  }

  registerRoute(app, '/status', HttpMethod.GET, [getStatus])
  registerRoute(app, '/layers', HttpMethod.GET, [getLayers])
  registerRoute(app, '/layers/:layerId', HttpMethod.GET, [validateLayerExists, getByLayerId])
  registerRoute(app, '/layers/:layerId/users', HttpMethod.GET, [validateLayerExists, GetUsersByLayerId])
  registerRoute(app, '/layers/:layerId/rooms', HttpMethod.GET, [validateLayerExists, getRoomsByLayerId])
  registerRoute(app, '/layers/:layerId/rooms/:roomId', HttpMethod.GET, [validateLayerExists, getRoomId])
  registerRoute(app, '/layers/:layerId', HttpMethod.PUT, [
    requireServerReady(readyStateService),
    requireOneOf(['id', 'peerId'], (req) => req.body),
    validatePeerToken(getPeerJsRealm),
    putLayerId
  ])
  registerRoute(app, '/layers/:layerId/rooms/:roomId', HttpMethod.PUT, [
    requireServerReady(readyStateService),
    validateLayerExists,
    requireOneOf(['id', 'peerId'], (req) => req.body),
    validatePeerToken(getPeerJsRealm),
    putRoomId
  ])
  registerRoute(app, '/layers/:layerId/rooms/:roomId/users/:userId', HttpMethod.DELETE, [
    requireServerReady(readyStateService),
    validateLayerExists,
    validatePeerToken(getPeerJsRealm),
    deleteUserFromRoomById
  ])
  registerRoute(app, '/layers/:layerId/users/:userId', HttpMethod.DELETE, [
    requireServerReady(readyStateService),
    validateLayerExists,
    validatePeerToken(getPeerJsRealm),
    deleteUserId
  ])
  registerRoute(app, '/layers/:layerId/topology', HttpMethod.GET, [validateLayerExists, getTopology])

  registerRoute(app, '/config', HttpMethod.PUT, [
    requireAll(['config'], (req) => req.body),
    validateSignatureHandler(
      (body) => JSON.stringify(body.config),
      options.ethNetwork,
      (signer) => signer?.toLowerCase() == options.restrictedAccessSigner.toLowerCase()
    ),
    putConfig
  ])

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

  function mapLayerToJson(layer: Layer, globalMaxPerLayer: number | undefined, includeUserParcels: boolean = false) {
    return {
      name: layer.id,
      usersCount: layer.peers.length,
      maxUsers: layer.maxPeers ?? globalMaxPerLayer,
      ...(includeUserParcels && {
        usersParcels: layer.peers.map((it) => peersService.getPeerInfo(it).parcel).filter((it) => !!it)
      })
    }
  }

  function handleError(err: any, res, next) {
    const statusTexts = {
      400: 'bad-request',
      401: 'unauthorized',
      402: 'method-not-allowed',
      403: 'forbidden',
      404: 'not-found'
    }

    if (err instanceof RequestError) {
      res
        .status(err.status)
        .send(JSON.stringify({ status: err.statusMessage ?? statusTexts[err.status] ?? 'error', message: err.message }))
    } else {
      next(err)
    }
  }

  function mapUsersToJson(user?: PeerInfo[]) {
    return user?.map((it) => ({
      id: it.id,
      userId: it.id,
      protocolVersion: it.protocolVersion,
      peerId: it.id,
      parcel: it.parcel,
      position: it.position,
      lastPing: it.lastPing,
      address: it.address
    }))
  }
}

enum HttpMethod {
  GET,
  PUT,
  DELETE
}
