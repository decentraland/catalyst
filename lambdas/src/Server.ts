import compression from 'compression'
import cors from 'cors'
import { Metrics } from 'decentraland-katalyst-commons/metrics'
import express, { Router } from 'express'
import http from 'http'
import log4js from 'log4js'
import morgan from 'morgan'
import { OffChainWearablesManager } from './apis/collections/off-chain/OffChainWearablesManager'
import { initializeCollectionsRoutes } from './apis/collections/routes'
import { initializeContentV2Routes } from './apis/content-v2/routes'
import { initializeContractRoutes } from './apis/contracts/routes'
import { initializeCryptoRoutes } from './apis/crypto/routes'
import { initializeExploreRoutes } from './apis/explore/routes'
import { initializeImagesRoutes } from './apis/images/routes'
import { EnsOwnership } from './apis/profiles/EnsOwnership'
import { initializeIndividualProfileRoutes, initializeProfilesRoutes } from './apis/profiles/routes'
import { WearablesOwnership } from './apis/profiles/WearablesOwnership'
import statusRouter from './apis/status/routes'
import { Bean, Environment, EnvironmentConfig } from './Environment'
import { SmartContentClient } from './utils/SmartContentClient'
import { SmartContentServerFetcher } from './utils/SmartContentServerFetcher'
import { TheGraphClient } from './utils/TheGraphClient'

export class Server {
  private port: number
  private app: express.Express
  private httpServer: http.Server

  constructor(env: Environment) {
    // Set logger
    log4js.configure({
      appenders: { console: { type: 'console', layout: { type: 'basic' } } },
      categories: { default: { appenders: ['console'], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
    })

    this.port = env.getConfig(EnvironmentConfig.SERVER_PORT)

    this.app = express()

    if (env.getConfig(EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE)) {
      this.app.use(compression({ filter: (req, res) => true }))
    }

    const corsOptions: cors.CorsOptions = {
      origin: true,
      methods: 'GET,HEAD,POST,PUT,DELETE,CONNECT,TRACE,PATCH',
      credentials: true
    }

    this.app.use(cors(corsOptions))
    this.app.use(express.json())
    if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
      this.app.use(morgan('combined'))
    }

    if (env.getConfig(EnvironmentConfig.METRICS)) {
      Metrics.initialize()
    }

    const ensOwnership: EnsOwnership = env.getBean(Bean.ENS_OWNERSHIP)
    const wearablesOwnership: WearablesOwnership = env.getBean(Bean.WEARABLES_OWNERSHIP)
    const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
    const contentClient: SmartContentClient = env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT)
    const theGraphClient: TheGraphClient = env.getBean(Bean.THE_GRAPH_CLIENT)
    const offChainManager: OffChainWearablesManager = env.getBean(Bean.OFF_CHAIN_MANAGER)

    // Base endpoints
    this.app.use('/', statusRouter(env))

    // Backwards compatibility for older Content API
    this.app.use('/contentv2', initializeContentV2Routes(createMetricsProxy(), fetcher))

    // Profile API implementation
    this.app.use(
      '/profile',
      initializeIndividualProfileRoutes(createMetricsProxy(), contentClient, ensOwnership, wearablesOwnership)
    )
    this.app.use(
      '/profiles',
      initializeProfilesRoutes(createMetricsProxy(), contentClient, ensOwnership, wearablesOwnership)
    )

    // DCL-Crypto API implementation
    this.app.use('/crypto', initializeCryptoRoutes(createMetricsProxy(), env.getConfig(EnvironmentConfig.ETH_NETWORK)))

    // Images API for resizing contents
    this.app.use(
      '/images',
      initializeImagesRoutes(createMetricsProxy(), fetcher, env.getConfig(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION))
    )

    // DAO cached access API
    this.app.use('/contracts', initializeContractRoutes(createMetricsProxy(), env.getBean(Bean.DAO)))

    // DAO Collections access API
    this.app.use(
      '/collections',
      initializeCollectionsRoutes(createMetricsProxy(), contentClient, theGraphClient, offChainManager)
    )

    // Functionality for Explore use case
    this.app.use('/explore', initializeExploreRoutes(createMetricsProxy(), env.getBean(Bean.DAO), contentClient))
  }

  async start(): Promise<void> {
    this.httpServer = this.app.listen(this.port, () => {
      console.info(`==> Lambdas Server listening on port ${this.port}.`)
    })
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.info(`==> Lambdas Server stopped.`)
      })
    }
  }
}

const METHODS_TO_PROXY = ['get', 'post', 'put', 'delete', 'patch']
/** Create an ES6 proxy that will inject the appropriate handlers to record metrics */
function createMetricsProxy(): Router {
  return new Proxy<Router>(express.Router(), {
    get: (target: Router, p: string | symbol, receiver: any) => {
      if (typeof p === 'string' && METHODS_TO_PROXY.includes(p)) {
        return (route, handler) => {
          const handlers = [...Metrics.requestHandlers(), handler]
          return target[p](route, handlers)
        }
      } else {
        return Reflect.get(target, p, receiver)
      }
    }
  })
}
