import { ILoggerComponent } from '@well-known-components/interfaces'
import { HistoricalDeploymentsRow } from '../../src/logic/database-queries/deployments-queries'
import { EntityType } from '@dcl/schemas'

export function createLogsMockedComponent({
  log = jest.fn(),
  debug = jest.fn(),
  error = jest.fn(),
  info = jest.fn(),
  warn = jest.fn()
}: Partial<jest.Mocked<ReturnType<ILoggerComponent['getLogger']>>> = {}): jest.Mocked<ILoggerComponent> {
  return {
    getLogger: jest.fn().mockReturnValue({
      log,
      debug,
      error,
      info,
      warn
    })
  }
}

export const createHistoricalDeploymentRowMock = (
  overrides?: Partial<jest.Mocked<HistoricalDeploymentsRow>>
): HistoricalDeploymentsRow => ({
  id: 123,
  deployer_address: '123',
  version: '123',
  entity_type: EntityType.SCENE,
  entity_id: '123',
  entity_metadata: { v: { name: '123' } },
  entity_pointers: ['123'],
  local_timestamp: 123,
  auth_chain: [],
  deleter_deployment: 123,
  overwritten_by: '123',
  entity_timestamp: 123,
  ...overrides
})

export const createHistoricalDeploymentRowWithContentMock = (
  overrides?: Partial<jest.Mocked<HistoricalDeploymentsRow & { content_keys: string[]; content_hashes: string[] }>>
): HistoricalDeploymentsRow & { content_keys: string[]; content_hashes: string[] } => ({
  ...createHistoricalDeploymentRowMock(overrides),
  content_keys: overrides?.content_keys ?? ['1', '2'],
  content_hashes: overrides?.content_hashes ?? ['hash1', 'hash2']
})
