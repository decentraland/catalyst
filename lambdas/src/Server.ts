import { LAMBDAS_API } from '@dcl/catalyst-api-specs'
import { createFetchComponent } from '@well-known-components/fetch-component'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import http from 'http'
import morgan from 'morgan'
import { Bean, Environment, EnvironmentConfig } from './Environment'
import { initializeMetricsServer } from './MetricsServer'
import { OffChainWearablesManager } from './apis/collections/off-chain/OffChainWearablesManager'
import { initializeCollectionsRoutes } from './apis/collections/routes'
import { initializeContentV2Routes } from './apis/content-v2/routes'
import { initializeCryptoRoutes } from './apis/crypto/routes'
import { initializeImagesRoutes } from './apis/images/routes'
import { EmotesOwnership } from './apis/profiles/EmotesOwnership'
import { EnsOwnership } from './apis/profiles/EnsOwnership'
import { WearablesOwnership } from './apis/profiles/WearablesOwnership'
import { initializeIndividualProfileRoutes, initializeProfilesRoutes } from './apis/profiles/routes'
import statusRouter from './apis/status/routes'
import { initializeThirdPartyIntegrationsRoutes } from './apis/third-party/routes'
import { metricsComponent } from './metrics'
import { TheGraphClient } from './ports/the-graph/types'
import { ThirdPartyAssetFetcher, createThirdPartyAssetFetcher } from './ports/third-party/third-party-fetcher'
import { SmartContentClient } from './utils/SmartContentClient'
import { SmartContentServerFetcher } from './utils/SmartContentServerFetcher'

export class Server {
  private port: number
  private app: express.Express
  private httpServer: http.Server
  private metricsPort: ReturnType<typeof initializeMetricsServer>

  constructor(env: Environment) {
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

    const ensOwnership: EnsOwnership = env.getBean(Bean.ENS_OWNERSHIP)
    const wearablesOwnership: WearablesOwnership = env.getBean(Bean.WEARABLES_OWNERSHIP)
    const emotesOwnership: EmotesOwnership = env.getBean(Bean.EMOTES_OWNERSHIP)
    const fetcher: SmartContentServerFetcher = env.getBean(Bean.SMART_CONTENT_SERVER_FETCHER)
    const contentClient: SmartContentClient = env.getBean(Bean.SMART_CONTENT_SERVER_CLIENT)
    const theGraphClient: TheGraphClient = env.getBean(Bean.THE_GRAPH_CLIENT)
    const offChainManager: OffChainWearablesManager = env.getBean(Bean.OFF_CHAIN_MANAGER)
    const thirdPartyFetcher: ThirdPartyAssetFetcher = createThirdPartyAssetFetcher(createFetchComponent())

    const profilesCacheTTL: number = env.getConfig(EnvironmentConfig.PROFILES_CACHE_TTL)

    // Base endpoints
    this.app.use('/', statusRouter(env))

    // Backwards compatibility for older Content API
    this.app.use('/contentv2', initializeContentV2Routes(express.Router(), fetcher))

    // TODO: Remove the route /profile/{id} as it has been migrated to /profiles/{id}
    // Profile API implementation
    this.app.use(
      '/profile',
      initializeIndividualProfileRoutes(
        express.Router(),
        theGraphClient,
        contentClient,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher,
        profilesCacheTTL
      )
    )
    this.app.use(
      '/profiles',
      initializeProfilesRoutes(
        express.Router(),
        theGraphClient,
        contentClient,
        ensOwnership,
        wearablesOwnership,
        emotesOwnership,
        thirdPartyFetcher,
        profilesCacheTTL
      )
    )

    // DCL-Crypto API implementation
    this.app.use('/crypto', initializeCryptoRoutes(express.Router(), env.getBean(Bean.ETHEREUM_PROVIDER)))

    // Images API for resizing contents
    this.app.use(
      '/images',
      initializeImagesRoutes(express.Router(), fetcher, env.getConfig(EnvironmentConfig.LAMBDAS_STORAGE_LOCATION))
    )

    // DAO Collections access API
    this.app.use(
      '/collections',
      initializeCollectionsRoutes(express.Router(), contentClient, theGraphClient, offChainManager)
    )

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
