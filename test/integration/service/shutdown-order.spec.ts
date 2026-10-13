import { STOP_COMPONENT } from '@well-known-components/interfaces'
import { createDefaultServer } from '../simpleTestEnvironment'
import { TestProgram } from '../TestProgram'

describe('Integration - Shutdown order', () => {
  let server: TestProgram
  let stopped: string[]

  beforeEach(async () => {
    server = await createDefaultServer()
    stopped = []
    for (const name of ['server', 'uploadSpool'] as const) {
      const component = server.components[name] as any
      const stop = component[STOP_COMPONENT].bind(component)
      component[STOP_COMPONENT] = async () => {
        stopped.push(name)
        await stop()
      }
    }
    await server.stopProgram()
  })

  it('should stop the HTTP server before the upload spool it writes to', () => {
    expect(stopped).toEqual(['server', 'uploadSpool'])
  })
})
