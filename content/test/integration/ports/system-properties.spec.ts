import { createSystemProperties, SYSTEM_PROPERTIES } from '../../../src/ports/system-properties'
import { TestProgram } from '../TestProgram'
import { createDefaultServer } from '../simpleTestEnvironment'

describe('system properties - ', () => {
  let server: TestProgram

  beforeAll(async () => {
    server = await createDefaultServer()
  })

  afterAll(async () => {
    vi.restoreAllMocks()
  })

  it('test values', async () => {
    const systemProperties = createSystemProperties(server.components)

    let gc_time = await systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
    expect(gc_time).toBeUndefined()

    await systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, 1234)
    gc_time = await systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
    expect(gc_time).toEqual(1234)

    await systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, 1234)
    await systemProperties.set(SYSTEM_PROPERTIES.lastGarbageCollectionTime, 5678)
    gc_time = await systemProperties.get(SYSTEM_PROPERTIES.lastGarbageCollectionTime)
    expect(gc_time).toEqual(5678)
  })
})
