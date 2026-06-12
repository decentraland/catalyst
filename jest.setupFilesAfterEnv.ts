import { webcrypto } from 'crypto'
import * as logger from '@well-known-components/logger'
import { createConfigComponent } from '@well-known-components/env-config-provider'

// @dcl/crypto (>=3.7) signs via @noble/curves, which needs the Web Crypto global
// `crypto.getRandomValues`. Node 24 exposes it on globalThis in production, but Jest's sandboxed
// `node` environment does not, so provide it for the test runtime.
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as unknown as Crypto
}

// DISABLE LOGS
if (process.env.LOG_LEVEL === 'off') {
  beforeAll(() => {
    // Mock logger implementation
    const createLogComponent = logger.createConsoleLogComponent
    jest.spyOn(logger, 'createLogComponent').mockImplementation(async () => {
      const logComponentMock = await createLogComponent({
        config: createConfigComponent({
          LOG_LEVEL: 'DEBUG'
        })
      })
      const loggerMock = logComponentMock.getLogger('__test__')
      loggerMock.debug = () => {}
      loggerMock.error = () => {}
      loggerMock.info = () => {}
      loggerMock.log = () => {}
      loggerMock.warn = () => {}
      logComponentMock.getLogger = jest.fn(() => loggerMock)
      return logComponentMock
    })
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })
}
