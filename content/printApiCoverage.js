const { CONTENT_API } = require('@dcl/catalyst-api-specs')
const chalk = require('chalk')
const columnify = require('columnify')
const fs = require('fs')
const path = require('path')
const jestConfig = require('./jest.config')

function printApiCoverage() {
  const entries = new Set()

  // Combine API coverage results files with parallel processing in the CI
  fs.readdirSync(path.join(__dirname, 'api-coverage')).forEach(file => {
    if (file.startsWith('api-coverage') && file.endsWith('.csv')) {
      const content = fs.readFileSync(path.resolve(__dirname, 'api-coverage', file))
      for (const entry of content.toString().split("\n")) {
        entries.add(entry)
      }
    }
  })

  const coverage = Array.from(entries).map((l) => {
    const [ path, method, status ] = l.split(",")
    return { path, method, status }
  })

  const tableRows = []
  let someMissing = false
  for (const apiPath in CONTENT_API.paths) {
    for (const method in CONTENT_API.paths[apiPath]) {
      for (const status in CONTENT_API.paths[apiPath][method].responses) {
        const replacedPath = apiPath
              .replace(/\{.*?\}/, '[^\\/]*')
              .replace(/\{.*?\}/, '[^\\/]*') // Replace a second time for URLs with two query params
        const testablePath = new RegExp(`^${replacedPath}$`)
        let covered = false
        for (const tested of coverage) {
          if (testablePath.test(tested.path) && tested.method === method.toUpperCase() && tested.status === status) {
            covered = true
            break
          }
        }

        if (!covered) {
          someMissing = true
        }

        const color = covered ? chalk.green : chalk.red
        const row = {
          route: color(`${method.toUpperCase()} ${apiPath}`),
          statuses: color(status),
          status: covered ? 'COVERED' : 'MISSING'
        }
        tableRows.push(row)
      }
    }
  }

  console.info('API Coverage:')
  console.info(columnify(tableRows, { columnSplitter: ' | ' }))

  // Throw an error if some endpoint/method is not tested
  if (someMissing) {
    throw new Error('There are some endpoints that are not fully tested')
  }
}

module.exports = printApiCoverage
