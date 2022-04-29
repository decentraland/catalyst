import { CONTENT_API } from '@dcl/catalyst-api-specs'
import fs from 'fs'
import path from 'path'
import { isCI } from './test/integration/E2ETestUtils'


// const execute = promisify(exec)
// const postgresContainerName = 'postgres_test'

// const deletePreviousPsql = async (): Promise<void> => {
//   const { stderr, stdout } = await execute(`docker rm -f ${postgresContainerName}`)
//   if (stderr && !stderr.includes(`Error: No such container: ${postgresContainerName}`)) {
//     console.log('Failed to delete the existing postgres container')
//   } else if (stdout) {
//     console.log('Deleted the previous container')
//   }
// }

const globalSetup = async (): Promise<void> => {
  if (!isCI()) {

    // const { GenericContainer } = await import('testcontainers')
    const { LogWaitStrategy } = await import('testcontainers/dist/wait-strategy')
    console.log('everything imported')
    // delete postgres_test container if it exists
    // await deletePreviousPsql()

    // // start postgres container and wait for it to be ready
    // const container = await new GenericContainer('postgres:12')
    //   .withName(postgresContainerName)
    //   .withEnv('POSTGRES_PASSWORD', DEFAULT_DATABASE_CONFIG.password)
    //   .withEnv('POSTGRES_USER', DEFAULT_DATABASE_CONFIG.user)
    //   .withExposedPorts(E2ETestEnvironment.POSTGRES_PORT)
    //   .withWaitStrategy(new PostgresWaitStrategy())
    //   .start()

    // globalThis.__POSTGRES_CONTAINER__ = container
    // // get mapped port to be used for testing purposes
    // process.env.MAPPED_POSTGRES_PORT = container.getMappedPort(E2ETestEnvironment.POSTGRES_PORT).toString()
    console.log('im not CI!')
  }

  // Initialize API Coverage Report
  if (process.env.API_COVERAGE === 'true' || isCI()) {
    await initializeApiCoverage()
  }
}

/** During startup, the db is restarted, so we need to wait for the log message twice */
// class PostgresWaitStrategy extends LogWaitStrategy {
//   private static LOG = 'database system is ready to accept connections'
//   private DOCKERODE = new Dockerode()
//   constructor() {
//     super(PostgresWaitStrategy.LOG)
//   }

//   public async waitUntilReady(container: Dockerode.Container): Promise<void> {
//     let counter = 0
//     return new Promise(async (resolve, reject) => {
//       const stream = await container.logs({ stdout: true, stderr: true, follow: true })
//       const demuxedStream = new PassThrough({ autoDestroy: true, encoding: "utf-8" });
//       this.DOCKERODE.modem.demuxStream(stream, demuxedStream, demuxedStream);
//       stream.on("end", () => demuxedStream.end());
//       demuxedStream
//         .on('data', (line) => {
//           if (line.toString().includes(PostgresWaitStrategy.LOG)) {
//             counter++
//             if (counter === 2) {
//               resolve()
//             }
//           }
//         })
//         .on('err', (line) => {
//           if (line.toString().includes(PostgresWaitStrategy.LOG)) {
//             counter++
//             if (counter === 2) {
//               resolve()
//             }
//           }
//         })
//         .on('end', () => {
//           reject()
//         })
//     })
//   }
// }

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
