import { Lifecycle } from '@well-known-components/interfaces'
import { EnvironmentConfig } from './Environment'
import { cleanSnapshots } from './logic/snapshot-cleaner'
import { bootstrapFromSnapshots } from './service/synchronization/bootstrapFromSnapshots'
import { AppComponents } from './types'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents>): Promise<void> {
  const { components, startComponents } = program

  await cleanSnapshots(components, components.staticConfigs.contentStorageFolder, 50)

  // first of all, run the migrations
  await components.migrationManager.run()

  // TODO: move this purgeUploadsDirectory method to a standalone function inside src/logic/ folder
  await components.server.purgeUploadsDirectory()

  // start ports: db, listeners, synchronizations, etc
  await startComponents()

  // synchronization
  const disableSynchronization = components.env.getConfig(EnvironmentConfig.DISABLE_SYNCHRONIZATION)

  if (!disableSynchronization) {
    await bootstrapFromSnapshots(components)
    await components.synchronizationManager.syncWithServers()
  }
}
