import { Lifecycle } from '@well-known-components/interfaces'
import { exec } from 'child_process'
import { promisify } from 'util'
import { EnvironmentConfig } from './Environment'
import { bootstrapFromSnapshots } from './service/synchronization/bootstrapFromSnapshots'
import { cleanSnapshots } from './snapshotCleaner'
import { AppComponents } from './types'
const promifiedExec = promisify(exec)

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents>): Promise<void> {
  const { components, startComponents } = program

  await cleanSnapshots(promifiedExec, components, components.staticConfigs.contentStorageFolder, 50)

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
