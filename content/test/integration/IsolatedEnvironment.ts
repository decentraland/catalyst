import { createTestMetricsComponent } from '@well-known-components/metrics'
import { metricsDeclaration } from '../../src/metrics'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { createLogComponent } from '@well-known-components/logger'
import { DEFAULT_DATABASE_CONFIG, Environment, EnvironmentBuilder, EnvironmentConfig } from '../../src/Environment'
import { AppComponents } from '../../src/types'
import { createDatabaseComponent } from '../../src/ports/postgres'
import { TestProgram } from './TestProgram'
import { stopAllComponents } from '../../src/logic/components-lifecycle'
// import { MockedDAOClient } from '../helpers/service/synchronization/clients/MockedDAOClient'

function getTestEnvironmentConfiguration(): EnvironmentBuilder {
  const port = process.env.MAPPED_POSTGRES_PORT ? parseInt(process.env.MAPPED_POSTGRES_PORT) : 5432
  const environmentBuilder = new EnvironmentBuilder()
    .withConfig(EnvironmentConfig.PSQL_PASSWORD, DEFAULT_DATABASE_CONFIG.password)
    .withConfig(EnvironmentConfig.PSQL_USER, DEFAULT_DATABASE_CONFIG.user)
    .withConfig(EnvironmentConfig.PSQL_PORT, port)
    .withConfig(EnvironmentConfig.PSQL_SCHEMA, 'e2etest')
    .withConfig(EnvironmentConfig.PSQL_HOST, '127.0.0.1')
    .withConfig(EnvironmentConfig.LOG_REQUESTS, false)
    .withConfig(EnvironmentConfig.LOG_LEVEL, 'WARN')
    .withConfig(EnvironmentConfig.BOOTSTRAP_FROM_SCRATCH, false)

  return environmentBuilder
}

async function getComponents(environment: Environment): Promise<Partial<AppComponents>> {
  const metrics = createTestMetricsComponent(metricsDeclaration)
  const config = createConfigComponent({ LOG_LEVEL: 'WARN' })
  const logs = await createLogComponent({ config })
  const database = await createDatabaseComponent(
    { logs, env: environment, metrics },
    { idleTimeoutMillis: 10000, query_timeout: 10000 }
  )
  if (database.start) await database.start()
  //   const dao = MockedDAOClient.withAddresses() daoClient
  // const daoClient = MockedDAOClient.withAddresses()

  return { metrics, config, logs, database }
}

export async function createTestEnvironment() {
  let environmentBuilder = getTestEnvironmentConfiguration()
  let components = await getComponents(await environmentBuilder.build())
  let spawnedEnvironments: { server: TestProgram; url: string; port: number; databaseName: string }[] = []

  return {
    async spawnServer(overridenConfig: { key: EnvironmentConfig; value: any }[] = []): Promise<TestProgram> {
      let portAllocated = false
      let calculatedUniquePort = spawnedEnvironments.length * 1010 + 6060
      let serverDatabaseName = 'db_' + calculatedUniquePort

      do {
        try {
          await components.database!.query(`CREATE DATABASE ${serverDatabaseName}`)
          portAllocated = true
        } catch (error) {
          console.log(`Port ${calculatedUniquePort} is already in use`)
          ++calculatedUniquePort
          serverDatabaseName = 'db_' + calculatedUniquePort
        }
      } while (!portAllocated)

      environmentBuilder
        .withConfig(EnvironmentConfig.HTTP_SERVER_PORT, calculatedUniquePort)
        .withConfig(
          EnvironmentConfig.STORAGE_ROOT_FOLDER,
          `${process.env.STORAGE_ROOT_FOLDER ?? 'storage'}/${serverDatabaseName}`
        )
        .withConfig(EnvironmentConfig.PSQL_DATABASE, serverDatabaseName)

      overridenConfig.forEach((config) => environmentBuilder.withConfig(config.key, config.value))

      const serverComponents = await environmentBuilder.buildConfigAndComponents()
      serverComponents.daoClient.getAllContentServers = jest.fn().mockResolvedValue([
        {
          address: `http://127.0.0.1:${calculatedUniquePort}`,
          owner: '0xCatalyst_owner_address_1',
          id: '0'
        }
      ])

      const server = new TestProgram(serverComponents)
      spawnedEnvironments.push({
        server,
        url: `http://127.0.0.1:${calculatedUniquePort}`,
        port: calculatedUniquePort,
        databaseName: serverDatabaseName
      })

      return server
    },
    async clean(): Promise<void> {
      // await components.database?.query(`
      //   DROP SCHEMA IF EXISTS e2etest CASCADE
      // `)
      await Promise.all(
        spawnedEnvironments.map((spawnedEnvironment) =>
          components.database?.query(`DROP DATABASE IF EXISTS ${spawnedEnvironment.databaseName}`)
        )
      )
      await stopAllComponents(components)
      await Promise.all(spawnedEnvironments.map((spawnedServer) => spawnedServer.server.stopProgram()))
      spawnedEnvironments = []
      components = undefined as any
      environmentBuilder = undefined as any
    }
  }
}
