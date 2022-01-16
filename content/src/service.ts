import { Lifecycle } from '@well-known-components/interfaces'
import { EnvironmentConfig } from './Environment'
import { bootstrapFromSnapshots } from './service/synchronization/bootstrapFromSnapshots'
import { AppComponents } from './types'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents>) {
  const { components, startComponents } = program

  // first of all, run the migrations
  await components.migrationManager.run()
  await components.server.purgeUploadsDirectory()

  // start ports: db, listeners, synchronizations, etc
  await startComponents()

  // synchronization
  const disableSynchronization = components.env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION)

  if (!disableSynchronization) {
    await bootstrapFromSnapshots(this.components)
    await components.synchronizationManager.syncWithServers()
  }
}
