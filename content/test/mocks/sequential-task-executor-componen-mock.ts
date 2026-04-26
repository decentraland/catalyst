import { ISequentialTaskExecutorComponent } from '../../src/adapters/sequential-task-executor'

export const createMockedSequentialTaskExecutorComponent = (
  overrides: Partial<jest.Mocked<ISequentialTaskExecutorComponent>> = {}
): jest.Mocked<ISequentialTaskExecutorComponent> => {
  return {
    run: jest.fn(),
    ...overrides
  }
}
