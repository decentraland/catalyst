import * as logger from '@well-known-components/logger'
import fs from 'fs'
import path from 'path'
import { ApiCoverage } from './jest.globalSetup'
import { Server } from './src/service/Server'
import { isCI } from './test/integration/E2ETestUtils'

// Setup API Coverage Report process
if (process.env.API_COVERAGE === 'true' || isCI()) {
  setupApiCoverage()
}

// DISABLE LOGS
if (process.env.LOG_LEVEL === 'off') {
  beforeAll(() => {
    // Mock logger implementation
    const createLogComponent = logger.createConsoleLogComponent
    jest.spyOn(logger, 'createLogComponent').mockImplementation(() => {
      const logComponentMock = createLogComponent()
      const loggerMock = logComponentMock.getLogger('__test__')
      loggerMock.debug = () => {}
      loggerMock.error = () => {}
      loggerMock.info = () => {}
      loggerMock.log = () => {}
      loggerMock.warn = () => {}
      logComponentMock.getLogger = jest.fn(() => loggerMock)
      return logComponentMock
    })
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
}

async function setupApiCoverage() {
  const coverageDir = path.join(__dirname, 'api-coverage')
  const coverageFilePath = path.join(coverageDir, 'api-coverage.json')
  const coverage: ApiCoverage = JSON.parse(fs.readFileSync(coverageFilePath).toString())

  // Hacky way of adding a middleware to keep track of the requests without changing the Server file
  const registerRoute = Server.prototype['registerRoute']
  Server.prototype['registerRoute'] = async function (this: Server, ...args) {
    if (!this['_API_COVERED_']) {
      this['_API_COVERED_'] = true
      this['app'].use((req, res, next) => {
        res.on('finish', () => {
          for (const apiPath in coverage) {
            // Convert OpenAPI paths to a format that is testable against the server API
            // Eg: /contents/{hashId}/active-entities -> /contents/[^\\/]*/active-entities
            // This allows testing against any resource path like /contents/Qws4djflKjf9dJsa/active-entities
            const replacedPath = apiPath
              .replace(/\{.*?\}/, '[^\\/]*')
              .replace(/\{.*?\}/, '[^\\/]*') // Replace a second time for URLs with two query params
            const testablePath = `^${replacedPath}$`
            const matchesPath = new RegExp(testablePath).test(req.path)

            // Mark the path as tested if it is in the OpenAPI spec and it matches a tested path
            const wasTested = coverage[apiPath]?.[req.method]?.[res.statusCode]
            if (matchesPath && wasTested !== undefined) {
              coverage[apiPath][req.method][res.statusCode] = true
            }
          }
        })
        next()
      })
    }
    await registerRoute.apply(this, args)
  }

  // Write API Coverage results to disk in order to let the Reporter read it
  // Jest tests run in a sandbox environment and it is not possible to pass data programatically
  afterAll(async () => {
    await fs.promises.writeFile(coverageFilePath, JSON.stringify(coverage))
  })
}
