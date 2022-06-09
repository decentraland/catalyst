import { createSystemProperties, SYSTEM_PROPERTIES } from '../../../src/ports/system-properties'
import { loadStandaloneTestEnvironment, testCaseWithComponents } from '../E2ETestEnvironment'

loadStandaloneTestEnvironment()('system properties - ', (testEnv) => {

  testCaseWithComponents(
  testEnv,
  'should system property be present when it was set before',
  async (components) => {
    await components.database.start()
    const systemProperties = createSystemProperties(components)
    await systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, 1234)
    const gc_time = await systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
    expect(gc_time).toEqual(1234)
  }
  )

  testCaseWithComponents(
    testEnv,
    'should system property be undefined when it was not set before',
    async (components) => {
      await components.database.start()
      const systemProperties = createSystemProperties(components)
      const gc_time = await systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
      expect(gc_time).toBeUndefined()
    }
  )

  testCaseWithComponents(
    testEnv,
    'should update system property when it was already set',
    async (components) => {
      await components.database.start()
      const systemProperties = createSystemProperties(components)
      await systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, 1234)
      await systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, 5678)
      const gc_time = await systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
      expect(gc_time).toEqual(5678)
    }
  )
})
