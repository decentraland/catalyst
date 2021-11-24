import { initializeMetricsServer } from '@catalyst/commons'
import { CONTENT_API } from '@dcl/catalyst-api-specs'
import compression from 'compression'
import cors from 'cors'
import { once } from 'events'
import express, { NextFunction, RequestHandler } from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import fs from 'fs'
import http from 'http'
import log4js from 'log4js'
import morgan from 'morgan'
import multer from 'multer'
import path from 'path'
import { Controller } from './controller/Controller'
import { Bean, Environment, EnvironmentConfig } from './Environment'
import { metricsComponent } from './metrics'
import { MigrationManager } from './migrations/MigrationManager'
import { Repository } from './repository/Repository'
import { GarbageCollectionManager } from './service/garbage-collection/GarbageCollectionManager'
import { MetaverseContentService } from './service/Service'
import { SnapshotManager } from './service/snapshots/SnapshotManager'
import { SynchronizationManager } from './service/synchronization/SynchronizationManager'

export class Server {
  private static readonly LOGGER = log4js.getLogger('Server')
  private static readonly UPLOADS_DIRECTORY = 'uploads/'

  protected metricsServer: ReturnType<typeof initializeMetricsServer> | undefined
  private port: number
  private app: express.Express
  private httpServer: http.Server
  private readonly synchronizationManager: SynchronizationManager
  private readonly garbageCollectionManager: GarbageCollectionManager
  private readonly snapshotManager: SnapshotManager
  private readonly migrationManager: MigrationManager
  private readonly service: MetaverseContentService
  private readonly repository: Repository

  constructor(env: Environment) {
    // Set logger
    log4js.configure({
      appenders: { console: { type: 'console', layout: { type: 'basic' } } },
      categories: { default: { appenders: ['console'], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
    })

    env.logConfigValues()

    this.port = env.getConfig(EnvironmentConfig.SERVER_PORT)

    this.app = express()

    if (this.shouldInitializeMetricsServer()) {
      this.metricsServer = initializeMetricsServer(this.app, metricsComponent)
    }

    const corsOptions: cors.CorsOptions = {
      origin: true,
      methods: 'GET,HEAD,POST,PUT,DELETE,CONNECT,TRACE,PATCH',
      allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'User-Agent', 'X-Upload-Origin'],
      credentials: true,
      maxAge: 86400
    }

    const upload = multer({ dest: Server.UPLOADS_DIRECTORY, preservePath: true })
    const controller: Controller = env.getBean(Bean.CONTROLLER)
    this.garbageCollectionManager = env.getBean(Bean.GARBAGE_COLLECTION_MANAGER)
    this.snapshotManager = env.getBean(Bean.SNAPSHOT_MANAGER)
    this.service = env.getBean(Bean.SERVICE)
    this.migrationManager = env.getBean(Bean.MIGRATION_MANAGER)
    this.repository = env.getBean(Bean.REPOSITORY)
    this.synchronizationManager = env.getBean(Bean.SYNCHRONIZATION_MANAGER)

    if (env.getConfig(EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE)) {
      this.app.use(compression({ filter: (_req, _res) => true }))
    }

    this.app.use(cors(corsOptions))
    this.app.use(express.json())
    if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
      this.app.use(morgan('combined'))
    }
    if (env.getConfig(EnvironmentConfig.VALIDATE_API)) {
      this.app.use(
        OpenApiValidator.middleware({
          apiSpec: CONTENT_API,
          validateResponses: process.env.CI == 'true',
          validateRequests: true
        })
      )
    }

    this.registerRoute('/entities/:type', controller, controller.getEntities)
    this.registerRoute('/entities', controller, controller.createEntity, HttpMethod.POST, upload.any())
    this.registerRoute('/contents/:hashId', controller, controller.getContent)
    this.registerRoute('/available-content', controller, controller.getAvailableContent)
    this.registerRoute('/audit/:type/:entityId', controller, controller.getAudit)
    this.registerRoute('/deployments', controller, controller.getDeployments)
    this.registerRoute('/contents/:hashId/active-entities', controller, controller.getActiveDeploymentsByContentHash)
    this.registerRoute('/status', controller, controller.getStatus)
    this.registerRoute('/denylist', controller, controller.getAllDenylistTargets)
    this.registerRoute('/denylist/:type/:id', controller, controller.addToDenylist, HttpMethod.PUT)
    this.registerRoute('/denylist/:type/:id', controller, controller.removeFromDenylist, HttpMethod.DELETE)
    this.registerRoute('/denylist/:type/:id', controller, controller.isTargetDenylisted, HttpMethod.HEAD)
    this.registerRoute('/failedDeployments', controller, controller.getFailedDeployments) // TODO: Deprecate
    this.registerRoute('/failed-deployments', controller, controller.getFailedDeployments)
    this.registerRoute('/challenge', controller, controller.getChallenge)
    this.registerRoute('/pointerChanges', controller, controller.getPointerChanges) // TODO: Deprecate
    this.registerRoute('/pointer-changes', controller, controller.getPointerChanges)
    this.registerRoute('/snapshot/:type', controller, controller.getSnapshot)
    this.registerRoute('/snapshot', controller, controller.getAllSnapshots)

    if (env.getConfig(EnvironmentConfig.ALLOW_LEGACY_ENTITIES)) {
      this.registerRoute('/legacy-entities', controller, controller.createLegacyEntity, HttpMethod.POST, upload.any())
    }
  }

