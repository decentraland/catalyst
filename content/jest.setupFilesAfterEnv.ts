import * as logger from '@well-known-components/logger'

if (process.env.LOG_LEVEL === 'off') {
  beforeAll(() => {
    // Mock logger implementation
    const createLogComponent = logger.createConsoleLogComponent
    jest.spyOn(logger, 'createLogComponent').mockImplementation(() => {
      const logComponentMock = createLogComponent()
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
