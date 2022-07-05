import { LAMBDAS_API } from '@dcl/catalyst-api-specs'
import { initializeMetricsServer } from './MetricsServer'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import http from 'http'
import log4js from 'log4js'
import morgan from 'morgan'
import { OffChainWearablesManager } from './apis/collections/off-chain/OffChainWearablesManager'
import { initializeCollectionsRoutes } from './apis/collections/routes'
import { initializeContractRoutes } from './apis/contracts/routes'
import { initializeCryptoRoutes } from './apis/crypto/routes'
import { initializeExploreRoutes } from './apis/explore/routes'
import { initializeImagesRoutes } from './apis/images/routes'
import { initializeThirdPartyIntegrationsRoutes } from './apis/third-party/routes'
import { Bean, Environment, EnvironmentConfig } from './Environment'
import { metricsComponent } from './metrics'
import { SmartContentClient } from './utils/SmartContentClient'
import { SmartContentServerFetcher } from './utils/SmartContentServerFetcher'
import { TheGraphClient } from './utils/TheGraphClient'
import { setupRouter } from './controllers/routes'

export class Server {
  private port: number
  private app: express.Express
  private httpServer: http.Server
  private metricsPort: ReturnType<typeof initializeMetricsServer>

  constructor(env: Environment) {
    // Set logger
    log4js.configure({
      appenders: { console: { type: 'console', layout: { type: 'basic' } } },
      categories: { default: { appenders: ['console'], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
    })

    this.port = env.getConfig(EnvironmentConfig.SERVER_PORT)

    this.app = express()

    if (env.getConfig(EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE)) {
      this.app.use(compression({ filter: () => true }))
    }
    if (env.getConfig(EnvironmentConfig.VALIDATE_API)) {
      this.app.use(
        OpenApiValidator.middleware({
          apiSpec: LAMBDAS_API,
          validateResponses: process.env.CI == 'true',
          validateRequests: true
        })
      )
    }

    const corsOptions: cors.CorsOptions = {
      origin: true,
      methods: 'GET,HEAD,POST,PUT,DELETE,CONNECT,TRACE,PATCH',
      allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'User-Agent'],
      credentials: true
    }

    this.app.use(cors(corsOptions))
    this.app.use(express.json())
    if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
      this.app.use(morgan('combined'))
    }

    this.metricsPort = initializeMetricsServer(this.app, metricsComponent)

    const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
    const contentClient: SmartContentClient = env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT)
    const theGraphClient: TheGraphClient = env.getBean(Bean.THE_GRAPH_CLIENT)
    const offChainManager: OffChainWearablesManager = env.getBean(Bean.OFF_CHAIN_MANAGER)

    // Setup routes
    this.app.use(setupRouter(env))

    // Images API for resizing contents
    this.app.use(
      '/images',
      initializeImagesRoutes(express.Router(), fetcher, env.getConfig(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION))
    )

    // DAO cached access API
    this.app.use('/contracts', initializeContractRoutes(express.Router(), env.getBean(Bean.DAO)))

    // DAO Collections access API
    this.app.use(
      '/collections',
      initializeCollectionsRoutes(express.Router(), contentClient, theGraphClient, offChainManager)
    )

    // Functionality for Explore use case
    this.app.use('/explore', initializeExploreRoutes(express.Router(), env.getBean(Bean.DAO), contentClient))

    this.app.use('/third-party-integrations', initializeThirdPartyIntegrationsRoutes(theGraphClient, express.Router()))
  }

  async start(): Promise<void> {
    this.httpServer = this.app.listen(this.port, () => {
      console.info(`==> Lambdas Server listening on port ${this.port}.`)
    })
    await this.metricsPort.start()
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      this.httpServer.close(() => {
        console.info(`==> Lambdas Server stopped.`)
      })
    }
    if (this.metricsPort) {
      await this.metricsPort.stop()
    }
  }
}
