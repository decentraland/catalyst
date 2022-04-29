import { CONTENT_API } from '@dcl/catalyst-api-specs'
import fs from 'fs'
import path from 'path'
import * as tsNode from 'ts-node'
import { isCI } from './test/integration/E2ETestUtils'

const globalSetup = async (): Promise<void> => {
  if (!isCI()) {
    tsNode.register({ transpileOnly: true })
    const { initializePostgresContainer } = await import('./test/postgres-test-container')
    await initializePostgresContainer('postgres_test')
  }

  // Initialize API Coverage Report
  if (process.env.API_COVERAGE === 'true' || isCI()) {
    await initializeApiCoverage()
  }
}

export type ApiCoverage = {
  [path: string]: {
    [method: string]: {
      [status: string]: boolean
    }
  }
}

async function initializeApiCoverage() {
  // Define an object to keep track of the API coverage
  const coverage: ApiCoverage = {}
  // Fill the object with the definitions in the OpenAPI specs with default `false` values
  // Eg: { "/entities": { "POST": { "200": false, "400": false } }, "/status": { "GET": { "200": false } } }
  for (const apiPath in CONTENT_API.paths) {
    coverage[apiPath] = {}
    for (const method in CONTENT_API.paths[apiPath]) {
      const uppercaseMethod = method.toUpperCase()
      coverage[apiPath][uppercaseMethod] = {}
      for (const status in CONTENT_API.paths[apiPath][method].responses) {
        coverage[apiPath][uppercaseMethod][status] = false
      }
    }
  }

  // Write object to disk because Jest runs tests in isolated environments
  const coverageDir = path.join(__dirname, 'api-coverage')
  try {
    await fs.promises.access(coverageDir)
  } catch (err) {
    await fs.promises.mkdir(coverageDir)
  }
  await fs.promises.writeFile(
    path.join(coverageDir, 'api-coverage.json'), JSON.stringify(coverage))
}

export default globalSetup
