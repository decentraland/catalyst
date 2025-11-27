import { ISequentialTaskExecutorComponent } from '../../src/ports/sequecuentialTaskExecutor'

export const createMockedSequentialTaskExecutorComponent = (
  overrides: Partial<jest.Mocked<ISequentialTaskExecutorComponent>> = {}
): jest.Mocked<ISequentialTaskExecutorComponent> => {
  return {
    run: jest.fn(),
    ...overrides
  }
}
