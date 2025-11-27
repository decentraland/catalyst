import { EntityType } from '@dcl/schemas'
import { Deployment } from '../../src/deployment-types'
import { EntityVersion } from '../../src/types'
import { Authenticator } from '@dcl/crypto'

export const createDeploymentMock = (overrides?: Partial<Deployment>): Deployment => {
  return {
    pointers: [],
    entityVersion: EntityVersion.V3,
    entityType: EntityType.SCENE,
    entityId: '123',
    entityTimestamp: 123,
    deployedBy: '123',
    content: [],
    metadata: {},
    auditInfo: {
      version: EntityVersion.V3,
      localTimestamp: 123,
      authChain: Authenticator.createSimpleAuthChain('entityId', 'ethAddress', 'signature')
    },
    ...overrides
  }
}
