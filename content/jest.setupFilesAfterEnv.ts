import * as logger from '@well-known-components/logger'
import { createConfigComponent } from '@well-known-components/env-config-provider'

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
