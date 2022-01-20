import { GenericContainer } from 'testcontainers'
import { Container } from 'testcontainers/dist/container'
import { LogWaitStrategy } from 'testcontainers/dist/wait-strategy'
import { DEFAULT_DATABASE_CONFIG } from './src/Environment'
import { E2ETestEnvironment } from './test/integration/E2ETestEnvironment'
import { isCI } from './test/integration/E2ETestUtils'

const globalSetup = async (): Promise<void> => {
  if (!isCI()) {
    // global.__POSTGRES_CONTAINER__ = await new GenericContainer('postgres', '12')
    const container = await new GenericContainer('postgres', '12')
      .withName('postgres_test')
      .withEnv('POSTGRES_PASSWORD', DEFAULT_DATABASE_CONFIG.password)
      .withEnv('POSTGRES_USER', DEFAULT_DATABASE_CONFIG.user)
      .withExposedPorts(E2ETestEnvironment.POSTGRES_PORT)
      .withWaitStrategy(new PostgresWaitStrategy())
      .start()

      process.env.MAPPED_POSTGRES_PORT = container.getMappedPort(E2ETestEnvironment.POSTGRES_PORT).toString()
      global.__POSTGRES_CONTAINER__ = container
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
