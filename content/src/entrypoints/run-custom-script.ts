import { createConfigComponent } from '@well-known-components/env-config-provider'
import { Lifecycle } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { createTestMetricsComponent } from '@well-known-components/metrics'
import { EnvironmentBuilder, EnvironmentConfig } from '../Environment'
import { metricsDeclaration } from '../metrics'
import { createDatabaseComponent } from '../ports/postgres'
import { AppComponents } from '../types'
import SQL from 'sql-template-strings'
import { Profile } from '@dcl/schemas'
import { ADR_45_TIMESTAMP } from '@dcl/content-validator/dist/validations/timestamps'

export type CustomScriptComponents = Pick<AppComponents, 'database' | 'env' | 'logs'>

void Lifecycle.run({
  async main(program: Lifecycle.EntryPointParameters<CustomScriptComponents>): Promise<void> {
    const { components, startComponents, stop } = program

    await startComponents()

    await customScript(components)

    await stop()
  },

  async initComponents() {
    const logs = await createLogComponent({
      config: createConfigComponent({
        LOG_LEVEL: 'INFO'
      })
    })
    const metrics = createTestMetricsComponent(metricsDeclaration)
    const env = await new EnvironmentBuilder().withConfig(EnvironmentConfig.PG_QUERY_TIMEOUT, 300_000).build()
    const database = await createDatabaseComponent({ logs, env, metrics })
    return { logs, database }
  }
})

async function customScript({ database, logs }: CustomScriptComponents) {
  const logger = logs.getLogger('run-custom-script')

  const start = Date.now()
  logger.info("Running schema validations on all active profiles' metadata")

  try {
    const result = await database.streamQuery(
      SQL`
      SELECT *
      FROM deployments d
      WHERE entity_type = 'profile'
        AND d.deleter_deployment IS NULL
    `,
      { batchSize: 10 }
    )
    logger.info(`Found ${result} profiles.`)

    let i = 0
    let j = 0
    for await (const deployment of result) {
      if (deployment.entity_timestamp > ADR_45_TIMESTAMP) {
        const validates = Profile.validate(deployment.entity_metadata.v)
        if (!validates) {
          logger.error('Error validating profile', { errors: Profile.validate.errors?.join(', ') || 'unknown' })
          logger.info(
            `Processing deployment id ${deployment.id} for entity id ${deployment.entity_id} ${JSON.stringify(
              deployment.entity_metadata.v
            )} validation: ${Profile.validate.errors?.join(', ')}`
          )
          j++
        }
      }
      i++
    }
    logger.info(`Processed ${i} profiles, of which ${j} are invalid.`)
  } finally {
    logger.info(`Custom script took ${Date.now() - start} ms`)
  }
}
