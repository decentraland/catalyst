/* eslint-disable @typescript-eslint/ban-ts-comment */
import cors from 'cors'
import { Authenticator } from 'dcl-crypto'
import { DECENTRALAND_ADDRESS } from 'decentraland-katalyst-commons/addresses'
import { DAOContractClient } from 'decentraland-katalyst-commons/DAOClient'
import { Metrics } from 'decentraland-katalyst-commons/metrics'
import { DAOContract } from 'decentraland-katalyst-contracts/DAOContract'
import { httpProviderForNetwork } from 'decentraland-katalyst-contracts/utils'
import express from 'express'
import morgan from 'morgan'
import * as path from 'path'
import { ExpressPeerServer, IRealm } from 'peerjs-server'
import { IConfig } from 'peerjs-server/dist/src/config'
import { IdType, MessageType } from 'peerjs-server/dist/src/enums'
import { IClient } from 'peerjs-server/dist/src/models/client'
import { IMessage } from 'peerjs-server/dist/src/models/message'
import { ConfigService } from './configService'
import { DEFAULT_LAYERS } from './default_layers'
import { IdService } from './idService'
import { LayersService } from './layersService'
import { patchLog } from './logging'
import { pickName } from './naming'
import { PeersService } from './peersService'
import { configureRoutes } from './routes'
import { lighthouseConfigStorage } from './simpleStorage'

const LIGHTHOUSE_VERSION = '0.2'
const DEFAULT_ETH_NETWORK = 'ropsten'

const CURRENT_ETH_NETWORK = process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK

;(async function () {
  const daoClient = new DAOContractClient(DAOContract.withNetwork(CURRENT_ETH_NETWORK))

  const name = await pickName(process.env.LIGHTHOUSE_NAMES, daoClient)
  console.info('Picked name: ' + name)

  patchLog(name)

  const accessLogs = parseBoolean(process.env.ACCESS ?? 'false')
  const port = parseInt(process.env.PORT ?? '9000')
  const noAuth = parseBoolean(process.env.NO_AUTH ?? 'false')
  const secure = parseBoolean(process.env.SECURE ?? 'false')
  const enableMetrics = parseBoolean(process.env.METRICS ?? 'true')
  const allowNewLayers = parseBoolean(process.env.ALLOW_NEW_LAYERS ?? 'false')
  const existingLayers = process.env.DEFAULT_LAYERS?.split(',').map((it) => it.trim()) ?? DEFAULT_LAYERS
  const idAlphabet = process.env.ID_ALPHABET ? process.env.ID_ALPHABET : undefined
  const idLength = process.env.ID_LENGTH ? parseInt(process.env.ID_LENGTH) : undefined
  const restrictedAccessAddress = process.env.RESTRICTED_ACCESS_ADDRESS ?? DECENTRALAND_ADDRESS

  function parseBoolean(string: string) {
    return string.toLowerCase() === 'true'
  }

  const app = express()

  if (enableMetrics) {
    Metrics.initialize()
  }

  const peersService = new PeersService(getPeerJsRealm)

  const corsOptions: cors.CorsOptions = {
    origin: true,
    methods: 'GET,HEAD,POST,PUT,DELETE,CONNECT,TRACE,PATCH',
    allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'User-Agent', 'X-Peer-Token'],
    credentials: true
  }

  app.use(cors(corsOptions))
  app.use(express.json())
  if (accessLogs) {
    app.use(morgan('combined'))
  }

  const configService = new ConfigService(lighthouseConfigStorage)

  const layersService = new LayersService({ peersService, existingLayers, allowNewLayers, configService })

  const idService = new IdService({ alphabet: idAlphabet, idLength })

  
  configureRoutes(
    app,
    { layersService, realmProvider: getPeerJsRealm, peersService, configService },
    {
      name,
      version: LIGHTHOUSE_VERSION,
      ethNetwork: CURRENT_ETH_NETWORK,
      restrictedAccessSigner: restrictedAccessAddress,
      env: {
        secure,
        commitHash: process.env.COMMIT_HASH,
        catalystVersion: process.env.CATALYST_VERSION
      }
    }
  )

  const server = app.listen(port, async () => {
    console.info(`==> Lighthouse listening on port ${port}.`)
  })

  const options: Partial<IConfig> = {
    path: '/',
    idGenerator: () => idService.nextId(),
    authHandler: async (client, message) => {
      if (noAuth) {
        return true
      }

      if (!client) {
        // client not registered
        return false
      }
      if (
        client.getIdType() === IdType.SELF_ASSIGNED &&
        client.getId().toLowerCase() !== message.payload[0]?.payload?.toLowerCase()
      ) {
        // client id mistmaches with auth signer
        return false
      }
      try {
        const provider = httpProviderForNetwork(CURRENT_ETH_NETWORK)
        const result = await Authenticator.validateSignature(client.getMsg(), message.payload, provider)

        const address = message.payload[0].payload

        if (!peersService.existsPeerWithAddress(address)) {
          peersService.setPeerAddress(client.getId(), message.payload[0].payload)
        } else {
          client.send({
            type: MessageType.ID_TAKEN,
            payload: { msg: 'ETH Address is taken' }
          })

          await client.getSocket()?.close()
          return false
        }

        return result.ok
      } catch (e) {
        console.log(`error while recovering address for client ${client.getId()}`, e)
        return false
      }
    }
  }

  const peerServer = ExpressPeerServer(server, options)

  peerServer.on('disconnect', (client: any) => {
    console.log('User disconnected from server socket. Removing from all rooms & layers: ' + client.id)
    layersService.removePeer(client.id)
  })

  peerServer.on('error', console.log)

  //@ts-ignore
  peerServer.on('message', (client: IClient, message: IMessage) => {
    if (message.type === MessageType.HEARTBEAT && client.isAuthenticated()) {
      peersService.updateTopology(client.getId(), message.payload?.connectedPeerIds)
      peersService.updatePeerParcel(client.getId(), message.payload?.parcel)
      peersService.updatePeerPosition(client.getId(), message.payload?.position)

      if (message.payload?.optimizeNetwork) {
        const optimalConnectionsResult = layersService.getOptimalConnectionsFor(
          client.getId(),
          message.payload.targetConnections,
          message.payload.maxDistance
        )
        client.send({
          type: 'OPTIMAL_NETWORK_RESPONSE',
          src: '__lighthouse_response__',
          dst: client.getId(),
          payload: optimalConnectionsResult
        })
      }
    }
  })

  function getPeerJsRealm(): IRealm {
    return peerServer.get('peerjs-realm')
  }

  app.use('/peerjs', peerServer)

  const _static = path.join(__dirname, '../static')

  app.use('/monitor', express.static(_static + '/monitor'))
})().catch((e) => {
  console.error('Exiting process because of unhandled exception', e)
  process.exit(1)
})
