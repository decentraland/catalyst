import { IBaseComponent } from '@well-known-components/interfaces'
import { MS_PER_DAY } from '../../../src/logic/time-range'
import { setupTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

describe('snapshot generator - ', () => {
  const getTestEnv = setupTestEnvironment()

  testCaseWithComponents(getTestEnv, 'should generate and store snapshots on startup', async (components) => {
    const startOptions = { started: vi.fn(), live: vi.fn(), getComponents: vi.fn() }
    await startComponent(components.database, startOptions)
    await startComponent(components.fs as IBaseComponent, startOptions)
    await startComponent(components.metrics as IBaseComponent, startOptions)
    await startComponent(components.storage as IBaseComponent, startOptions)
    await startComponent(components.logs as IBaseComponent, startOptions)
    await startComponent(components.denylist as IBaseComponent, startOptions)
    await startComponent(components.staticConfigs as IBaseComponent, startOptions)
    vi.spyOn(components.clock, 'now').mockReturnValue(1577836800000 + MS_PER_DAY + 1)
    await startComponent(components.snapshotGenerator, startOptions)
    const snapshots = components.snapshotGenerator.getCurrentSnapshots()
    expect(snapshots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          timeRange: {
            initTimestamp: 1577836800000,
            endTimestamp: 1577836800000 + MS_PER_DAY
          },
          numberOfEntities: 0,
          replacedSnapshotHashes: []
        })
      ])
    )
    if (snapshots) {
      const exist = await components.storage.existMultiple(snapshots.map((s) => s.hash))
      expect(Array.from(exist.values()).every((e) => e)).toBeTruthy()
    }
  })
})

async function startComponent(component: IBaseComponent, startOptions: IBaseComponent.ComponentStartOptions) {
  if (component.start) await component.start(startOptions)
}
