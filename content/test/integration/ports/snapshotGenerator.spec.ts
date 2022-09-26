import { IBaseComponent } from '@well-known-components/interfaces'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('snapshot generator - ', (testEnv) => {

  testCaseWithComponents(
    testEnv,
    'should generate and store snapshots',
    async (components) => {
      const startOptions = { started: jest.fn(), live: jest.fn(), getComponents: jest.fn() }
      await startComponent(components.database, startOptions)
      await startComponent(components.fs as IBaseComponent, startOptions)
      await startComponent(components.metrics as IBaseComponent, startOptions)
      await startComponent(components.storage as IBaseComponent, startOptions)
      await startComponent(components.logs as IBaseComponent, startOptions)
      await startComponent(components.denylist as IBaseComponent, startOptions)
      await startComponent(components.staticConfigs as IBaseComponent, startOptions)
      await startComponent(components.snapshotGenerator, startOptions)
      const snapshots = components.snapshotGenerator.getCurrentSnapshots()
      expect(snapshots).toBeDefined()
      expect(snapshots).not.toHaveLength(0)
      if (snapshots) {
        const exist = await components.storage.existMultiple(snapshots.map(s => s.hash))
        expect(Array.from(exist.values()).every(e => e)).toBeTruthy()
      }
    }
  )
})

async function startComponent(component: IBaseComponent, startOptions: IBaseComponent.ComponentStartOptions) {
  if (component.start) await component.start(startOptions)
}
