import { LAMBDAS_API } from '@dcl/catalyst-api-specs'
import { Lifecycle } from '@well-known-components/interfaces'
import compression from 'compression'
import cors from 'cors'
import express from 'express'
import * as OpenApiValidator from 'express-openapi-validator'
import log4js from 'log4js'
import morgan from 'morgan'
import { setupRouter } from './controllers/routes'
import { EnvironmentConfig } from './Environment'
import { metricsComponent } from './metrics'
import { initializeMetricsServer } from './MetricsServer'
import { AppComponents, TestComponents } from './types'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents | TestComponents>) {
  const { components, startComponents } = program
  // const globalContext: GlobalContext = { components }
  const env = components.env

  // Set logger
  log4js.configure({
    appenders: { console: { type: 'console', layout: { type: 'basic' } } },
    categories: { default: { appenders: ['console'], level: env.getConfig<string>(EnvironmentConfig.LOG_LEVEL) } }
  })

  this.port = await components.config.getString('HTTP_SERVER_PORT')

  this.app = express()

  if (await components.config.getString('USE_COMPRESSION_MIDDLEWARE')) {
    this.app.use(compression({ filter: () => true }))
  }

  if (await components.config.getString('VALIDATE_API')) {
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

  if (await components.config.getString('LOG_REQUESTS')) {
    this.app.use(morgan('combined'))
  }

  this.metricsPort = initializeMetricsServer(this.app, metricsComponent)

  // Setup routes
  this.app.use(setupRouter(env))

  // Start the server
  this.app.listen(this.port, () => {
    console.info(`==> Lambdas Server listening on port ${this.port}.`)
  })
  await this.metricsPort.start()

  // wire the HTTP router (make it automatic? TBD)
  // const router = setupRouter()
  // register routes middleware
  // components.server.use(router.middleware())
  // register not implemented/method not allowed/cors responses middleware
  // components.server.use(router.allowedMethods())
  // set the context to be passed to the handlers
  // components.server.setContext(globalContext)
  // start ports: db, listeners, synchronizations, etc
  await startComponents()
}
