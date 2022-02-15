import chalk from 'chalk'
import columnify from 'columnify'
import fs from 'fs'
import path from 'path'
import jestConfig from './jest.config'
import { ApiCoverage } from './jest.globalSetup'

const globalTeardown = async (): Promise<void> => {
  if (process.env.API_COVERAGE === 'true') {
    await printApiCoverage()
  }

  await globalThis.__POSTGRES_CONTAINER__?.stop()
}

type ApiCoverageRow = {
  route: string,
  method: string,
  statuses: string[]
}

async function printApiCoverage() {
  const apiCoveragePath = path.join(__dirname, jestConfig.coverageDirectory, 'api-coverage.json')
  const coverage: ApiCoverage = JSON.parse(((await fs.promises.readFile(apiCoveragePath)).toString()))

const tableRows: ApiCoverageRow[] = []
  for (const route in coverage) {
    for (const method in coverage[route]) {
      const statuses = Object.keys(coverage[route][method])
      const covered = statuses.every(status => coverage[route][method][status])

      const coloredRoute = covered ? chalk.green(route) : chalk.red(route)
      const coloredMethod = covered ? chalk.green(method) : chalk.red(method)
      const coloredStatus = statuses.map(
        (status) => coverage[route][method][status] ? chalk.green(status) : chalk.red(status)
      )

      const row: ApiCoverageRow = {
        route: coloredRoute,
        method: coloredMethod,
        statuses: coloredStatus,
      }
      tableRows.push(row)
    }
  }

  const sortedData = tableRows.sort((obj1, obj2) => obj1.route.localeCompare(obj2.route))
  const filteredData = sortedData.filter(obj => obj.statuses.length)

  console.info('\nAPI Coverage:')
  console.info(columnify(filteredData, { columnSplitter: ' | ' }))
}

export default globalTeardown
