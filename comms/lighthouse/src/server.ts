import {
  authHeaders,
  DAOContractClient,
  DECENTRALAND_ADDRESS,
  initializeMetricsServer
} from '@dcl/catalyst-node-commons'
import { DAOContract } from '@dcl/catalyst-contracts'
import { COMMS_API } from '@dcl/catalyst-api-specs'
import cors from 'cors'
import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import morgan from 'morgan'
import * as path from 'path'
import { ConfigService } from './config/configService'
import { lighthouseConfigStorage } from './config/simpleStorage'
import { metricsComponent } from './metrics'
import { patchLog } from './misc/logging'
import { pickName } from './misc/naming'
import { IRealm } from './peerjs-server'
import { ArchipelagoService } from './peers/archipelagoService'
import { IdService } from './peers/idService'
import { initPeerJsServer } from './peers/initPeerJsServer'
import { defaultPeerMessagesHandler } from './peers/peerMessagesHandler'
import { peersCheckJob } from './peers/peersCheckJob'
import { PeersService } from './peers/peersService'
import { configureRoutes } from './routes'
import { AppServices } from './types'

const LIGHTHOUSE_PROTOCOL_VERSION = '1.0.0'
const DEFAULT_ETH_NETWORK = 'ropsten'

const CURRENT_ETH_NETWORK = process.env.ETH_NETWORK ?? DEFAULT_ETH_NETWORK

async function main() {
  const daoClient = new DAOContractClient(DAOContract.withNetwork(CURRENT_ETH_NETWORK))

  const name = await pickName(process.env.LIGHTHOUSE_NAMES, daoClient)
  console.info('Picked name: ' + name)

  patchLog(name)

  const accessLogs = parseBoolean(process.env.ACCESS ?? 'false')
  const port = parseInt(process.env.PORT ?? '9000')
  const noAuth = parseBoolean(process.env.NO_AUTH ?? 'false')
  const secure = parseBoolean(process.env.SECURE ?? 'false')
  const validateAPI = parseBoolean(process.env.VALIDATE_API ?? 'false')
  const idAlphabet = process.env.ID_ALPHABET ? process.env.ID_ALPHABET : undefined
  const idLength = process.env.ID_LENGTH ? parseInt(process.env.ID_LENGTH) : undefined
  const restrictedAccessAddress = process.env.RESTRICTED_ACCESS_ADDRESS ?? DECENTRALAND_ADDRESS

  function parseBoolean(string: string) {
    return string.toLowerCase() === 'true'
  }

  const app = express()

  const corsOptions: cors.CorsOptions = {
    origin: true,
    methods: 'GET,HEAD,POST,PUT,DELETE,CONNECT,TRACE,PATCH',
    allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'User-Agent', 'X-Peer-Token', ...authHeaders],
    credentials: true,
    maxAge: 86400
  }

  app.use(cors(corsOptions))
  app.use(express.json())
  if (accessLogs) {
    app.use(morgan('combined'))
  }
  if (validateAPI) {
    OpenApiValidator.middleware({
      apiSpec: COMMS_API,
      validateResponses: process.env.CI == 'true',
      validateRequests: true // (default)
    })
  }

  const configService = await ConfigService.build({
    storage: lighthouseConfigStorage,
    globalConfig: { ethNetwork: CURRENT_ETH_NETWORK }
  })

  const idService = new IdService({ alphabet: idAlphabet, idLength })

  const server = app.listen(port, async () => {
    console.info(`==> Lighthouse listening on port ${port}.`)
  })

  const appServices: AppServices = {
    peersService: () => peersService,
    archipelagoService: () => archipelagoService,
    configService,
    idService
  }

  const peerServer = initPeerJsServer({
    netServer: server,
    noAuth,
    ethNetwork: CURRENT_ETH_NETWORK,
    messagesHandler: defaultPeerMessagesHandler(appServices),
    ...appServices
  })

  function getPeerJsRealm(): IRealm {
    return peerServer.get('peerjs-realm')
  }

  const metricsServer = initializeMetricsServer(app, metricsComponent)
  await metricsServer.start()

  const peersService = new PeersService(getPeerJsRealm, appServices)

  const archipelagoService = new ArchipelagoService(appServices)

  configureRoutes(app, appServices, {
    name,
    version: LIGHTHOUSE_PROTOCOL_VERSION,
    ethNetwork: CURRENT_ETH_NETWORK,
    restrictedAccessSigner: restrictedAccessAddress,
    env: {
      secure,
      commitHash: process.env.COMMIT_HASH,
      catalystVersion: process.env.CATALYST_VERSION
    }
  })

  app.use('/peerjs', peerServer)

  const _static = path.join(__dirname, '../static')

  app.use('/monitor', express.static(_static + '/monitor'))

  const peersCheckJobInstance = await peersCheckJob(appServices)

  peersCheckJobInstance.start()
}

main().catch((e) => {
  console.error('Exiting process because of unhandled exception', e)
  process.exit(1)
})
