import { ILoggerComponent } from '@well-known-components/interfaces'

export function createLogComponentMock(): ILoggerComponent {
  return {
    getLogger(_: string) {
      return {
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        info: jest.fn(),
        debug: jest.fn()
      }
    }
  }
}