  /*
   * Extending implementations should want to change the logic when to initialize metrics server (e.g. tests)
   */
  shouldInitializeMetricsServer(): boolean {
    return true
  }

  private registerRoute(
    route: string,
    controller: Controller,
    action: (this: Controller, req: express.Request, res: express.Response) => void,
    method: HttpMethod = HttpMethod.GET,
    extraHandler?: RequestHandler
  ) {
    const handlers: RequestHandler[] = [
      (req: express.Request, res: express.Response, next: NextFunction) => {
        action.call(controller, req, res).catch(next)
      }
    ]
    if (extraHandler) {
      handlers.unshift(extraHandler)
    }
    switch (method) {
      case HttpMethod.GET:
        this.app.get(route, handlers)
        break
      case HttpMethod.POST:
        this.app.post(route, handlers)
        break
      case HttpMethod.PUT:
        this.app.put(route, handlers)
        break
      case HttpMethod.DELETE:
        this.app.delete(route, handlers)
        break
      case HttpMethod.HEAD:
        this.app.head(route, handlers)
        break
    }
  }

  async start(): Promise<void> {
    this.purgeUploadsDirectory()
    await this.migrationManager.run()
    await this.validateHistory()
    await this.service.start()
    this.httpServer = this.app.listen(this.port)
    await once(this.httpServer, 'listening')
    Server.LOGGER.info(`Content Server listening on port ${this.port}.`)
    if (this.metricsServer) {
      await this.metricsServer.start()
    }
    await this.snapshotManager.startSnapshotsPerEntity()
    setInterval(async () => {
      await this.snapshotManager.calculateFullSnapshots()
    }, this.snapshotManager.getSnapshotsFrequencyInMilliseconds())
    await this.synchronizationManager.start()
    await this.garbageCollectionManager.start()
  }

  async stop(options: { endDbConnection: boolean } = { endDbConnection: true }): Promise<void> {
    await Promise.all([this.garbageCollectionManager.stop(), this.synchronizationManager.stop()])
    if (this.httpServer) {
      await this.closeHTTPServer()
    }
    if (this.metricsServer) {
      await this.metricsServer.stop()
    }
    Server.LOGGER.info(`Content Server stopped.`)
    if (options.endDbConnection) {
      await this.repository.shutdown()
    }
  }

  private async validateHistory(): Promise<void> {
    // Validate last history entry is before Date.now()
    const lastDeployments = await this.service.getDeployments({ offset: 0, limit: 1 })
    if (lastDeployments.deployments.length > 0) {
      const currentTimestamp = Date.now()
      if (lastDeployments.deployments[0].auditInfo.localTimestamp > currentTimestamp) {
        console.error(
          'Last stored timestamp for this server is newer than current time. The server can not be started.'
        )
        process.exit(1)
      }
    }
  }

  private purgeUploadsDirectory(): void {
    Server.LOGGER.info("Cleaning up the Server's uploads directory...")
    try {
      const directory = Server.UPLOADS_DIRECTORY
      fs.readdirSync(directory).forEach((file) => {
        fs.unlinkSync(path.join(directory, file))
      })
      Server.LOGGER.info('Cleaned up!')
    } catch (e) {
      Server.LOGGER.error('There was an error while cleaning up the upload directory: ', e)
    }
  }

  private closeHTTPServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer.close((error) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }
}

enum HttpMethod {
  GET,
  POST,
  PUT,
  DELETE,
  HEAD
}
