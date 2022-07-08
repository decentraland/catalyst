import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
// import { createServerComponent, createStatusCheckComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
// import { createMetricsComponent } from '@well-known-components/metrics'
import { Environment } from './Environment'
// import { metricDeclarations } from './metrics2'
// import { createFetchComponent } from './ports/fetch'
import { AppComponents } from './types'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })
  const logs = createLogComponent({})
  // const server = await createServerComponent<GlobalContext>({ config, logs }, {})
  // const statusChecks = await createStatusCheckComponent({ server, config })
  // const fetch = await createFetchComponent()
  // const metrics = await createMetricsComponent(metricDeclarations, { server, config })

  const env = await Environment.getInstance()

  console.log(env.configs)

  return {
    config,
    logs,
    // server,
    // statusChecks,
    // fetch,
    // metrics,
    env
  }
}
