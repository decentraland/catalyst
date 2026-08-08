import { ILoggerComponent } from '@well-known-components/interfaces'
import { HistoricalDeploymentsRow } from '../../src/adapters/deployments-repository'
import { ThirdPartyItemDeploymentRow } from '../../src/logic/deployments'
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

// Mirrors the third-party materialized view, which exposes `deployment_id` rather than `id`. Keep the
// column names in sync with the view: mocking an `id` here hides content-association bugs in its reader.
export const createThirdPartyItemDeploymentRowMock = (
  overrides?: Partial<jest.Mocked<ThirdPartyItemDeploymentRow>>
): ThirdPartyItemDeploymentRow => {
  const { id: _id, ...rowWithoutId } = createHistoricalDeploymentRowMock(overrides as Partial<HistoricalDeploymentsRow>)
  return {
    ...rowWithoutId,
    deployment_id: overrides?.deployment_id ?? 123,
    content_keys: overrides?.content_keys ?? ['1', '2'],
    content_hashes: overrides?.content_hashes ?? ['hash1', 'hash2']
  }
}
