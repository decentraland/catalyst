import * as tsNode from 'ts-node'
import { isCI } from './test/integration/E2ETestUtils'
import { getDefaultTestServer } from './test/integration/simpleTestEnvironment'

const globalSetup = async (): Promise<void> => {
  if (!isCI()) {
    /**
     * The simple fact of importing 'testcontainers' included in './test/postgres-test-container'
     * triggers thet lib to connect to the Docker client, which fails.
     * So, we need to dynamically import it only if we're not running the tests in CI.
     */
    tsNode.register({ transpileOnly: true })
    const { initializePostgresContainer } = await import('./test/postgres-test-container')
    await initializePostgresContainer('postgres_test')
  }
  global.defaultServer = await getDefaultTestServer()
  console.log('HERE')
}

export default globalSetup
