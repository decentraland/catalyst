import { createTestMetricsComponent } from '@dcl/metrics'
import { createConfigComponent } from '@well-known-components/env-config-provider'
import { ILoggerComponent } from '@well-known-components/interfaces'
import { createLogComponent } from '@well-known-components/logger'
import { Environment, EnvironmentConfig, parsePgPoolSize } from '../../../../src/Environment'
import { metricsDeclaration } from '../../../../src/metrics'

// Capture the config every `new Pool(...)` is constructed with, without opening real connections.
const mockPoolConfigs: Array<Record<string, unknown>> = []
jest.mock('pg', () => {
  const actual = jest.requireActual('pg')
  return {
    ...actual,
    Pool: jest.fn().mockImplementation((config: Record<string, unknown>) => {
      mockPoolConfigs.push(config)
      return { connect: jest.fn(), query: jest.fn(), end: jest.fn(), on: jest.fn() }
    })
  }
})

import { createDatabaseComponent } from '../../../../src/adapters/database'

describe('createDatabaseComponent', () => {
  let logs: ILoggerComponent
  let metrics: ReturnType<typeof createTestMetricsComponent>

  beforeEach(async () => {
    mockPoolConfigs.length = 0
    logs = await createLogComponent({ config: createConfigComponent({ LOG_LEVEL: 'DEBUG' }) })
    metrics = createTestMetricsComponent(metricsDeclaration)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('when PG_POOL_SIZE is configured', () => {
    let env: Environment

    beforeEach(async () => {
      env = new Environment()
      env.setConfig(EnvironmentConfig.PG_POOL_SIZE, 37)
      await createDatabaseComponent({ logs, env, metrics })
    })

    it('should create the main pool with that value as its max connection count', () => {
      expect(mockPoolConfigs[0]).toEqual(expect.objectContaining({ max: 37 }))
    })
  })
})

describe('parsePgPoolSize', () => {
  describe('when the value is unset', () => {
    let result: number

    beforeEach(() => {
      result = parsePgPoolSize(undefined)
    })

    it('should default to 20', () => {
      expect(result).toBe(20)
    })
  })

  describe('when the value is a valid positive integer', () => {
    let result: number

    beforeEach(() => {
      result = parsePgPoolSize('50')
    })

    it('should return the parsed value', () => {
      expect(result).toBe(50)
    })
  })

  describe('when the value is zero', () => {
    let result: number

    beforeEach(() => {
      result = parsePgPoolSize('0')
    })

    it('should floor at 1', () => {
      expect(result).toBe(1)
    })
  })

  describe('when the value is negative', () => {
    let result: number

    beforeEach(() => {
      result = parsePgPoolSize('-5')
    })

    it('should floor at 1', () => {
      expect(result).toBe(1)
    })
  })

  describe('when the value is not a number', () => {
    let result: number

    beforeEach(() => {
      result = parsePgPoolSize('not-a-number')
    })

    it('should fall back to the default of 20', () => {
      expect(result).toBe(20)
    })
  })
})
