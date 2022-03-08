const chalk = require('chalk')
const columnify = require('columnify')
const fs = require('fs')
const path = require('path')
const jestConfig = require('./jest.config')

function printApiCoverage() {
  let coverage = {}
  const apiCoveragePath = path.join(__dirname, 'api-coverage', 'api-coverage.json')
  if (process.env.CI === 'true') {
    // Merge partial results from parallel processing
    fs.readdirSync(path.join(__dirname, 'api-coverage')).forEach(file => {
      if (file.startsWith('api-coverage-')) {
        const partialCoverage = JSON.parse(((fs.readFileSync(path.resolve(__dirname, 'api-coverage', file))).toString()))
        for (const apiPath in partialCoverage) {
          coverage[apiPath] = coverage[apiPath] || {}
          for (const method in partialCoverage[apiPath]) {
            coverage[apiPath][method] = coverage[apiPath][method] || {}
            for (const status in partialCoverage[apiPath][method]) {
              coverage[apiPath][method][status] = coverage[apiPath][method][status] || partialCoverage[apiPath][method][status]
            }
          }
        }
      }
    })
  } else {
    coverage = JSON.parse(((fs.readFileSync(apiCoveragePath)).toString()))
  }

  const tableRows = []
  for (const route in coverage) {
    for (const method in coverage[route]) {
      const statuses = Object.keys(coverage[route][method])
      const covered = statuses.every(status => coverage[route][method][status])

      const coloredRoute = covered ? chalk.green(route) : chalk.red(route)
      const coloredMethod = covered ? chalk.green(method) : chalk.red(method)
      const coloredStatus = statuses.map(
        (status) => coverage[route][method][status] ? chalk.green(status) : chalk.red(status)
      )

      const row = {
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

module.exports = printApiCoverage
