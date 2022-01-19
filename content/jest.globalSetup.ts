import { exec } from 'child_process'
import { GenericContainer } from 'testcontainers'
import { Container } from 'testcontainers/dist/container'
import { LogWaitStrategy } from 'testcontainers/dist/wait-strategy'
import { promisify } from 'util'
import { DEFAULT_DATABASE_CONFIG } from './src/Environment'
import { E2ETestEnvironment } from './test/integration/E2ETestEnvironment'
import { isCI } from './test/integration/E2ETestUtils'

const execute = promisify(exec)
const postgresContainerName = 'postgres_test'

const deletePreviousPsql = async (): Promise<void> => {
  const { stderr, stdout } = await execute(`docker rm -f ${postgresContainerName}`)
  if (stderr && !stderr.includes(`Error: No such container: ${postgresContainerName}`)) {
    console.log('Failed to delete the existing postgres container')
  } else if (stdout) {
    console.log('Deleted the previous container')
  }
}

const globalSetup = async (): Promise<void> => {
  if (!isCI()) {
    // delete postgres_test container if it exists
    await deletePreviousPsql()

    // start postgres container and wait for it to be ready
    const container = await new GenericContainer('postgres', '12')
      .withName(postgresContainerName)
      .withEnv('POSTGRES_PASSWORD', DEFAULT_DATABASE_CONFIG.password)
      .withEnv('POSTGRES_USER', DEFAULT_DATABASE_CONFIG.user)
      .withExposedPorts(E2ETestEnvironment.POSTGRES_PORT)
      .withWaitStrategy(new PostgresWaitStrategy())
      .start()

    globalThis.__POSTGRES_CONTAINER__ = container
    // get mapped port to be used for testing purposes
    process.env.MAPPED_POSTGRES_PORT = container.getMappedPort(E2ETestEnvironment.POSTGRES_PORT).toString()
  }
}

/** During startup, the db is restarted, so we need to wait for the log message twice */
class PostgresWaitStrategy extends LogWaitStrategy {
  private static LOG = 'database system is ready to accept connections'
  constructor() {
    super(PostgresWaitStrategy.LOG)
  }

  public async waitUntilReady(container: Container): Promise<void> {
    let counter = 0
    return new Promise(async (resolve, reject) => {
      const stream = await container.logs()
      stream
        .on('data', (line) => {
          if (line.toString().includes(PostgresWaitStrategy.LOG)) {
            counter++
            if (counter === 2) {
              resolve()
            }
          }
        })
        .on('err', (line) => {
          if (line.toString().includes(PostgresWaitStrategy.LOG)) {
            counter++
            if (counter === 2) {
              resolve()
            }
          }
        })
        .on('end', () => {
          reject()
        })
    })
  }
}

export default globalSetup
