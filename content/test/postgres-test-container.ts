import { exec } from 'child_process'
import Dockerode from 'dockerode'
import { PassThrough } from 'stream'
import { GenericContainer } from 'testcontainers'
import { LogWaitStrategy } from 'testcontainers/dist/wait-strategy'
import { promisify } from 'util'
import { DEFAULT_DATABASE_CONFIG } from '../src/Environment'
import { E2ETestEnvironment } from './integration/E2ETestEnvironment'
const execute = promisify(exec)

const deletePreviousPsql = async (postgresContainerName: string): Promise<void> => {
  const { stderr, stdout } = await execute(`docker rm -f ${postgresContainerName}`)
  if (stderr && !stderr.includes(`Error: No such container: ${postgresContainerName}`)) {
    console.log('Failed to delete the existing postgres container')
  } else if (stdout) {
    console.log('Deleted the previous container')
  }
}

export async function initializePostgresContainer(postgresContainerName: string) {
      await deletePreviousPsql(postgresContainerName)

    // start postgres container and wait for it to be ready
    const container = await new GenericContainer('postgres:12')
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


/** During startup, the db is restarted, so we need to wait for the log message twice */
class PostgresWaitStrategy extends LogWaitStrategy {
  private static LOG = 'database system is ready to accept connections'
  private DOCKERODE = new Dockerode()
  constructor() {
    super(PostgresWaitStrategy.LOG)
  }

  public async waitUntilReady(container: Dockerode.Container): Promise<void> {
    let counter = 0
    return new Promise(async (resolve, reject) => {
      const stream = await container.logs({ stdout: true, stderr: true, follow: true })
      const demuxedStream = new PassThrough({ autoDestroy: true, encoding: "utf-8" });
      this.DOCKERODE.modem.demuxStream(stream, demuxedStream, demuxedStream);
      stream.on("end", () => demuxedStream.end());
      demuxedStream
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
