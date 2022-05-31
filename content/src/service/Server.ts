import { CONTENT_API } from '@dcl/catalyst-api-specs'
import { initializeMetricsServer } from './MetricsServer'
import { IBaseComponent, ILoggerComponent } from '@well-known-components/interfaces'
import compression from 'compression'
import cors from 'cors'
import { once } from 'events'
import express, { NextFunction, RequestHandler } from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import http from 'http'
import log4js from 'log4js'
import morgan from 'morgan'
import multer from 'multer'
import path from 'path'
import { Controller } from '../controller/Controller'
import { EnvironmentConfig } from '../Environment'
import { AppComponents } from '../types'

export class Server implements IBaseComponent {
  private LOGGER: ILoggerComponent.ILogger
  private static readonly UPLOADS_DIRECTORY = 'uploads/'

  protected metricsServer: ReturnType<typeof initializeMetricsServer> | undefined
  private port: number
  private app: express.Express
  private httpServer: http.Server

  constructor(protected components: Pick<AppComponents, 'controller' | 'metrics' | 'env' | 'logs' | 'fs'>) {
    const { env, controller, metrics, logs } = components
    this.LOGGER = logs.getLogger('HttpServer')
    // Set logger
    log4js.configure({
      appenders: { console: { type: 'console', layout: { type: 'basic' } } },
      categories: {
        default: { appenders: ['console'], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) }
      }
    })

    this.port = env.getConfig(EnvironmentConfig.SERVER_PORT)

    this.app = express()

    if (this.shouldInitializeMetricsServer()) {
      this.metricsServer = initializeMetricsServer(this.app, metrics as any)
    }

    const corsOptions: cors.CorsOptions = {
      origin: true,
      methods: 'GET,HEAD,POST,PUT,DELETE,CONNECT,TRACE,PATCH',
      allowedHeaders: ['Cache-Control', 'Content-Type', 'Origin', 'Accept', 'User-Agent', 'X-Upload-Origin'],
      credentials: true,
      maxAge: 86400
    }

    const upload = multer({ dest: Server.UPLOADS_DIRECTORY, preservePath: true })

    if (env.getConfig(EnvironmentConfig.USE_COMPRESSION_MIDDLEWARE)) {
      this.app.use(compression({ filter: (_req, _res) => true }))
    }

    this.app.use(cors(corsOptions))
    this.app.use(express.json())
    if (env.getConfig(EnvironmentConfig.LOG_REQUESTS)) {
      this.app.use(morgan('combined'))
    }

    if (env.getConfig(EnvironmentConfig.VALIDATE_API) || process.env.CI === 'true') {
      this.app.use(
        OpenApiValidator.middleware({
          apiSpec: CONTENT_API,
          validateResponses: true,
          validateRequests: false,
          ignoreUndocumented: true,
          ignorePaths: /\/entities/
        })
      )
    }

    this.registerRoute('/entities/:type', controller, controller.getEntities)
    this.registerRoute('/entities/active/collections/:collectionUrn', controller, controller.filterByUrn)
    this.registerRoute('/entities', controller, controller.createEntity, HttpMethod.POST, upload.any()) // TODO: Deprecate
    this.registerRoute('/entities/active', controller, controller.getActiveEntities, HttpMethod.POST)
    this.registerRoute('/contents/:hashId', controller, controller.headContent, HttpMethod.HEAD) // Register before GET
    this.registerRoute('/contents/:hashId', controller, controller.getContent, HttpMethod.GET)
    this.registerRoute('/available-content', controller, controller.getAvailableContent)
    this.registerRoute('/audit/:type/:entityId', controller, controller.getAudit)
    this.registerRoute('/deployments', controller, controller.getDeployments)
    this.registerRoute('/contents/:hashId/active-entities', controller, controller.getActiveDeploymentsByContentHash)
    this.registerRoute('/status', controller, controller.getStatus)
    this.registerRoute('/failed-deployments', controller, controller.getFailedDeployments)
    this.registerRoute('/challenge', controller, controller.getChallenge)
    this.registerRoute('/pointer-changes', controller, controller.getPointerChanges)
    this.registerRoute('/snapshot/:type', controller, controller.getSnapshot) // TODO: Deprecate
    this.registerRoute('/snapshot', controller, controller.getAllSnapshots)

    if (env.getConfig(EnvironmentConfig.VALIDATE_API) || process.env.CI === 'true') {
      this.app.use((err, req, res, next) => {
        console.error(err)
        res.status(err.status || 500).json({
          message: err.message,
          errors: err.errors
        })
        next()
      })
    }
  }

  /*
   * Extending implementations should want to change the logic when to initialize metrics server (e.g. tests)
   */
  shouldInitializeMetricsServer(): boolean {
    return process.env.CI !== 'true' && process.env.RUNNING_TESTS !== 'true'
  }

  private registerRoute(
    route: string,
    controller: Controller,
    action: (this: Controller, req: express.Request, res: express.Response) => Promise<void>,
    method: HttpMethod = HttpMethod.GET,
    extraHandler?: RequestHandler
  ) {
    const handlers: RequestHandler[] = [
      async (req: express.Request, res: express.Response, next: NextFunction) => {
        try {
          await action.call(controller, req, res)
        } catch (err: any) {
          next(err)
        }
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
    this.httpServer = this.app.listen(this.port)

    await once(this.httpServer, 'listening')

    this.LOGGER.info(`Content Server listening on port ${this.port}.`)

    if (this.metricsServer) {
      await this.metricsServer.start()
    }
  }

  async stop(): Promise<void> {
    if (this.httpServer) {
      await this.closeHTTPServer()
    }
    if (this.metricsServer) {
      await this.metricsServer.stop()
    }

    this.LOGGER.info(`Content Server stopped.`)
  }

  async purgeUploadsDirectory(): Promise<void> {
    this.LOGGER.info("Cleaning up the Server's uploads directory...")
    try {
      const directory = Server.UPLOADS_DIRECTORY
      const files = await this.components.fs.readdir(directory)
      files.forEach(async (file) => {
        await this.components.fs.unlink(path.join(directory, file))
      })
      this.LOGGER.info('Cleaned up!')
    } catch (e) {
      this.LOGGER.error('There was an error while cleaning up the upload directory: ', e)
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
